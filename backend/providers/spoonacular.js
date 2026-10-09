import dotenv from "dotenv";

dotenv.config();

const SPOONACULAR_URL = "https://api.spoonacular.com/food/images/analyze";
const SPOONACULAR_TIMEOUT_MS = 15000;

const confidenceFromProbability = (p) => {
  if (typeof p !== "number") return "low";
  if (p >= 0.7) return "high";
  if (p >= 0.4) return "medium";
  return "low";
};

const round2 = (n) => Math.round(n * 100) / 100;

const MIME_TO_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export const recognizeMeal = async ({ imageBase64, mimeType }) => {
  if (!process.env.SPOONACULAR_API_KEY) {
    throw new Error("[spoonacular] SPOONACULAR_API_KEY не задан в .env");
  }

  const form = new FormData();
  const bytes = Buffer.from(imageBase64, "base64");
  const ext = MIME_TO_EXT[mimeType] ?? "jpg";
  form.append("file", new Blob([bytes], { type: mimeType }), `meal.${ext}`);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPOONACULAR_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(SPOONACULAR_URL, {
      method: "POST",
      headers: { "x-api-key": process.env.SPOONACULAR_API_KEY },
      body: form,
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("[spoonacular] превышен таймаут запроса");
    }
    throw new Error(`[spoonacular] ошибка сети: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 402) {
    throw new Error(
      "[spoonacular] дневная бесплатная квота (50 поинтов) исчерпана, сбросится в полночь UTC",
    );
  }
  if (!response.ok) {
    const bodyText = await response.text().catch(() => "");
    throw new Error(
      `[spoonacular] ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`,
    );
  }

  const data = await response.json();

  const categoryName = data?.category?.name;
  if (!categoryName) {
    return {
      items: [],
      total: { calories: 0, proteins: 0, fats: 0, carbs: 0 },
      confidence: "low",
      note: "Spoonacular не смог классифицировать блюдо на фото.",
    };
  }

  const calories = data?.nutrition?.calories?.value ?? 0;
  const proteins = data?.nutrition?.protein?.value ?? 0;
  const fats = data?.nutrition?.fat?.value ?? 0;
  const carbs = data?.nutrition?.carbs?.value ?? 0;

  return {
    items: [
      {
        name: categoryName,
        weight_g: 0,
        calories: Math.round(calories),
        proteins: round2(proteins),
        fats: round2(fats),
        carbs: round2(carbs),
      },
    ],
    total: {
      calories: Math.round(calories),
      proteins: round2(proteins),
      fats: round2(fats),
      carbs: round2(carbs),
    },
    confidence: confidenceFromProbability(data?.category?.probability),
    note:
      "КБЖУ рассчитано Spoonacular по среднему для распознанного блюда " +
      `("${categoryName}"), а не по оценке веса конкретной порции на фото.`,
  };
};
