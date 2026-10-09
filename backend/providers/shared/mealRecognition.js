export const ALLOWED_MEAL_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

export const buildMealRecognitionPrompt = () =>
  `
Ты — нутрициолог-эксперт по распознаванию еды на фото.
Проанализируй фотографию и определи все блюда/продукты на ней.

Для каждой отдельной позиции на фото:
1. Определи название блюда/продукта на русском языке.
2. Оцени вес порции в граммах — ориентируйся на размер тарелки, приборов, руки в кадре, если они видны.
3. Оцени калорийность и БЖУ (белки, жиры, углеводы в граммах) для этого веса порции.

Если на фото несколько отдельных блюд (например, тарелка с гарниром и мясом,
или поднос с несколькими позициями) — верни их как отдельные элементы массива,
а не одну общую оценку.
Если на фото вообще нет еды — верни пустой массив items и объясни это в поле note.

Жидкие блюда (супы, напитки, соусы) оценивать по весу/объёму СЛОЖНЕЕ, чем твёрдую еду,
особенно если в кадре нет ложки, чашки известного объёма, руки или другого ориентира масштаба.
В этом случае ставь confidence не выше "medium" и указывай в note, что оценка веса приблизительная.

Верни ТОЛЬКО валидный JSON без пояснений и markdown, строго в этом формате:
{
  "items": [
    {
      "name": "название блюда",
      "weight_g": число,
      "calories": число,
      "proteins": число,
      "fats": число,
      "carbs": число
    }
  ],
  "confidence": "high" | "medium" | "low",
  "note": "пояснение, если оценка приблизительная, фото нечеткое, или еды не найдено, иначе null"
}
`.trim();

export const safeJsonParse = (text) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("JSON-объект не найден в ответе ИИ");
  return JSON.parse(text.substring(start, end + 1).trim());
};

export const validateMealRecognition = (raw) => {
  const isStr = (v) => typeof v === "string" && v.trim() !== "";
  const posNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  const items = Array.isArray(raw?.items)
    ? raw.items
        .filter((i) => i && isStr(i.name))
        .map((i) => ({
          name: i.name.trim(),
          weight_g: posNum(i.weight_g),
          calories: posNum(i.calories),
          proteins: posNum(i.proteins),
          fats: posNum(i.fats),
          carbs: posNum(i.carbs),
        }))
    : [];

  const total = items.reduce(
    (acc, i) => ({
      calories: acc.calories + i.calories,
      proteins: acc.proteins + i.proteins,
      fats: acc.fats + i.fats,
      carbs: acc.carbs + i.carbs,
    }),
    { calories: 0, proteins: 0, fats: 0, carbs: 0 },
  );

  const VALID_CONFIDENCE = ["high", "medium", "low"];
  const confidence = VALID_CONFIDENCE.includes(raw?.confidence)
    ? raw.confidence
    : "low";

  return {
    items,
    total,
    confidence,
    note: isStr(raw?.note) ? raw.note.trim() : null,
  };
};
