import dotenv from "dotenv";

dotenv.config();

const SEGMENTATION_URL =
  "https://api.logmeal.com/v2/image/segmentation/complete";
const NUTRITION_URL =
  "https://api.logmeal.com/v2/nutrition/recipe/nutritionalInfo";
const LOGMEAL_TIMEOUT_MS = 20000;
const LANGUAGE = "eng";
const NOT_FOOD_TYPE_RE = /^(non[\s-]?food|not[\s-]?food)$/i;

const round2 = (n) => Math.round(n * 100) / 100;

const fetchWithTimeout = async (url, options) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOGMEAL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("[logmeal] превышен таймаут запроса");
    }
    throw new Error(`[logmeal] ошибка сети: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
};

const assertOk = async (response, step) => {
  if (response.ok) return;
  const bodyText = await response.text().catch(() => "");
  if (response.status === 429) {
    throw new Error(
      "[logmeal] дневной/месячный лимит бесплатного плана исчерпан",
    );
  }
  throw new Error(
    `[logmeal] ${step}: ${response.status} ${response.statusText}: ${bodyText.slice(0, 200)}`,
  );
};

const nutrient = (info, code) => {
  const value = info?.totalNutrients?.[code]?.quantity;
  return typeof value === "number" ? value : 0;
};

const emptyResult = (note, confidence = "high") => ({
  items: [],
  total: { calories: 0, proteins: 0, fats: 0, carbs: 0 },
  confidence,
  note,
});

export const recognizeMeal = async ({ imageBase64, mimeType }) => {
  if (!process.env.LOGMEAL_API_KEY) {
    throw new Error("[logmeal] LOGMEAL_API_KEY не задан в .env");
  }
  const auth = { Authorization: `Bearer ${process.env.LOGMEAL_API_KEY}` };

  const form = new FormData();
  const bytes = Buffer.from(imageBase64, "base64");
  const ext = mimeType === "image/png" ? "png" : "jpg";
  form.append("image", new Blob([bytes], { type: mimeType }), `meal.${ext}`);

  const segResponse = await fetchWithTimeout(
    `${SEGMENTATION_URL}?language=${LANGUAGE}`,
    { method: "POST", headers: auth, body: form },
  );
  await assertOk(segResponse, "segmentation");
  const segData = await segResponse.json();

  const imageId = segData?.imageId;
  if (typeof imageId !== "number") {
    throw new Error("[logmeal] в ответе сегментации нет числового imageId");
  }

  const foodTypeName = segData?.foodType?.name;
  const hasSegments =
    Array.isArray(segData?.segmentation_results) &&
    segData.segmentation_results.length > 0;
  if (
    !hasSegments ||
    (typeof foodTypeName === "string" &&
      NOT_FOOD_TYPE_RE.test(foodTypeName.trim()))
  ) {
    return emptyResult("LogMeal не нашёл еду на фото.");
  }

  const nutriResponse = await fetchWithTimeout(
    `${NUTRITION_URL}?language=${LANGUAGE}`,
    {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ imageId }),
    },
  );
  await assertOk(nutriResponse, "nutritionalInfo");
  const nutriData = await nutriResponse.json();

  const perItem = nutriData?.nutritional_info_per_item;
  if (!Array.isArray(perItem) || perItem.length === 0) {
    throw new Error(
      "[logmeal] в ответе nutritionalInfo нет nutritional_info_per_item",
    );
  }
  const foodNames = Array.isArray(nutriData.foodName) ? nutriData.foodName : [];

  const rawItems = perItem
    .map((entry, i) => ({ entry, name: foodNames[i] }))
    .filter(
      ({ entry }) =>
        entry?.hasNutritionalInfo !== false && entry?.nutritional_info,
    )
    .map(({ entry, name }) => {
      const info = entry.nutritional_info;
      return {
        name: name || "блюдо (LogMeal)",
        weight_g: entry.serving_size ?? info.serving_size ?? 0,
        calories: nutrient(info, "ENERC_KCAL") || info.calories || 0,
        proteins: nutrient(info, "PROCNT"),
        fats: nutrient(info, "FAT"),
        carbs: nutrient(info, "CHOCDF"),
      };
    });

  if (rawItems.length === 0) {
    return emptyResult(
      "LogMeal не вернул пищевую ценность для найденных блюд.",
      "low",
    );
  }

  const sum = (key) => rawItems.reduce((acc, item) => acc + item[key], 0);

  const items = rawItems.map((item) => ({
    name: item.name,
    weight_g: Math.round(item.weight_g),
    calories: Math.round(item.calories),
    proteins: round2(item.proteins),
    fats: round2(item.fats),
    carbs: round2(item.carbs),
  }));

  return {
    items,
    total: {
      calories: Math.round(sum("calories")),
      proteins: round2(sum("proteins")),
      fats: round2(sum("fats")),
      carbs: round2(sum("carbs")),
    },
    confidence: "medium",
    note: "Вес и КБЖУ — по стандартной порции LogMeal, а не по фактическому весу на фото.",
  };
};
