/**
 * measureTokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Точно измеряет и сравнивает расход токенов при использовании TOON и JSON
 * форматов с Gemini API. Включает валидацию TOON-ответов, правильный подсчёт
 * overhead от responseSchema, и многократные прогоны для усреднения.
 *
 * Run: node measureTokens.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("[ERROR] GEMINI_API_KEY не задан в .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Модель и тарифы ───────────────────────────────────────────────────────────
// Используем реальную модель. Список актуальных: gemini-2.0-flash, gemini-1.5-flash
const MODEL = "gemini-3.1-flash-lite";

// Тарифы для gemini-2.0-flash ($/1M токенов)
// Актуальные цены: https://ai.google.dev/pricing
const PRICE_INPUT_PER_1M = 0.25;
const PRICE_OUTPUT_PER_1M = 1.5;

// Количество прогонов каждого сценария для усреднения результатов
const RUNS_PER_SCENARIO = 3;

// Задержка между запросами (мс) — во избежание rate limit
const DELAY_MS = 1500;

// ── Тестовые данные ───────────────────────────────────────────────────────────
const SAMPLE_CATEGORIES = [
  "Завтраки",
  "Обеды",
  "Ужины",
  "Десерты",
  "Напитки",
  "Закуски",
  "Супы",
];

// История как массив объектов (будет преобразована в contents[] для API)
const SAMPLE_HISTORY_SHORT = [
  { role: "user", text: "Хочу что-нибудь низкокалорийное и фруктовое" },
  {
    role: "model",
    text: "Отличный выбор! Подберу фруктовые варианты до 450 ккал.",
    search_params: {
      search_query: "фрукты",
      max_calories: 450,
      query_logic: "OR",
    },
  },
];

const SAMPLE_HISTORY_LONG = [
  { role: "user", text: "Хочу что-нибудь низкокалорийное" },
  {
    role: "model",
    text: "Идеально подойдут лёгкие блюда.",
    search_params: { max_calories: 450, query_logic: "OR" },
  },
  { role: "user", text: "А если с курицей?" },
  {
    role: "model",
    text: "Курица — отличный источник белка!",
    search_params: {
      search_query: "курица",
      max_calories: 450,
      query_logic: "OR",
    },
  },
  { role: "user", text: "Без помидор пожалуйста" },
  {
    role: "model",
    text: "Конечно, уберу томаты.",
    search_params: {
      search_query: "курица",
      exclude_query: "помидоры томаты",
      max_calories: 450,
      query_logic: "OR",
    },
  },
];

// ── Схемы ─────────────────────────────────────────────────────────────────────

// --- TOON схемы (встраиваются в текст промпта) ---
const PARSER_TOON_SCHEMA = `
search_query: слова для поиска или null
exclude_query: слова для исключения или null
min_calories: число или null
max_calories: число или null
min_proteins: число или null
max_price: число или null
category: точное название категории или null
sort_by: price_asc | price_desc | kcal_asc | kcal_desc | null
query_logic: AND | OR
is_vegetarian: true | null
is_vegan: true | null
is_gluten_free: true | null
is_dairy_free: true | null
is_spicy: true | null
cooking_method: запеченное | вареное | жареное | на пару | сырое | тушеное | null
meal_time: завтрак | обед | ужин | перекус | null
`.trim();

const CHAT_TOON_SCHEMA = `
search_params:
  search_query: слова для поиска или null
  exclude_query: слова для исключения или null
  min_calories: число или null
  max_calories: число или null
  min_proteins: число или null
  max_price: число или null
  category: точное название или null
  sort_by: price_asc | price_desc | kcal_asc | kcal_desc | null
  query_logic: AND | OR
  is_vegetarian: true | null
  is_vegan: true | null
  is_gluten_free: true | null
  is_dairy_free: true | null
  is_spicy: true | null
  cooking_method: запеченное | вареное | жареное | на пару | сырое | тушеное | null
  meal_time: завтрак | обед | ужин | перекус | null
search_slots: список слотов или null
recommendation: строка с рекомендацией
not_found_message: строка если ничего не найдено
`.trim();

// --- JSON Schema (OpenAPI формат для Gemini responseSchema) ---
const SEARCH_PARAMS_PROPERTIES = {
  search_query: {
    type: "STRING",
    nullable: true,
    description: "ключевые слова для поиска",
  },
  exclude_query: {
    type: "STRING",
    nullable: true,
    description: "слова для исключения",
  },
  min_calories: { type: "INTEGER", nullable: true },
  max_calories: { type: "INTEGER", nullable: true },
  min_proteins: { type: "INTEGER", nullable: true },
  max_price: { type: "INTEGER", nullable: true },
  category: {
    type: "STRING",
    nullable: true,
    description: "точное название категории",
  },
  sort_by: {
    type: "STRING",
    enum: ["price_asc", "price_desc", "kcal_asc", "kcal_desc"],
    nullable: true,
  },
  query_logic: { type: "STRING", enum: ["AND", "OR"] },
  is_vegetarian: { type: "BOOLEAN", nullable: true },
  is_vegan: { type: "BOOLEAN", nullable: true },
  is_gluten_free: { type: "BOOLEAN", nullable: true },
  is_dairy_free: { type: "BOOLEAN", nullable: true },
  is_spicy: { type: "BOOLEAN", nullable: true },
  cooking_method: {
    type: "STRING",
    enum: ["запеченное", "вареное", "жареное", "на пару", "сырое", "тушеное"],
    nullable: true,
  },
  meal_time: {
    type: "STRING",
    enum: ["завтрак", "обед", "ужин", "перекус"],
    nullable: true,
  },
};

const PARSER_JSON_SCHEMA = {
  type: "OBJECT",
  properties: SEARCH_PARAMS_PROPERTIES,
  required: ["query_logic"],
};

const CHAT_JSON_SCHEMA = {
  type: "OBJECT",
  properties: {
    search_params: {
      type: "OBJECT",
      properties: SEARCH_PARAMS_PROPERTIES,
      required: ["query_logic"],
    },
    search_slots: {
      type: "ARRAY",
      items: { type: "OBJECT", properties: SEARCH_PARAMS_PROPERTIES },
      nullable: true,
      description: "список слотов при мульти-запросах",
    },
    recommendation: {
      type: "STRING",
      description: "рекомендация пользователю",
    },
    not_found_message: {
      type: "STRING",
      description: "сообщение если блюда не найдены",
    },
  },
  required: ["recommendation", "not_found_message"],
};

// ── Правила поиска ────────────────────────────────────────────────────────────
const SEARCH_PARAMS_RULES = (categories) =>
  `
ПРАВИЛА для search_params / слота:
1. search_query — конкретные продукты или ингредиенты для поиска, null если не указано
2. exclude_query — ТОЛЬКО исключения через пробел, null если нет исключений
3. Числовые фильтры (min/max_calories, min_proteins, max_price) — целые числа или null
4. Флаги (is_vegetarian, is_vegan, is_gluten_free, is_dairy_free, is_spicy) — true или null
5. cooking_method: запеченное | вареное | жареное | на пару | сырое | тушеное | null
6. meal_time: завтрак | обед | ужин | перекус | null
7. category — строго одно из: ${categories.join(", ")}. Иначе null.
8. sort_by: дешёвое→price_asc | дорогое→price_desc | меньше калорий→kcal_asc | больше→kcal_desc | null
9. query_logic: AND — все слова в одном блюде; OR — любое из слов`.trim();

// ── Построители промптов ──────────────────────────────────────────────────────

const buildParserPrompt = (query, categories, format) => {
  const rules = SEARCH_PARAMS_RULES(categories);
  if (format === "json") {
    return `Ты — ИИ-парсер для поиска здоровой еды. Проанализируй запрос пользователя.

${rules}

Запрос пользователя: "${query}"`.trim();
  }
  return `Ты — ИИ-парсер для поиска здоровой еды. Проанализируй запрос пользователя.
Верни валидный TOON без пояснений и markdown, строго по схеме:

${PARSER_TOON_SCHEMA}

${rules}

Запрос пользователя: "${query}"`.trim();
};

const buildChatSystemPrompt = (categories, format) => {
  const rules = SEARCH_PARAMS_RULES(categories);
  if (format === "json") {
    return `Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Анализируй текущий запрос с учётом истории диалога.
Доступные категории: ${categories.join(", ")}.
МУЛЬТИ-СЛОТ: используй search_slots вместо search_params только если пользователь явно просит несколько разных позиций.
${rules}
ПРАВИЛА ИСТОРИИ: уточнение → корректируй фильтр; смена темы → сбрось все фильтры.
ПРАВИЛА ТЕКСТА: recommendation — 2-3 предл.; not_found_message — 3-5 предл.`.trim();
  }
  return `Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Анализируй текущий запрос с учётом истории диалога.
Верни ТОЛЬКО TOON без markdown, строго по схеме:

${CHAT_TOON_SCHEMA}

Доступные категории: ${categories.join(", ")}.
МУЛЬТИ-СЛОТ: используй search_slots вместо search_params только если пользователь явно просит несколько разных позиций.
${rules}
ПРАВИЛА ИСТОРИИ: уточнение → корректируй фильтр; смена темы → сбрось все фильтры.
ПРАВИЛА ТЕКСТА: recommendation — 2-3 предл.; not_found_message — 3-5 предл.`.trim();
};

// ── Построение contents[] для Gemini (правильная история диалога) ─────────────
/**
 * Gemini Chat API принимает историю через contents[].
 * Для parser — один user-turn.
 * Для chat — системный промпт как первый user-turn (Gemini не поддерживает
 * system role напрямую в generateContent, поэтому системный контекст
 * добавляется как первое сообщение пользователя + ответ модели-заглушка),
 * затем история, затем текущий запрос.
 */
const buildContents = (type, query, categories, history, format) => {
  if (type === "parser") {
    // Парсер — без истории, один вызов
    return [
      {
        role: "user",
        parts: [{ text: buildParserPrompt(query, categories, format) }],
      },
    ];
  }

  // Chat — системный промпт + история + текущий запрос
  const systemPrompt = buildChatSystemPrompt(categories, format);
  const contents = [];

  // Системный промпт через user/model пару (Gemini не имеет system role в generateContent)
  contents.push({ role: "user", parts: [{ text: systemPrompt }] });
  contents.push({
    role: "model",
    parts: [{ text: "Понял, готов помогать с подбором здоровой еды." }],
  });

  // История диалога
  for (const turn of history) {
    if (turn.role === "user") {
      contents.push({ role: "user", parts: [{ text: turn.text }] });
    } else {
      // Для model-turn добавляем search_params как часть ответа если есть
      const modelText = turn.search_params
        ? `${turn.text}\n[params: ${JSON.stringify(turn.search_params)}]`
        : turn.text;
      contents.push({ role: "model", parts: [{ text: modelText }] });
    }
  }

  // Текущий запрос
  contents.push({ role: "user", parts: [{ text: query }] });
  return contents;
};

// ── Утилиты ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const calcInputCost = (tokens) => (tokens / 1_000_000) * PRICE_INPUT_PER_1M;
const calcOutputCost = (tokens) => (tokens / 1_000_000) * PRICE_OUTPUT_PER_1M;
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const sep = () => console.log("─".repeat(78));
const sep2 = () => console.log("═".repeat(78));

// ── Подсчёт токенов через API ─────────────────────────────────────────────────
const countTokensViaApi = async (model, contents) => {
  try {
    const res = await model.countTokens({ contents });
    return res.totalTokens;
  } catch {
    // Fallback: грубая оценка (~2.5 символа на токен для русского)
    const allText = contents
      .flatMap((c) => c.parts.map((p) => p.text || ""))
      .join(" ");
    return Math.ceil(allText.length / 2.5);
  }
};

// ── Реальный вызов модели ─────────────────────────────────────────────────────
const callModel = async (model, contents, format, jsonSchema = null) => {
  const req = { contents };

  if (format === "json") {
    req.generationConfig = {
      responseMimeType: "application/json",
      ...(jsonSchema ? { responseSchema: jsonSchema } : {}),
    };
  }

  const result = await model.generateContent(req);
  const response = result.response;
  const responseText = response.text();
  const usage = response.usageMetadata;

  return {
    responseText,
    // promptTokenCount — все входные токены ВКЛЮЧАЯ overhead от responseSchema
    totalInputTokens: usage?.promptTokenCount ?? null,
    outputTokens: usage?.candidatesTokenCount ?? null,
  };
};

// ── Валидация TOON-ответа ─────────────────────────────────────────────────────
// Обязательные поля для parser и chat
const PARSER_REQUIRED_KEYS = ["query_logic"];
const CHAT_REQUIRED_KEYS = ["recommendation", "not_found_message"];
const VALID_QUERY_LOGIC = ["AND", "OR"];

const parseToon = (text) => {
  const result = {};
  // Парсим строки вида "ключ: значение" (поддерживаем вложенность через отступы)
  const lines = text.split("\n");
  for (const line of lines) {
    const match = line.match(/^\s*([\w_]+)\s*:\s*(.+)$/);
    if (match) {
      const key = match[1].trim();
      const val = match[2].trim();
      result[key] = val === "null" ? null : val;
    }
  }
  return result;
};

const validateToon = (text, type) => {
  const parsed = parseToon(text);
  const issues = [];
  const requiredKeys =
    type === "parser" ? PARSER_REQUIRED_KEYS : CHAT_REQUIRED_KEYS;

  for (const key of requiredKeys) {
    if (!(key in parsed)) issues.push(`Отсутствует обязательное поле: ${key}`);
  }

  if ("query_logic" in parsed && parsed.query_logic !== null) {
    if (!VALID_QUERY_LOGIC.includes(parsed.query_logic)) {
      issues.push(`Неверное значение query_logic: "${parsed.query_logic}"`);
    }
  }

  // Проверяем что нет посторонних строк (markdown, пояснения)
  const hasMarkdown = /```|###|---|\*\*/.test(text);
  if (hasMarkdown) issues.push("Ответ содержит markdown-разметку");

  return { valid: issues.length === 0, issues, parsed };
};

// ── Форматирование чисел ──────────────────────────────────────────────────────
const fmtTokens = (n) =>
  n === null ? "N/A" : String(Math.round(n)).padStart(5);
const fmtCost = (n) => (n === null ? "    N/A" : `$${n.toFixed(6)}`);
const pct = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// ── Сценарии ──────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name: "Parser — простой запрос",
    type: "parser",
    query: "хочу суп",
    history: [],
    jsonSchema: PARSER_JSON_SCHEMA,
    toonSchema: PARSER_TOON_SCHEMA,
  },
  {
    name: "Parser — сложный запрос с исключениями и лимитами",
    type: "parser",
    query: "вегетарианский салат без орехов и томатов до 400 калорий",
    history: [],
    jsonSchema: PARSER_JSON_SCHEMA,
    toonSchema: PARSER_TOON_SCHEMA,
  },
  {
    name: "Chat — без истории, первый вопрос",
    type: "chat",
    query: "порекомендуй лёгкий завтрак",
    history: [],
    jsonSchema: CHAT_JSON_SCHEMA,
    toonSchema: CHAT_TOON_SCHEMA,
  },
  {
    name: "Chat — короткая история (2 сообщения)",
    type: "chat",
    query: "а если без молочного?",
    history: SAMPLE_HISTORY_SHORT,
    jsonSchema: CHAT_JSON_SCHEMA,
    toonSchema: CHAT_TOON_SCHEMA,
  },
  {
    name: "Chat — длинная история (6 сообщений)",
    type: "chat",
    query: "и чтобы подешевле",
    history: SAMPLE_HISTORY_LONG,
    jsonSchema: CHAT_JSON_SCHEMA,
    toonSchema: CHAT_TOON_SCHEMA,
  },
  {
    name: "Chat — мульти-слот запрос",
    type: "chat",
    query: "порекомендуй одно мясное блюдо, один салат и один напиток",
    history: [],
    jsonSchema: CHAT_JSON_SCHEMA,
    toonSchema: CHAT_TOON_SCHEMA,
  },
];

// ── Один прогон сценария для одного формата ───────────────────────────────────
const runOnce = async (model, sc, format) => {
  const contents = buildContents(
    sc.type,
    sc.query,
    SAMPLE_CATEGORIES,
    sc.history,
    format,
  );
  const jsonSchema = format === "json" ? sc.jsonSchema : null;

  // 1. Считаем токены текстового содержимого contents[] (без overhead схемы)
  const textInputTokens = await countTokensViaApi(model, contents);
  await sleep(DELAY_MS);

  // 2. Реальный вызов — получаем totalInputTokens (ВКЛЮЧАЯ overhead responseSchema для JSON)
  const { responseText, totalInputTokens, outputTokens } = await callModel(
    model,
    contents,
    format,
    jsonSchema,
  );
  await sleep(DELAY_MS);

  // 3. Вычисляем overhead от responseSchema
  //    Для TOON схема встроена в текст → schemaOverhead = 0 (уже в textInputTokens)
  //    Для JSON схема передаётся отдельно → overhead = разница
  const schemaOverheadTokens =
    format === "json"
      ? Math.max(0, (totalInputTokens ?? textInputTokens) - textInputTokens)
      : 0;

  // 4. Токены только пользовательского запроса
  const queryContents = [{ role: "user", parts: [{ text: sc.query }] }];
  const queryTokens = await countTokensViaApi(model, queryContents);
  await sleep(DELAY_MS);

  // 5. Токены системного промпта + истории = весь текст минус запрос
  const systemAndHistoryTokens = Math.max(0, textInputTokens - queryTokens);

  // 6. Если TOON — отдельно считаем схему внутри текста
  let schemaInTextTokens = 0;
  if (format === "toon") {
    const schemaContents = [{ role: "user", parts: [{ text: sc.toonSchema }] }];
    schemaInTextTokens = await countTokensViaApi(model, schemaContents);
    await sleep(DELAY_MS);
  }

  // Итоговые токены входа (если API не вернул — используем подсчитанные)
  const finalInputTokens = totalInputTokens ?? textInputTokens;
  // Токены выхода (если API не вернул — оцениваем)
  const finalOutputTokens =
    outputTokens ?? Math.ceil(responseText.length / 2.5);

  // Валидация TOON
  const validation =
    format === "toon"
      ? validateToon(responseText, sc.type)
      : { valid: true, issues: [], parsed: null };

  return {
    format,
    // Разбивка входных токенов
    totalInputTokens: finalInputTokens,
    textInputTokens, // токены текста contents[] без overhead схемы
    schemaOverheadTokens, // overhead responseSchema (только для JSON)
    schemaInTextTokens, // токены схемы внутри текста (только для TOON)
    queryTokens,
    systemAndHistoryTokens,
    // Выходные токены
    outputTokens: finalOutputTokens,
    // Ответ и валидация
    responseText,
    validation,
    // Стоимость
    inputCost: calcInputCost(finalInputTokens),
    outputCost: calcOutputCost(finalOutputTokens),
    totalCost:
      calcInputCost(finalInputTokens) + calcOutputCost(finalOutputTokens),
  };
};

// ── Усреднение результатов нескольких прогонов ────────────────────────────────
const avgResults = (runs) => {
  const n = runs.length;
  const fields = [
    "totalInputTokens",
    "textInputTokens",
    "schemaOverheadTokens",
    "schemaInTextTokens",
    "queryTokens",
    "systemAndHistoryTokens",
    "outputTokens",
    "inputCost",
    "outputCost",
    "totalCost",
  ];
  const result = { ...runs[0] };
  for (const f of fields) {
    result[f] = avg(runs.map((r) => r[f]));
  }
  // Валидность — считаем долю успешных прогонов
  result.validCount = runs.filter((r) => r.validation.valid).length;
  result.totalRuns = n;
  return result;
};

// ── Вывод результатов сценария ────────────────────────────────────────────────
const printScenarioResult = (sc, toonRes, jsonRes) => {
  sep2();
  console.log(`[СЦЕНАРИЙ]: ${sc.name}`);
  console.log(`[ЗАПРОС]:   "${sc.query}"`);
  console.log(`[ПРОГОНОВ]: ${RUNS_PER_SCENARIO} (усреднено)\n`);

  for (const res of [toonRes, jsonRes]) {
    const fmt = res.format.toUpperCase();
    const ti = res.totalInputTokens;
    const out = res.outputTokens;

    console.log(`  ┌─ Формат: ${fmt} ${"─".repeat(60 - fmt.length)}`);

    // Входные токены
    console.log(
      `  │  ВХОД: ${fmtTokens(ti)} токенов  (${fmtCost(res.inputCost)})`,
    );

    if (res.format === "toon") {
      console.log(
        `  │    ├─ Системный промпт + история: ~${fmtTokens(res.systemAndHistoryTokens)} тк (${pct(res.systemAndHistoryTokens, ti)}%)`,
      );
      console.log(
        `  │    ├─ Схема TOON (в тексте):      ~${fmtTokens(res.schemaInTextTokens)} тк (${pct(res.schemaInTextTokens, ti)}%)`,
      );
      console.log(
        `  │    └─ Запрос пользователя:        ~${fmtTokens(res.queryTokens)} тк (${pct(res.queryTokens, ti)}%)`,
      );
    } else {
      console.log(
        `  │    ├─ Системный промпт + история: ~${fmtTokens(res.systemAndHistoryTokens)} тк (${pct(res.systemAndHistoryTokens, ti)}%)`,
      );
      console.log(
        `  │    ├─ Overhead responseSchema:    ~${fmtTokens(res.schemaOverheadTokens)} тк (${pct(res.schemaOverheadTokens, ti)}%)`,
      );
      console.log(
        `  │    └─ Запрос пользователя:        ~${fmtTokens(res.queryTokens)} тк (${pct(res.queryTokens, ti)}%)`,
      );
    }

    // Выходные токены
    console.log(
      `  │  ВЫХОД: ${fmtTokens(out)} токенов  (${fmtCost(res.outputCost)})`,
    );
    console.log(`  │  ИТОГО: ${fmtCost(res.totalCost)}`);

    // Валидация (только для TOON)
    if (res.format === "toon") {
      const vStr =
        res.validCount === res.totalRuns
          ? `✅ Все ${res.totalRuns}/${res.totalRuns} ответов валидны`
          : `⚠️  ${res.validCount}/${res.totalRuns} ответов валидны`;
      console.log(`  │  ВАЛИДАЦИЯ: ${vStr}`);
    }

    // Последний ответ модели (для наглядности)
    const preview =
      res.responseText.length > 300
        ? res.responseText.slice(0, 300) + "…"
        : res.responseText;
    console.log(`  │  ОТВЕТ МОДЕЛИ (последний прогон):`);
    preview.split("\n").forEach((l) => console.log(`  │    ${l}`));
    console.log(`  └${"─".repeat(70)}`);
  }

  // Сравнение TOON vs JSON
  const inputDiff = toonRes.totalInputTokens - jsonRes.totalInputTokens;
  const outputDiff = toonRes.outputTokens - jsonRes.outputTokens;
  const costDiff = toonRes.totalCost - jsonRes.totalCost;

  console.log(`\n  📊 РАЗНИЦА (TOON − JSON):`);
  console.log(
    `     Вход:  ${inputDiff > 0 ? "+" : ""}${Math.round(inputDiff)} токенов`,
  );
  console.log(
    `     Выход: ${outputDiff > 0 ? "+" : ""}${Math.round(outputDiff)} токенов`,
  );
  console.log(`     Цена:  ${costDiff > 0 ? "+" : ""}${costDiff.toFixed(6)}$`);
  console.log(
    `     Победитель по токенам: ${Math.round(toonRes.totalInputTokens + toonRes.outputTokens) < Math.round(jsonRes.totalInputTokens + jsonRes.outputTokens) ? "TOON 🏆" : "JSON 🏆"}`,
  );
};

// ── Итоговый отчёт ────────────────────────────────────────────────────────────
const printFinalSummary = (allResults) => {
  sep2();
  console.log("[ИТОГОВЫЙ СРАВНИТЕЛЬНЫЙ ОТЧЁТ]");
  sep2();

  const toonAll = allResults.map((r) => r.toon);
  const jsonAll = allResults.map((r) => r.json);

  const metrics = {
    "Среднее: вход (токены)": {
      toon: avg(toonAll.map((r) => r.totalInputTokens)),
      json: avg(jsonAll.map((r) => r.totalInputTokens)),
    },
    "Среднее: выход (токены)": {
      toon: avg(toonAll.map((r) => r.outputTokens)),
      json: avg(jsonAll.map((r) => r.outputTokens)),
    },
    "Среднее: схема (токены)": {
      toon: avg(toonAll.map((r) => r.schemaInTextTokens)),
      json: avg(jsonAll.map((r) => r.schemaOverheadTokens)),
    },
    "Среднее: стоимость входа ($)": {
      toon: avg(toonAll.map((r) => r.inputCost)),
      json: avg(jsonAll.map((r) => r.inputCost)),
    },
    "Среднее: стоимость выхода ($)": {
      toon: avg(toonAll.map((r) => r.outputCost)),
      json: avg(jsonAll.map((r) => r.outputCost)),
    },
    "Среднее: итого ($)": {
      toon: avg(toonAll.map((r) => r.totalCost)),
      json: avg(jsonAll.map((r) => r.totalCost)),
    },
  };

  const labelW = 35;
  console.log(
    `\n  ${"Метрика".padEnd(labelW)} ${"TOON".padStart(12)} ${"JSON".padStart(12)} ${"Δ (TOON−JSON)".padStart(16)}`,
  );
  console.log("  " + "─".repeat(labelW + 44));

  for (const [label, { toon, json }] of Object.entries(metrics)) {
    const isToken = label.includes("токены") || label.includes("схема");
    const diff = toon - json;
    const tStr = isToken ? Math.round(toon).toString() : toon.toFixed(6);
    const jStr = isToken ? Math.round(json).toString() : json.toFixed(6);
    const dStr =
      (diff > 0 ? "+" : "") +
      (isToken ? Math.round(diff).toString() : diff.toFixed(6));
    console.log(
      `  ${label.padEnd(labelW)} ${tStr.padStart(12)} ${jStr.padStart(12)} ${dStr.padStart(16)}`,
    );
  }

  // Надёжность TOON
  const totalRuns = toonAll.reduce((s, r) => s + r.totalRuns, 0);
  const validToonRuns = toonAll.reduce((s, r) => s + r.validCount, 0);
  const toonReliability = Math.round((validToonRuns / totalRuns) * 100);

  console.log(
    `\n  ✅ Надёжность TOON-формата: ${validToonRuns}/${totalRuns} валидных ответов (${toonReliability}%)`,
  );
  console.log(`  📌 JSON всегда структурирован через responseSchema (100%)`);

  // Итоговый вывод
  const avgToonCost = avg(toonAll.map((r) => r.totalCost));
  const avgJsonCost = avg(jsonAll.map((r) => r.totalCost));
  const winner = avgToonCost < avgJsonCost ? "TOON" : "JSON";
  const saving = Math.abs(
    ((avgToonCost - avgJsonCost) / avgJsonCost) * 100,
  ).toFixed(1);

  console.log(`\n  🏆 По стоимости дешевле: ${winner} (на ~${saving}%)`);
  console.log(`     Но учтите: TOON требует валидатор на вашей стороне,`);
  console.log(`     JSON даёт гарантированную структуру из коробки.\n`);
  sep2();
};

// ── MAIN ──────────────────────────────────────────────────────────────────────
const main = async () => {
  const model = genAI.getGenerativeModel({ model: MODEL });

  console.log(`\n${"═".repeat(78)}`);
  console.log(
    ` TOON vs JSON | Модель: ${MODEL} | ${RUNS_PER_SCENARIO} прогона на сценарий`,
  );
  console.log(
    ` Тарифы: вход $${PRICE_INPUT_PER_1M}/1M, выход $${PRICE_OUTPUT_PER_1M}/1M`,
  );
  console.log(`${"═".repeat(78)}\n`);

  const allResults = [];

  for (const sc of SCENARIOS) {
    console.log(`\n⏳ Запускаю сценарий: "${sc.name}" ...`);

    const toonRuns = [];
    const jsonRuns = [];

    for (let run = 1; run <= RUNS_PER_SCENARIO; run++) {
      process.stdout.write(`   Прогон ${run}/${RUNS_PER_SCENARIO}: TOON...`);
      try {
        const r = await runOnce(model, sc, "toon");
        toonRuns.push(r);
        process.stdout.write(` ✓  JSON...`);
      } catch (e) {
        process.stdout.write(` ✗ (${e.message})\n`);
      }
      await sleep(DELAY_MS);

      try {
        const r = await runOnce(model, sc, "json");
        jsonRuns.push(r);
        process.stdout.write(` ✓\n`);
      } catch (e) {
        process.stdout.write(` ✗ (${e.message})\n`);
      }
      await sleep(DELAY_MS);
    }

    if (toonRuns.length > 0 && jsonRuns.length > 0) {
      const toonAvg = avgResults(toonRuns);
      const jsonAvg = avgResults(jsonRuns);
      // Сохраняем последний ответ для показа
      toonAvg.responseText = toonRuns[toonRuns.length - 1].responseText;
      jsonAvg.responseText = jsonRuns[jsonRuns.length - 1].responseText;

      printScenarioResult(sc, toonAvg, jsonAvg);
      allResults.push({ toon: toonAvg, json: jsonAvg });
    } else {
      console.log(
        `   ⚠️ Недостаточно данных для сценария "${sc.name}", пропускаем.`,
      );
    }
  }

  if (allResults.length > 0) {
    printFinalSummary(allResults);
  }
};

main().catch((err) => {
  console.error("\n[FATAL ERROR]", err);
  process.exit(1);
});
