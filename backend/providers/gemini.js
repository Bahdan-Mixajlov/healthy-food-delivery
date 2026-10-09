import { GoogleGenerativeAI } from "@google/generative-ai";
import { LRUCache } from "lru-cache";
import dotenv from "dotenv";
import { encode as toToon, decode as toonDecode } from "@toon-format/toon";
import {
  ALLOWED_MEAL_IMAGE_TYPES,
  buildMealRecognitionPrompt,
  validateMealRecognition,
} from "./shared/mealRecognition.js";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  throw new Error("[gemini] GEMINI_API_KEY не задан в .env");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const MODEL_NAME = "gemini-3.1-flash-lite";
const GEMINI_TIMEOUT_MS = 8000;
const GEMINI_VISION_TIMEOUT_MS = 20000;
const GEMINI_RETRIES = 1;
const GEMINI_CACHE_TTL_MS = 15 * 60 * 1000;
const GEMINI_CACHE_MAX = 500;
const RANK_DESC_TRUNCATE = 60;
const SERIALIZATION_FORMAT = "toon";

const serializeData = (data) =>
  SERIALIZATION_FORMAT === "toon" ? toToon(data) : JSON.stringify(data);

const geminiCache = new LRUCache({
  max: GEMINI_CACHE_MAX,
  ttl: GEMINI_CACHE_TTL_MS,
});

const normalizeQueryKey = (q) =>
  q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!?.,']/g, "");

const safeJsonParse = (text) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("JSON-объект не найден в ответе ИИ");
  return JSON.parse(text.substring(start, end + 1).trim());
};

const safeToonDecode = (rawText) => {
  const cleaned = rawText
    .replace(/```[a-zA-Z0-9]*\n?/g, "")
    .replace(/```/g, "")
    .trim();

  try {
    const parsed = toonDecode(cleaned);
    return {
      search_params:
        parsed?.search_params && typeof parsed.search_params === "object"
          ? parsed.search_params
          : null,
      search_slots: Array.isArray(parsed?.search_slots)
        ? parsed.search_slots
        : null,
      recommendation:
        typeof parsed?.recommendation === "string"
          ? parsed.recommendation
          : null,
      not_found_message:
        typeof parsed?.not_found_message === "string"
          ? parsed.not_found_message
          : null,
    };
  } catch (err) {
    console.error(
      "[safeToonDecode] сбой разбора TOON-ответа модели, откат к дефолтам:",
      err.message,
    );
    return {
      search_params: null,
      search_slots: null,
      recommendation: null,
      not_found_message:
        "Извините, произошла техническая ошибка при обработке ответа. Попробуйте переформулировать запрос.",
    };
  }
};

export const validateSearchParams = (raw) => {
  const empty = {
    search_query: null,
    exclude_query: null,
    min_calories: null,
    max_calories: null,
    min_proteins: null,
    max_price: null,
    category: null,
    sort_by: null,
    query_logic: "OR",
    is_vegetarian: null,
    is_vegan: null,
    is_gluten_free: null,
    is_dairy_free: null,
    is_spicy: null,
    cooking_method: null,
    meal_time: null,
  };
  if (!raw || typeof raw !== "object") return empty;

  const isStr = (v) =>
    typeof v === "string" &&
    v.trim() !== "" &&
    v.trim().toLowerCase() !== "null";

  const posNum = (v) => {
    const n = Number(v);
    return Number.isFinite(n) &&
      String(v).trim().toLowerCase() !== "null" &&
      n > 0
      ? n
      : null;
  };

  const bool = (v) => (v === true || v === "true" ? true : null);

  const VALID_SORTS = ["price_asc", "price_desc", "kcal_asc", "kcal_desc"];
  const rawSort = isStr(raw.sort_by) ? raw.sort_by.trim().toLowerCase() : null;
  const rawLogic = isStr(raw.query_logic)
    ? raw.query_logic.trim().toUpperCase()
    : "OR";

  const VALID_COOKING = [
    "запеченное",
    "вареное",
    "жареное",
    "на пару",
    "сырое",
    "тушеное",
  ];
  const VALID_MEAL = ["завтрак", "обед", "ужин", "перекус"];
  const rawCooking = isStr(raw.cooking_method)
    ? raw.cooking_method.trim().toLowerCase()
    : null;
  const rawMeal = isStr(raw.meal_time)
    ? raw.meal_time.trim().toLowerCase()
    : null;

  return {
    search_query: isStr(raw.search_query) ? raw.search_query.trim() : null,
    exclude_query: isStr(raw.exclude_query) ? raw.exclude_query.trim() : null,
    min_calories: posNum(raw.min_calories),
    max_calories: posNum(raw.max_calories),
    min_proteins: posNum(raw.min_proteins),
    max_price: posNum(raw.max_price),
    category: isStr(raw.category) ? raw.category.trim() : null,
    sort_by: VALID_SORTS.includes(rawSort) ? rawSort : null,
    query_logic: rawLogic === "AND" ? "AND" : "OR",
    is_vegetarian: bool(raw.is_vegetarian),
    is_vegan: bool(raw.is_vegan),
    is_gluten_free: bool(raw.is_gluten_free),
    is_dairy_free: bool(raw.is_dairy_free),
    is_spicy: bool(raw.is_spicy),
    cooking_method: VALID_COOKING.includes(rawCooking) ? rawCooking : null,
    meal_time: VALID_MEAL.includes(rawMeal) ? rawMeal : null,
  };
};

export const validateSearchSlots = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const slots = raw
    .map(validateSearchParams)
    .filter((s) => s.search_query || s.category || s.exclude_query);
  return slots.length >= 2 ? slots : null;
};

const geminiWithRetry = async (
  fn,
  retries = GEMINI_RETRIES,
  ms = GEMINI_TIMEOUT_MS,
) => {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await Promise.race([
        fn(),
        new Promise((_, rej) =>
          setTimeout(() => rej(new Error("Gemini timeout")), ms),
        ),
      ]);
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(
        `[geminiWithRetry] попытка ${attempt + 1} провалилась:`,
        err.message,
      );
      await new Promise((r) => setTimeout(r, 500));
    }
  }
};

export const buildInterpretedLabel = (p) => {
  const parts = [];
  if (p.search_query) parts.push(`поиск: "${p.search_query}"`);
  if (p.exclude_query) parts.push(`без: "${p.exclude_query}"`);
  if (p.category) parts.push(`категория: ${p.category}`);
  if (p.min_calories) parts.push(`ккал от ${p.min_calories}`);
  if (p.max_calories) parts.push(`ккал до ${p.max_calories}`);
  if (p.min_proteins) parts.push(`белок ≥ ${p.min_proteins} г`);
  if (p.max_price) parts.push(`цена ≤ ${p.max_price} BYN`);
  if (p.is_vegetarian) parts.push("вегетарианское");
  if (p.is_gluten_free) parts.push("без глютена");
  if (p.is_dairy_free) parts.push("без молочного");
  if (p.is_spicy) parts.push("острое");
  if (p.cooking_method) parts.push(p.cooking_method);
  if (p.meal_time) parts.push(p.meal_time);
  if (p.sort_by) parts.push(`сортировка: ${p.sort_by}`);
  return parts.join(", ") || "все блюда";
};

export const buildHistoryContext = (history) => {
  if (!history.length) return "";
  const rows = history.map((h) => ({
    role: h.role,
    content: h.content.slice(0, 150),
    filters: h.search_params ? buildInterpretedLabel(h.search_params) : "",
  }));
  return (
    `\nИстория диалога (формат ${SERIALIZATION_FORMAT.toUpperCase()}):\n` +
    serializeData(rows) +
    "\n"
  );
};

const toCandidatePayload = (rows) =>
  rows.map((d) => ({
    id: d.id,
    title: d.title,
    description: d.description
      ? d.description.slice(0, RANK_DESC_TRUNCATE)
      : null,
    price: d.price,
    calories: d.calories,
    proteins: d.proteins,
  }));

const buildRankingPrompt = (query, candidates, historyContext, limit) =>
  `
Ты — нутрициолог-консультант приложения доставки здоровой еды.
Запрос пользователя: "${query}"
${historyContext}

Список блюд-кандидатов (уже прошли базовую фильтрацию по бюджету/категории/КБЖУ),
в формате ${SERIALIZATION_FORMAT.toUpperCase()} (поля: id, title, description, price, calories, proteins):

${serializeData(candidates)}

Выбери и упорядочи по релевантности до ${limit} блюд, которые лучше всего
соответствуют смыслу запроса — учитывай нюансы, которые не ловятся обычным
поиском по словам: повод, настроение, сочетаемость, степень соответствия теме.
Если ни одно блюдо не подходит — верни пустой массив.

Верни ТОЛЬКО валидный JSON без пояснений и markdown:
{
  "selected_ids": [число, число, ...],
  "recommendation": "2-3 предложения, аппетитно, на вы, без цен, или null"
}
`.trim();

const SEARCH_PARAMS_RULES = (categories) =>
  `
ПРАВИЛА для search_params / слота:
0. СНАЧАЛА исправь очевидные опечатки ...

1. "search_query" — максимум 3–4 ключевых слова в именительном падеже.
   НЕ раскрывай группы продуктов в списки синонимов — пиши одно общее слово:
   "фрукты" (не "яблоки бананы манго персики"), "ягоды" (не "клубника малина черника").
   Абстракции ("вкусное", "полезное") → null.
   Синонимы пиши вместе только для неоднозначных слов: "помидоры томаты".

2. "exclude_query" — ТОЛЬКО исключения. Никогда не пиши "без", "не" в search_query.
   В exclude_query — раскрывай группы ПОЛНОСТЬЮ:
   * без ягод    → "ягоды клубника малина черника голубика брусника вишня ежевика"
   * без фруктов    → "фрукты яблоки бананы манго персики груши киви ананасы апельсины лимоны"
   * без орехов     → "орехи кешью миндаль арахис кокос семечки фисташки фундук грецкий"
   * без овощей     → "овощи помидоры томаты огурцы перец перцы морковь лук чеснок капуста баклажаны кабачки"
   * без мяса       → "мясо курица индейка говядина свинина бекон стейк колбаса фарш сосиски"
   * без молочного  → "молоко сыр творог сметана кефир йогурт сливки масло"
   * без глютена    → "мука хлеб макароны паста лапша блины тесто выпечка пшеница"

3. Числовые фильтры:
   "около N ккал" / "примерно N ккал" → min_calories: N*0.8, max_calories: N*1.2
   "не больше N"   → max_calories: N, min_calories: null
   "от N до M"     → min_calories: N, max_calories: M
   "с высоким белком" → min_proteins: 25
   "богатое белком"   → min_proteins: 20

4. Флаги (true только при явном запросе):
   вегетарианское/без мяса и рыбы → is_vegetarian: true
   веганское                       → is_vegan: true
   без глютена/безглютеновое       → is_gluten_free: true
   без молочного/безлактозное      → is_dairy_free: true
   острое/пикантное/с перцем чили  → is_spicy: true

5. cooking_method:
   запеченное/в духовке/в фольге → "запеченное"
   вареное/отварное              → "вареное"
   на пару/паровое               → "на пару"
   жареное/на гриле/на сковороде → "жареное"
   тушеное/в соусе               → "тушеное"
   сырое/без термообработки      → "сырое"
   Иначе → null

6. meal_time (если явно упомянуто время суток):
   на завтрак / утром            → "завтрак"
   на обед / в обед              → "обед"
   на ужин / вечером             → "ужин"
   перекус / снэк                → "перекус"
   Иначе → null (category уже отвечает за это)

7. "category" — строго точное название из: ${categories.join(", ")}. Иначе null.

8. "sort_by":
   дешёвое/бюджетное → "price_asc"  |  дорогое → "price_desc"
   лёгкое/диетическое → "kcal_asc"  |  калорийное/сытное → "kcal_desc"

9. "query_logic":
   AND — одно составное блюдо ("каша с ягодами", "стейк из свинины")
   OR  — несколько разных блюд ("чай или сок", "суп или салат")
`.trim();

const buildParserPrompt = (query, categories) =>
  `
Ты — ИИ-парсер для поиска здоровой еды. Проанализируй запрос на русском языке.
Верни ТОЛЬКО валидный JSON без пояснений и markdown:
{
  "search_query":  "слова для поиска или null",
  "exclude_query": "слова для исключения или null",
  "min_calories":  число или null,
  "max_calories":  число или null,
  "min_proteins":  число или null,
  "max_price":     число или null,
  "category":      "точное название категории или null",
  "sort_by":       "price_asc" | "price_desc" | "kcal_asc" | "kcal_desc" | null,
  "query_logic":   "AND" | "OR",
  "is_vegetarian": true | null,
  "is_vegan":      true | null,
  "is_gluten_free":true | null,
  "is_dairy_free": true | null,
  "is_spicy":      true | null,
  "cooking_method":"запеченное" | "вареное" | "жареное" | "на пару" | "сырое" | "тушеное" | null,
  "meal_time":     "завтрак" | "обед" | "ужин" | "перекус" | null
}

${SEARCH_PARAMS_RULES(categories)}

Запрос: "${query}"
`.trim();

const TOON_SINGLE_EXAMPLE = toToon({
  search_params: {
    search_query: "лёгкий обед",
    exclude_query: null,
    min_calories: null,
    max_calories: 400,
    min_proteins: null,
    max_price: null,
    category: null,
    sort_by: null,
    query_logic: "OR",
    is_vegetarian: true,
    is_vegan: null,
    is_gluten_free: null,
    is_dairy_free: null,
    is_spicy: null,
    cooking_method: null,
    meal_time: "обед",
  },
  search_slots: null,
  recommendation: "Отличный выбор! Рекомендую лёгкий салат или боул.",
  not_found_message: null,
});

const TOON_MULTISLOT_EXAMPLE = toToon({
  search_params: null,
  search_slots: [
    {
      search_query: "мясо стейк курица",
      exclude_query: null,
      category: null,
      query_logic: "OR",
      max_calories: null,
      min_proteins: null,
      max_price: null,
    },
    {
      search_query: "салат",
      exclude_query: null,
      category: null,
      query_logic: "OR",
      max_calories: null,
      min_proteins: null,
      max_price: null,
    },
  ],
  recommendation: "Вот отличный обед!",
  not_found_message: null,
});

const buildChatPrompt = (query, categories, historyContext) =>
  `
Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Проанализируй текущий запрос с учётом истории и верни ответ СТРОГО в формате TOON.
Никакого markdown, никаких оберток \`\`\`, никакого текста до или после — только сам TOON.
Ответ ВСЕГДА содержит ровно эти 4 верхнеуровневых ключа:
search_params, search_slots, recommendation, not_found_message.

Пример обычного ответа (search_slots: null):
${TOON_SINGLE_EXAMPLE}

Пример мульти-слот ответа (search_params: null, несколько позиций сразу):
${TOON_MULTISLOT_EXAMPLE}

СТРОГО следуй этому синтаксису: отступ в 2 пробела для вложенных полей,
табличный заголовок вида search_slots[N]{поле1,поле2,...}: для массива слотов.

Доступные категории: ${categories.join(", ")}.
${historyContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
МУЛЬТИ-СЛОТ (search_slots)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Используй search_slots ВМЕСТО search_params ТОЛЬКО если пользователь явно просит
несколько разных позиций одновременно: "мясное + салат + напиток", "суп + горячее + десерт".
При мульти-слоте → search_params: null.
В остальных случаях → search_slots: null.

${SEARCH_PARAMS_RULES(categories)}

ПРАВИЛА ИСТОРИИ:
- Уточнение ("а подешевле", "без лука", "добавь is_gluten_free") → корректируй только нужный фильтр.
- Смена темы → сбрось все фильтры.

ПРАВИЛА ТЕКСТОВЫХ ПОЛЕЙ:
- "recommendation": 2–3 предложения, аппетитно, на "вы", без цен.
- "not_found_message": теоретический вопрос → научный ответ нутрициолога 3–5 предл.;
  еда не найдена → вежливо извинись, предложи конкретную альтернативу.

Запрос: "${query}"
`.trim();

export const parseQuery = async (query, categories) => {
  const cacheKey = `parser::${normalizeQueryKey(query)}::${categories.join(",")}`;
  if (geminiCache.has(cacheKey)) {
    return { result: geminiCache.get(cacheKey), cached: true };
  }
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = buildParserPrompt(query, categories);

  const raw = await geminiWithRetry(() => model.generateContent(prompt));

  const result = validateSearchParams(safeJsonParse(raw.response.text()));
  geminiCache.set(cacheKey, result);
  return { result, cached: false };
};

export const chat = async (query, categories, history) => {
  const cacheKey =
    history.length === 0
      ? `chat::${normalizeQueryKey(query)}::${categories.join(",")}`
      : null;

  if (cacheKey && geminiCache.has(cacheKey)) {
    return { ...geminiCache.get(cacheKey), cached: true };
  }

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
  });
  const historyText = buildHistoryContext(history);

  const prompt = buildChatPrompt(query, categories, historyText);

  const raw = await geminiWithRetry(() => model.generateContent(prompt));

  const parsed = safeToonDecode(raw.response.text());
  parsed.search_params = validateSearchParams(parsed.search_params);
  parsed.search_slots = validateSearchSlots(parsed.search_slots);

  if (cacheKey) geminiCache.set(cacheKey, parsed);
  return { ...parsed, cached: false };
};

export const rankCandidates = async (
  query,
  candidates,
  limit,
  historyContext = "",
) => {
  if (candidates.length === 0) return { selectedIds: [], recommendation: null };

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json" },
  });

  try {
    const candidatesPayload = toCandidatePayload(candidates);

    const prompt = buildRankingPrompt(
      query,
      candidatesPayload,
      historyContext,
      limit,
    );

    const raw = await geminiWithRetry(() => model.generateContent(prompt));

    const parsed = safeJsonParse(raw.response.text());
    const ids = Array.isArray(parsed.selected_ids)
      ? parsed.selected_ids.map(Number).filter(Number.isFinite)
      : [];
    return {
      selectedIds: ids,
      recommendation:
        typeof parsed.recommendation === "string"
          ? parsed.recommendation
          : null,
    };
  } catch (err) {
    console.error("[rankCandidatesWithGemini]", err.message);
    return { selectedIds: null, recommendation: null };
  }
};

export const recognizeMeal = async ({ imageBase64, mimeType }) => {
  if (!ALLOWED_MEAL_IMAGE_TYPES.includes(mimeType)) {
    throw new Error(`[recognizeMeal] неподдерживаемый тип файла: ${mimeType}`);
  }

  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json" },
  });

  const prompt = buildMealRecognitionPrompt();

  const raw = await geminiWithRetry(
    () =>
      model.generateContent([
        { text: prompt },
        { inlineData: { mimeType, data: imageBase64 } },
      ]),
    GEMINI_RETRIES,
    GEMINI_VISION_TIMEOUT_MS,
  );

  return validateMealRecognition(safeJsonParse(raw.response.text()));
};
