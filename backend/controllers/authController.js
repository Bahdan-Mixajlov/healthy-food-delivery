import { db } from "../config/db.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const verificationCodes = new Map();

export const sendCode = async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ message: "Номер телефона обязателен" });
  }

  const code = "1111";

  verificationCodes.set(phone, code);
  setTimeout(() => verificationCodes.delete(phone), 5 * 60 * 1000);

  res.status(200).json({ message: "Код успешно отправлен" });
};

export const verifyCode = async (req, res) => {
  const { phone, code } = req.body;

  if (!phone || !code) {
    return res.status(400).json({ message: "Телефон и код обязательны" });
  }

  const savedCode = verificationCodes.get(phone);

  if (!savedCode || savedCode !== code) {
    return res
      .status(401)
      .json({ message: "Неверный код или срок его действия истек" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT * FROM client WHERE phone_number = ?",
      [phone],
    );
    let client = rows[0];

    if (!client) {
      const [result] = await db.execute(
        "INSERT INTO client (phone_number) VALUES (?)",
        [phone],
      );
      const [newRows] = await db.execute(
        "SELECT * FROM client WHERE id_client = ?",
        [result.insertId],
      );
      client = newRows[0];
    }

    verificationCodes.delete(phone);

    const token = jwt.sign(
      { id: client.id_client, phone: client.phone_number },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(200).json({
      message: "Успешный вход",
      token,
      client: {
        id: client.id_client,
        phone: client.phone_number,
        firstName: client.first_name,
        bonusPoints: client.bonus_points,
      },
    });
  } catch (error) {
    console.error("Ошибка при верификации:", error);
    res.status(500).json({ message: "Внутренняя ошибка сервера" });
  }
};

export const sendCourierCode = async (req, res) => {
  const { phone } = req.body;

  const cleanPhone = phone.trim();

  try {
    const [rows] = await db.execute(
      "SELECT * FROM courier WHERE phone_number = ?",
      [cleanPhone],
    );

    if (rows.length === 0) {
      return res.status(404).json({ message: "Курьер не зарегистрирован" });
    }

    const code = "1111";
    verificationCodes.set(cleanPhone, code);

    res.status(200).json({ message: "Код отправлен" });
  } catch (error) {
    console.error("Ошибка БД:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const verifyCourierCode = async (req, res) => {
  const { phone, code } = req.body;
  const cleanPhone = phone.trim();

  const savedCode = verificationCodes.get(cleanPhone);

  if (!savedCode || savedCode !== code) {
    return res.status(401).json({ message: "Неверный код" });
  }

  try {
    const [rows] = await db.execute(
      "SELECT * FROM courier WHERE phone_number = ?",
      [cleanPhone],
    );
    const courier = rows[0];

    const token = jwt.sign(
      { id: courier.id_courier, role: "courier" },
      process.env.JWT_SECRET,
      { expiresIn: "30d" },
    );

    verificationCodes.delete(cleanPhone);

    res.status(200).json({
      token,
      courier: {
        id: courier.id_courier,
        phone: courier.phone_number,
        firstName: courier.first_name,
        lastName: courier.last_name,
      },
    });
  } catch (error) {
    console.error("Ошибка при входе:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
