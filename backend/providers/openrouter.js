import dotenv from "dotenv";
import {
  ALLOWED_MEAL_IMAGE_TYPES,
  buildMealRecognitionPrompt,
  safeJsonParse,
  validateMealRecognition,
} from "./shared/mealRecognition.js";

dotenv.config();

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MODEL = "openrouter/free:free";
const OPENROUTER_TIMEOUT_MS = 25000;

export const recognizeMeal = async ({ imageBase64, mimeType }) => {
  if (!ALLOWED_MEAL_IMAGE_TYPES.includes(mimeType)) {
    throw new Error(`[openrouter] неподдерживаемый тип файла: ${mimeType}`);
  }
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error("[openrouter] OPENROUTER_API_KEY не задан в .env");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
        "X-Title": "Healthy Food App",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: buildMealRecognitionPrompt() },
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${imageBase64}` },
              },
            ],
          },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("[openrouter] превышен таймаут запроса");
    }
    throw new Error(`[openrouter] ошибка сети: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `[openrouter] ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`,
    );
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) {
    throw new Error("[openrouter] пустой ответ модели");
  }

  return validateMealRecognition(safeJsonParse(text));
};
