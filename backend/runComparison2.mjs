/**
 * runComparison2.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * ЧЕСТНОЕ сравнение JSON vs TOON для парсера/чата умного поиска.
 *
 * В этой версии основные итоговые таблицы разделены на:
 *   - Sys Prompt (Системные инструкции + Бизнес-правила)
 *   - User Query (Запрос пользователя + История)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";
import { writeFileSync } from "fs";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("Ошибка: GEMINI_API_KEY не найден в .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = "gemini-3.1-flash-lite";

const PRICE_INPUT_PER_M = 0.25;
const PRICE_OUTPUT_PER_M = 1.5;

const MOCK_CATEGORIES = [
  "Завтраки",
  "Супы",
  "Горячие блюда",
  "Салаты",
  "Десерты",
  "Напитки",
  "Гарниры",
  "Закуски",
];

// Полный список обязательных полей схемы
const SCHEMA_FIELDS = [
  "search_query",
  "exclude_query",
  "min_calories",
  "max_calories",
  "min_proteins",
  "max_price",
  "category",
  "sort_by",
  "query_logic",
  "is_vegetarian",
  "is_vegan",
  "is_gluten_free",
  "is_dairy_free",
  "is_spicy",
  "cooking_method",
  "meal_time",
];

const CHAT_SCHEMA_FIELDS = [
  "search_params",
  "search_slots",
  "recommendation",
  "not_found_message",
];

// ════════════════════════════════════════════════════════════════════════════
// ТЕСТОВЫЕ СЦЕНАРИИ
// ════════════════════════════════════════════════════════════════════════════

const SCENARIOS = [
  {
    scenario: "1. Parser",
    type: "parser",
    query: "веганский салат без помидоров до 300 ккал",
  },
  {
    scenario: "2. Parser (Complex)",
    type: "parser",
    query:
      "хочу острое тушеное мясо с высоким содержанием белка не дороже 25 рублей на ужин",
  },
  {
    scenario: "3. Chat (No History)",
    type: "chat",
    query: "посоветуй что-нибудь легкое на завтрак без глютена",
    history: [],
  },
  {
    scenario: "4. Chat (Short History)",
    type: "chat",
    query: "а можно теперь что-то подешевле и без молочных продуктов?",
    history: [
      {
        role: "user",
        content: "посоветуй что-нибудь легкое на завтрак без глютена",
      },
      { role: "assistant", content: "Рекомендую овсяную кашу без глютена." },
    ],
  },
  {
    scenario: "5. Chat (Multi-slot)",
    type: "chat",
    query: "собери мне обед: суп, горячее мясное блюдо и напиток без сахара",
    history: [],
  },
];

// ════════════════════════════════════════════════════════════════════════════
// ОБЩИЙ БЛОК ПРАВИЛ
// ════════════════════════════════════════════════════════════════════════════

const SEARCH_PARAMS_RULES = (categories) =>
  `
ПРАВИЛА для search_params / слота:
0. СНАЧАЛА исправь очевидные опечатки (куринная→куриная, салатт→салат).
   Переведи латинские названия блюд: pizza→пицца, soup→суп, steak→стейк.

1. search_query — конкретные продукты во множественном числе ("огурцы", "перцы").
   Абстракции ("вкусное", "полезное") → null/опусти поле.
   Синонимы пиши вместе для неоднозначных слов: "помидоры томаты".

2. exclude_query — ТОЛЬКО исключения. Никогда не пиши "без", "не" в search_query.
   Раскрывай группы ПОЛНОСТЬЮ:
   * без ягод       → "ягоды клубника малина черника голубика брусника вишня ежевика"
   * без фруктов    → "фрукты яблоки бананы манго персики груши киви ананасы апельсины лимоны"
   * без орехов     → "орехи кешью миндаль арахис кокос семечки фисташки фундук грецкий"
   * без овощей     → "овощи помидоры томаты огурцы перец перцы морковь лук чеснок капуста баклажаны кабачки"
   * без мяса       → "мясо курица индейка говядина свинина бекон стейк колбаса фарш сосиски"
   * без молочного  → "молоко сыр творог сметана кефир йогурт сливки масло"
   * без глютена    → "мука хлеб макароны паста лапша блины тесто выпечка пшеница"

3. Числовые фильтры:
   "около N ккал" → min_calories=N*0.8, max_calories=N*1.2
   "не больше N"  → max_calories=N
   "от N до M"    → min_calories=N, max_calories=M
   "с высоким белком" → min_proteins=25

4. Флаги (true только при явном запросе): is_vegetarian, is_vegan,
   is_gluten_free, is_dairy_free, is_spicy.

5. cooking_method: запеченное | вареное | жареное | на пару | сырое | тушеное

6. meal_time (если явно упомянуто время суток): завтрак | обед | ужин | перекус

7. category — строго точное название из: ${categories.join(", ")}.

8. sort_by: дешёвое→price_asc | дорогое→price_desc | лёгкое→kcal_asc | калорийное→kcal_desc

9. query_logic: AND — одно составное блюдо; OR — несколько разных блюд.
   ВСЕГДА указывай query_logic явно (AND или OR), даже если кажется очевидным.
`.trim();

// ════════════════════════════════════════════════════════════════════════════
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ════════════════════════════════════════════════════════════════════════════

const buildHistoryContext = (history) => {
  if (!history || !history.length) return "";
  const lines = history.map((h) => {
    if (h.role === "user") return `  Пользователь: "${h.content}"`;
    return `  ИИ: "${h.content.slice(0, 150)}"`;
  });
  return "\nИстория диалога:\n" + lines.join("\n") + "\n";
};

// ════════════════════════════════════════════════════════════════════════════
// JSON — ПРОМПТЫ
// ════════════════════════════════════════════════════════════════════════════

const getParserPromptJSON = (query, categories) => {
  const systemInstructions = `
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
  `.trim();

  const rules = SEARCH_PARAMS_RULES(categories);
  const userPayload = `Запрос: "${query}"`;

  return {
    systemInstructions,
    rules,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
};

const getChatPromptJSON = (query, categories, historyContext) => {
  const systemInstructions = `
Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Проанализируй текущий запрос с учётом истории и верни ТОЛЬКО JSON без markdown:
{
  "search_params": {
    "search_query":  "слова для поиска или null",
    "exclude_query": "слова для исключения или null",
    "min_calories":  число или null,
    "max_calories":  число или null,
    "min_proteins":  число или null,
    "max_price":     число или null,
    "category":      "точное название или null",
    "sort_by":       "price_asc" | "price_desc" | "kcal_asc" | "kcal_desc" | null,
    "query_logic":   "AND" | "OR",
    "is_vegetarian": true | null,
    "is_vegan":      true | null,
    "is_gluten_free":true | null,
    "is_dairy_free": true | null,
    "is_spicy":      true | null,
    "cooking_method":"запеченное" | "вареное" | "жареное" | "на пару" | "сырое" | "тушеное" | null,
    "meal_time":     "завтрак" | "обед" | "ужин" | "перекус" | null
  },
  "search_slots": null,
  "recommendation":    "строка",
  "not_found_message": "строка"
}

МУЛЬТИ-СЛОТ: используй search_slots ВМЕСТО search_params, только если пользователь
явно просит несколько разных позиций ("мясное + салат + напиток").
Каждый слот = { search_query, exclude_query, category, query_logic, max_calories, min_proteins, max_price }.
При мульти-слоте search_params заполни нулями.

ПРАВИЛА ИСТОРИИ: уточнение → корректируй только нужный фильтр; смена темы → сбрось все.
ПРАВИЛА ТЕКСТА: recommendation — 2–3 предл.; not_found_message — 3–5 предл.
  `.trim();

  const rules = SEARCH_PARAMS_RULES(categories);
  const userPayload = `
Доступные категории: ${categories.join(", ")}.
${historyContext}

Запрос: "${query}"
  `.trim();

  return {
    systemInstructions,
    rules,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
};

// ════════════════════════════════════════════════════════════════════════════
// TOON — ПРОМПТЫ
// ════════════════════════════════════════════════════════════════════════════

const getParserPromptTOON = (query, categories) => {
  const systemInstructions = `
Ты — ИИ-парсер для поиска здоровой еды. Проанализируй запрос на русском языке.
Верни ответ строго в формате TOON (Token-Oriented Object Notation) без markdown-разметки.

СПЕЦИФИКАЦИЯ TOON:
- Пары "ключ=значение" пишутся без пробелов вокруг "=" и разделяются ";".
- Текстовые значения — БЕЗ кавычек.
- Поля со значением null/false полностью опускаются (не пиши их вообще).
- query_logic пиши ВСЕГДА явно (это не null-значение, опускать нельзя).

ПОЛНЫЙ СПИСОК ВОЗМОЖНЫХ ПОЛЕЙ (пиши только те, что применимы к запросу):
search_query    — слова для поиска
exclude_query   — слова для исключения
min_calories    — число
max_calories    — число
min_proteins    — число
max_price       — число
category        — точное название категории
sort_by         — price_asc | price_desc | kcal_asc | kcal_desc
query_logic     — AND | OR  (обязательное поле, не опускать)
is_vegetarian   — true
is_vegan        — true
is_gluten_free  — true
is_dairy_free   — true
is_spicy        — true
cooking_method  — запеченное | вареное | жареное | на пару | сырое | тушеное
meal_time       — завтрак | обед | ужин | перекус

Пример TOON-ответа для "веганский салат без помидоров до 300 ккал":
search_query=салат;exclude_query=помидоры томаты;max_calories=300;query_logic=AND;is_vegetarian=true;is_vegan=true;category=Салаты
  `.trim();

  const rules = SEARCH_PARAMS_RULES(categories);
  const userPayload = `Запрос: "${query}"`;

  return {
    systemInstructions,
    rules,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
};

const getChatPromptTOON = (query, categories, historyContext) => {
  const systemInstructions = `
Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Проанализируй текущий запрос с учётом истории и верни ответ строго в формате TOON
без markdown-разметки.

СПЕЦИФИКАЦИЯ TOON ДЛЯ ЧАТА:
- Глобальные поля разделяются переносом строки.
- Значения rec (recommendation) и err (not_found_message) пишутся без кавычек,
  каждое на отдельной строке после ключа.
- Вложенный объект params (= search_params) записывается как:
  params(ключ=значение;ключ=значение;...)
  Внутри используй ТОТ ЖЕ полный список полей, что и в режиме парсера
  (search_query, exclude_query, min_calories, max_calories, min_proteins,
  max_price, category, sort_by, query_logic — обязательно, is_vegetarian,
  is_vegan, is_gluten_free, is_dairy_free, is_spicy, cooking_method, meal_time).
  Пустые/null поля внутри params опускаются, КРОМЕ query_logic.
- Массив слотов (мульти-поиск) — slots((ключ=значение;...)(ключ=значение;...)).
  Используй slots ВМЕСТО params, только если пользователь явно просит несколько
  разных позиций одновременно ("мясное + салат + напиток").

Пример обычного ответа:
rec=Отличный выбор для лёгкого обеда с балансом белков и клетчатки!
params(search_query=салат;exclude_query=помидоры томаты;max_calories=300;query_logic=AND;is_vegetarian=true;is_vegan=true;category=Салаты)

Пример мульти-слота:
rec=Подобрала суп, горячее мясное блюдо и напиток без сахара специально для вас.
slots((search_query=суп;query_logic=OR;category=Супы)(search_query=мясо стейк курица;query_logic=OR)(search_query=напиток;exclude_query=сахар;query_logic=OR))

Пример "не найдено":
err=К сожалению, в нашем меню сейчас нет подходящих блюд по этому запросу. Попробуйте уточнить параметры поиска.
params(search_query=пельмени;query_logic=OR)
  `.trim();

  const rules = SEARCH_PARAMS_RULES(categories);
  const userPayload = `
Доступные категории: ${categories.join(", ")}.
${historyContext}

Запрос: "${query}"
  `.trim();

  return {
    systemInstructions,
    rules,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
};

// ════════════════════════════════════════════════════════════════════════════
// ВАЛИДАЦИЯ ОТВЕТОВ
// ════════════════════════════════════════════════════════════════════════════

const toonToObject = (text) => {
  const result = {};
  const lines = text.trim().split("\n");

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const recMatch = line.match(/^rec=(.*)$/s);
    if (recMatch) {
      result.recommendation = recMatch[1].trim();
      continue;
    }
    const errMatch = line.match(/^err=(.*)$/s);
    if (errMatch) {
      result.not_found_message = errMatch[1].trim();
      continue;
    }

    const paramsMatch = line.match(/^params\((.*)\)$/);
    if (paramsMatch) {
      result.search_params = parseFlatToon(paramsMatch[1]);
      continue;
    }

    const slotsMatch = line.match(/^slots\((.*)\)$/);
    if (slotsMatch) {
      const slotBodies = [...slotsMatch[1].matchAll(/\(([^()]*)\)/g)].map(
        (m) => m[1],
      );
      result.search_slots = slotBodies.map(parseFlatToon);
      continue;
    }

    if (
      line.includes("=") &&
      !line.startsWith("params") &&
      !line.startsWith("slots")
    ) {
      Object.assign(result, parseFlatToon(line));
    }
  }
  return result;
};

const parseFlatToon = (str) => {
  const obj = {};
  const pairs = str
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  for (const pair of pairs) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const key = pair.slice(0, idx).trim();
    let val = pair.slice(idx + 1).trim();
    if (val === "true") obj[key] = true;
    else if (val === "false") obj[key] = false;
    else if (!isNaN(Number(val)) && val !== "") obj[key] = Number(val);
    else obj[key] = val;
  }
  return obj;
};

const validateParserResult = (obj) => {
  if (!obj || typeof obj !== "object") {
    return { valid: false, missing: SCHEMA_FIELDS, parsedOk: false };
  }
  const required = ["query_logic"];
  const missing = required.filter((f) => obj[f] === undefined);
  return { valid: missing.length === 0, missing, parsedOk: true };
};

const validateChatResult = (obj) => {
  if (!obj || typeof obj !== "object") {
    return { valid: false, missing: CHAT_SCHEMA_FIELDS, parsedOk: false };
  }
  const hasParamsOrSlots = obj.search_params || obj.search_slots;
  const hasText = obj.recommendation || obj.not_found_message;
  const missing = [];
  if (!hasParamsOrSlots) missing.push("search_params|search_slots");
  if (!hasText) missing.push("recommendation|not_found_message");
  return { valid: missing.length === 0, missing, parsedOk: true };
};

// ════════════════════════════════════════════════════════════════════════════
// ВЫПОЛНЕНИЕ ОДНОГО ТЕСТ-КЕЙСА
// ════════════════════════════════════════════════════════════════════════════

const runOne = async (model, format, tc) => {
  let comps;
  if (tc.type === "parser") {
    comps =
      format === "json"
        ? getParserPromptJSON(tc.query, MOCK_CATEGORIES)
        : getParserPromptTOON(tc.query, MOCK_CATEGORIES);
  } else {
    const historyContext = buildHistoryContext(tc.history || []);
    comps =
      format === "json"
        ? getChatPromptJSON(tc.query, MOCK_CATEGORIES, historyContext)
        : getChatPromptTOON(tc.query, MOCK_CATEGORIES, historyContext);
  }
  const fullPrompt = comps.fullPrompt;

  try {
    const result = await model.generateContent(fullPrompt);
    const responseText = result.response.text();

    let input = 0,
      output = 0;
    if (result.response.usageMetadata) {
      input = result.response.usageMetadata.promptTokenCount;
      output = result.response.usageMetadata.candidatesTokenCount;
    } else {
      const countInput = await model.countTokens(fullPrompt);
      const countOutput = await model.countTokens(responseText);
      input = countInput.totalTokens;
      output = countOutput.totalTokens;
    }

    const [systemCount, rulesCount, queryCount] = await Promise.all([
      model.countTokens(comps.systemInstructions),
      model.countTokens(comps.rules),
      model.countTokens(comps.userPayload),
    ]);
    const systemTokens = systemCount.totalTokens;
    const rulesTokens = rulesCount.totalTokens;
    const queryTokens = queryCount.totalTokens;

    let parsedOk = false,
      valid = false,
      missing = [],
      parseError = null;
    try {
      let parsedObj;
      if (format === "json") {
        parsedObj = JSON.parse(responseText);
      } else {
        parsedObj = toonToObject(responseText);
      }
      const v =
        tc.type === "parser"
          ? validateParserResult(parsedObj)
          : validateChatResult(parsedObj);
      parsedOk = v.parsedOk;
      valid = v.valid;
      missing = v.missing;
    } catch (e) {
      parseError = e.message;
    }

    const total = input + output;
    const cost =
      (input / 1e6) * PRICE_INPUT_PER_M + (output / 1e6) * PRICE_OUTPUT_PER_M;

    return {
      success: true,
      format,
      scenario: tc.scenario,
      query: tc.query,
      input,
      output,
      total,
      cost,
      systemTokens,
      rulesTokens,
      queryTokens,
      parsedOk,
      valid,
      missing,
      parseError,
      rawResponse: responseText,
    };
  } catch (err) {
    return {
      success: false,
      format,
      scenario: tc.scenario,
      error: err.message,
    };
  }
};

// ════════════════════════════════════════════════════════════════════════════
// ВЫВОД ТАБЛИЦ
// ════════════════════════════════════════════════════════════════════════════

const printTable = (results, title) => {
  console.log("\n" + "=".repeat(95));
  console.log(title);
  console.log("=".repeat(95));
  console.log(
    "| Scenario | Sys Prompt | User Query | Output | Total | Cost (USD) | Valid? |",
  );
  console.log("|:---|---:|---:|---:|---:|---:|:---:|");

  let sumSys = 0,
    sumQuery = 0,
    sumO = 0,
    sumT = 0,
    sumC = 0,
    validCount = 0;

  for (const r of results) {
    if (!r.success) {
      console.log(`| ${r.scenario} | ERROR: ${r.error} | | | | | |`);
      continue;
    }

    const sysPromptTokens = r.systemTokens + r.rulesTokens;
    console.log(
      `| ${r.scenario} | ${sysPromptTokens} | ${r.queryTokens} | ${r.output} | ${r.total} | $${r.cost.toFixed(6)} | ${r.valid ? "✅" : "❌ " + (r.parseError || r.missing.join(","))} |`,
    );

    sumSys += sysPromptTokens;
    sumQuery += r.queryTokens;
    sumO += r.output;
    sumT += r.total;
    sumC += r.cost;

    if (r.valid) validCount++;
  }

  const n = results.filter((r) => r.success).length;
  const avgSys = Math.round(sumSys / n);
  const avgQuery = Math.round(sumQuery / n);
  const avgOutput = Math.round(sumO / n);
  const avgTotal = Math.round(sumT / n);
  const avgCost = sumC / n;

  console.log(
    `| **Average** | **${avgSys}** | **${avgQuery}** | **${avgOutput}** | **${avgTotal}** | **$${avgCost.toFixed(6)}** | **${validCount}/${n} valid** |`,
  );
  return {
    avgInput: avgSys + avgQuery,
    avgOutput,
    avgTotal,
    avgCost,
    validCount,
    n,
  };
};

const main = async () => {
  const model = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "text/plain" },
  });
  const modelJsonMode = genAI.getGenerativeModel({
    model: MODEL_NAME,
    generationConfig: { responseMimeType: "application/json" },
  });

  console.log(`Сравнение JSON vs TOON | Модель: ${MODEL_NAME}\n`);

  const jsonResults = [];
  const toonResults = [];

  for (const tc of SCENARIOS) {
    console.log(`→ JSON: ${tc.scenario}...`);
    jsonResults.push(await runOne(modelJsonMode, "json", tc));
    await new Promise((r) => setTimeout(r, 1500));

    console.log(`→ TOON: ${tc.scenario}...`);
    toonResults.push(await runOne(model, "toon", tc));
    await new Promise((r) => setTimeout(r, 1500));
  }

  const jsonSummary = printTable(jsonResults, "JSON — РЕЗУЛЬТАТЫ");
  const toonSummary = printTable(toonResults, "TOON — РЕЗУЛЬТАТЫ");

  // ── Честное сравнение: экономия считается только по валидным ответам ─────
  console.log("\n" + "=".repeat(78));
  console.log("ИТОГОВОЕ СРАВНЕНИЕ (с учётом валидности)");
  console.log("=".repeat(78));
  console.log(
    `JSON валидных ответов: ${jsonSummary.validCount}/${jsonSummary.n}`,
  );
  console.log(
    `TOON валидных ответов: ${toonSummary.validCount}/${toonSummary.n}`,
  );

  if (toonSummary.validCount < toonSummary.n) {
    console.log(
      `\n⚠️  ВНИМАНИЕ: ${toonSummary.n - toonSummary.validCount} из ${toonSummary.n} TOON-ответов`,
    );
    console.log(
      `   не прошли валидацию (отсутствуют обязательные поля или ошибка парсинга).`,
    );
    console.log(
      `   Сравнение токенов по ВСЕМ ответам (включая невалидные) даёт оптимистичную`,
    );
    console.log(
      `   оценку экономии. Ниже — пересчёт ТОЛЬКО по валидным ответам обеих сторон.`,
    );
  }

  const validJson = jsonResults.filter((r) => r.success && r.valid);
  const validToon = toonResults.filter((r) => r.success && r.valid);

  if (validJson.length && validToon.length) {
    const avg = (arr, fn) => arr.reduce((s, x) => s + fn(x), 0) / arr.length;
    const vjSys = avg(validJson, (r) => r.systemTokens + r.rulesTokens);
    const vjQuery = avg(validJson, (r) => r.queryTokens);
    const vjO = avg(validJson, (r) => r.output);

    const vtSys = avg(validToon, (r) => r.systemTokens + r.rulesTokens);
    const vtQuery = avg(validToon, (r) => r.queryTokens);
    const vtO = avg(validToon, (r) => r.output);

    const vjC = avg(validJson, (r) => r.cost);
    const vtC = avg(validToon, (r) => r.cost);

    console.log(
      `\nТолько среди валидных ответов (JSON n=${validJson.length}, TOON n=${validToon.length}):`,
    );
    console.log(
      `  Sys Prompt: JSON ${Math.round(vjSys)} → TOON ${Math.round(vtSys)}  (${(((vjSys - vtSys) / vjSys) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  User Query: JSON ${Math.round(vjQuery)} → TOON ${Math.round(vtQuery)}  (${(((vjQuery - vtQuery) / vjQuery) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Output:     JSON ${Math.round(vjO)} → TOON ${Math.round(vtO)}  (${(((vjO - vtO) / vjO) * 100).toFixed(1)}%)`,
    );
    console.log(
      `  Cost:       JSON $${vjC.toFixed(6)} → TOON $${vtC.toFixed(6)}  (${(((vjC - vtC) / vjC) * 100).toFixed(1)}%)`,
    );
  } else {
    console.log(
      "\n❌ Недостаточно валидных ответов для честного сравнения. Проверь промпты/парсер.",
    );
  }

  const report = {
    model: MODEL_NAME,
    generatedAt: new Date().toISOString(),
    json: { results: jsonResults, summary: jsonSummary },
    toon: { results: toonResults, summary: toonSummary },
  };
  writeFileSync(
    "comparison_report.json",
    JSON.stringify(report, null, 2),
    "utf8",
  );
  console.log("\n📄 Полный отчёт сохранён в comparison_report.json");
};

main().catch(console.error);
