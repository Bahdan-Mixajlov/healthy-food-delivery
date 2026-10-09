import dns from "dns/promises";
import net from "net";
import { db } from "../config/db.js";
import * as aiProvider from "../providers/index.js";

const MAX_URL_LENGTH = 2048;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMAGE_FETCH_TIMEOUT_MS = 10000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

const isPrivateIp = (ip) => {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateIp(v6.slice(7));
  return (
    v6 === "::1" ||
    v6 === "::" ||
    v6.startsWith("fc") ||
    v6.startsWith("fd") ||
    v6.startsWith("fe80")
  );
};

const assertPublicUrl = async (rawUrl) => {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new HttpError(400, "Некорректная ссылка на изображение");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new HttpError(400, "Ссылка должна начинаться с http:// или https://");
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true });
  } catch {
    throw new HttpError(400, "Не удалось определить адрес сервера по ссылке");
  }
  if (addresses.some(({ address }) => isPrivateIp(address))) {
    throw new HttpError(400, "Ссылка недоступна");
  }
};

const downloadImage = async (url) => {
  let response;
  try {
    response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new HttpError(400, "Не удалось загрузить изображение по ссылке");
  }
  if (!response.ok) {
    throw new HttpError(400, "Не удалось загрузить изображение по ссылке");
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_IMAGE_BYTES) {
    throw new HttpError(413, "Изображение слишком большое (максимум 5 МБ)");
  }

  const chunks = [];
  let size = 0;
  try {
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > MAX_IMAGE_BYTES) {
        throw new HttpError(413, "Изображение слишком большое (максимум 5 МБ)");
      }
      chunks.push(chunk);
    }
  } catch (err) {
    if (err instanceof HttpError) throw err;
    throw new HttpError(400, "Не удалось загрузить изображение по ссылке");
  }
  return Buffer.concat(chunks);
};

const sniffMimeType = (buf) => {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  if (
    buf.subarray(0, 4).toString("ascii") === "RIFF" &&
    buf.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
};

const parseItems = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return [];
};

const mapRow = (row) => ({
  id_meal_log: row.id_meal_log,
  image_url: row.image_url,
  items: parseItems(row.items),
  total: {
    calories: Number(row.total_calories),
    proteins: Number(row.total_proteins),
    fats: Number(row.total_fats),
    carbs: Number(row.total_carbs),
  },
  confidence: row.confidence,
  provider: row.provider ?? null,
  note: row.note,
  created_at: row.created_at,
});

export const createMealLog = async (req, res) => {
  if (req.user?.role === "courier") {
    return res.status(403).json({ message: "Доступно только клиентам" });
  }

  const clientId = req.user.id;
  const imageUrl =
    typeof req.body?.image_url === "string" ? req.body.image_url.trim() : "";

  if (!imageUrl || imageUrl.length > MAX_URL_LENGTH) {
    return res
      .status(400)
      .json({ message: "Укажите ссылку на фото в поле image_url" });
  }

  try {
    await assertPublicUrl(imageUrl);
    const imageBuffer = await downloadImage(imageUrl);

    const mimeType = sniffMimeType(imageBuffer);
    if (!mimeType) {
      throw new HttpError(
        415,
        "Поддерживаются только изображения JPEG, PNG и WebP",
      );
    }

    let recognition;
    try {
      // Какой именно провайдер отработает (gemini / openrouter / spoonacular)
      // решает providers/index.js по настройке meal_recognition_provider
      // в таблице setting — контроллер об этом не знает.
      recognition = await aiProvider.recognizeMeal({
        imageBase64: imageBuffer.toString("base64"),
        mimeType,
        imageUrl,
      });
    } catch (err) {
      console.error("[createMealLog] ошибка распознавания:", err.message);
      throw new HttpError(
        502,
        "Сервис распознавания временно недоступен, попробуйте позже",
      );
    }

    const { items, total, confidence, note, provider } = recognition;

    if (items.length === 0) {
      return res.status(422).json({ message: "Еда на фото не найдена", note });
    }

    const totalCalories = Math.round(total.calories);
    const totalProteins = round2(total.proteins);
    const totalFats = round2(total.fats);
    const totalCarbs = round2(total.carbs);

    const [result] = await db.execute(
      `INSERT INTO meal_log
        (id_client, image_url, items, total_calories, total_proteins, total_fats, total_carbs, confidence, provider, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clientId,
        imageUrl,
        JSON.stringify(items),
        totalCalories,
        totalProteins,
        totalFats,
        totalCarbs,
        confidence,
        provider ?? null,
        note,
      ],
    );

    const [rows] = await db.execute(
      "SELECT created_at FROM meal_log WHERE id_meal_log = ?",
      [result.insertId],
    );

    res.status(201).json({
      id_meal_log: result.insertId,
      image_url: imageUrl,
      items,
      total: {
        calories: totalCalories,
        proteins: totalProteins,
        fats: totalFats,
        carbs: totalCarbs,
      },
      confidence,
      provider: provider ?? null,
      note,
      created_at: rows[0].created_at,
    });
  } catch (error) {
    if (error instanceof HttpError) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error("[createMealLog]", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getClientMealLog = async (req, res) => {
  if (req.user?.role === "courier") {
    return res.status(403).json({ message: "Доступно только клиентам" });
  }

  const clientId = req.user.id;
  const date = typeof req.query?.date === "string" ? req.query.date : "";

  if (!DATE_RE.test(date)) {
    return res
      .status(400)
      .json({ message: "Параметр date обязателен, формат YYYY-MM-DD" });
  }

  try {
    const [rows] = await db.execute(
      `SELECT id_meal_log, image_url, items, total_calories, total_proteins,
              total_fats, total_carbs, confidence, provider, note, created_at
       FROM meal_log
       WHERE id_client = ? AND DATE(created_at) = ?
       ORDER BY created_at DESC`,
      [clientId, date],
    );

    res.status(200).json(rows.map(mapRow));
  } catch (error) {
    console.error("[getClientMealLog]", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const deleteMealLog = async (req, res) => {
  if (req.user?.role === "courier") {
    return res.status(403).json({ message: "Доступно только клиентам" });
  }

  const clientId = req.user.id;
  const { id } = req.params;

  if (!Number.isFinite(Number(id))) {
    return res.status(400).json({ message: "Некорректный id записи" });
  }

  try {
    const [result] = await db.execute(
      "DELETE FROM meal_log WHERE id_meal_log = ? AND id_client = ?",
      [id, clientId],
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Запись не найдена" });
    }

    res.status(200).json({ message: "Запись удалена" });
  } catch (error) {
    console.error("[deleteMealLog]", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
