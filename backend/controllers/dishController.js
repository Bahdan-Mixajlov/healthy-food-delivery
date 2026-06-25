import { db } from "../config/db.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { LRUCache } from "lru-cache"; // npm install lru-cache
import dotenv from "dotenv";
import snowball from "node-snowball";

dotenv.config();

/* ════════════════════════════════════════════════════════════════════════════
 * МИГРАЦИИ БД — выполнить один раз перед использованием новых фич
 * ════════════════════════════════════════════════════════════════════════════
 *
 * 1. Флаги и атрибуты блюд (без миграции — фильтры молча пропускаются):
 *
 *   ALTER TABLE dish
 *     ADD COLUMN is_vegetarian  TINYINT(1)  DEFAULT 0,
 *     ADD COLUMN is_vegan       TINYINT(1)  DEFAULT 0,
 *     ADD COLUMN is_gluten_free TINYINT(1)  DEFAULT 0,
 *     ADD COLUMN is_dairy_free  TINYINT(1)  DEFAULT 0,
 *     ADD COLUMN is_spicy       TINYINT(1)  DEFAULT 0,
 *     ADD COLUMN cooking_method VARCHAR(50) NULL,
 *     ADD COLUMN meal_time      VARCHAR(30) NULL;
 *
 *   -- cooking_method: 'запеченное' | 'вареное' | 'жареное' | 'на пару' | 'сырое' | 'тушеное'
 *   -- meal_time:      'завтрак'    | 'обед'    | 'ужин'    | 'перекус'
 *
 * 2. Лог поисков (аналитика — без таблицы логирование молча пропускается):
 *
 *   CREATE TABLE IF NOT EXISTS search_log (
 *     id             INT AUTO_INCREMENT PRIMARY KEY,
 *     endpoint       VARCHAR(20)  NOT NULL,
 *     query_raw      VARCHAR(300) NOT NULL,
 *     search_params  JSON,
 *     results_count  INT          DEFAULT 0,
 *     was_fallback   TINYINT(1)   DEFAULT 0,
 *     used_relaxed   TINYINT(1)   DEFAULT 0,
 *     gemini_cached  TINYINT(1)   DEFAULT 0,
 *     created_at     TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
 *     INDEX idx_query   (query_raw),
 *     INDEX idx_results (results_count),
 *     INDEX idx_created (created_at)
 *   );
 *
 * ════════════════════════════════════════════════════════════════════════════
 */

// ── Guard ────────────────────────────────────────────────────────────────────
if (!process.env.GEMINI_API_KEY) {
  throw new Error("[dishController] GEMINI_API_KEY не задан в .env");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ── Константы ────────────────────────────────────────────────────────────────
const DIET_CALORIE_LIMIT = 450;
const SMART_SEARCH_LIMIT = 15;
const CHAT_DISHES_LIMIT = 5;
const HISTORY_LIMIT = 6;
const GEMINI_TIMEOUT_MS = 8000;
const GEMINI_RETRIES = 1;
const MAX_HISTORY_CHARS = 1500;
const GEMINI_CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут
const RESULTS_CACHE_TTL_MS = 5 * 60 * 1000; //  5 минут
const GEMINI_CACHE_MAX = 500;
const RESULTS_CACHE_MAX = 200;

// ── LRU Кэши ────────────────────────────────────────────────────────────────
// Кэш ответов Gemini: одинаковые запросы не тратят токены повторно
const geminiCache = new LRUCache({
  max: GEMINI_CACHE_MAX,
  ttl: GEMINI_CACHE_TTL_MS,
});
// Кэш результатов SQL: популярные запросы не нагружают БД
const resultsCache = new LRUCache({
  max: RESULTS_CACHE_MAX,
  ttl: RESULTS_CACHE_TTL_MS,
});

// ── Определяем доступность флагов блюд (проверяем один раз при старте) ───────
let DISH_FLAGS_ENABLED = false;
(async () => {
  try {
    await db.execute("SELECT is_vegetarian FROM dish LIMIT 1");
    DISH_FLAGS_ENABLED = true;
    console.log(
      "[dishController] Флаги блюд (is_vegetarian и т.д.): ✅ включены",
    );
  } catch {
    console.log(
      "[dishController] Флаги блюд: ⚠️  отключены (выполни миграцию из комментария)",
    );
  }
})();

// ════════════════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════════════════

const sanitizeInput = (raw) =>
  String(raw)
    .trim()
    .slice(0, 300)
    .replace(/["\\`]/g, " ");

// Находит первый {...} в тексте и парсит его — устойчиво к обёрткам ```json
const safeJsonParse = (text) => {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1)
    throw new Error("JSON-объект не найден в ответе ИИ");
  return JSON.parse(text.substring(start, end + 1).trim());
};

/**
 * Валидирует и нормализует search_params из ответа Gemini.
 * Защищает от строки "null", NaN, отрицательных чисел, булевых строк.
 */
const validateSearchParams = (raw) => {
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

/** Валидирует массив search_slots, каждый прогоняет через validateSearchParams */
const validateSearchSlots = (raw) => {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const slots = raw
    .map(validateSearchParams)
    .filter((s) => s.search_query || s.category || s.exclude_query);
  return slots.length >= 2 ? slots : null;
};

/** Стемминг одного слова (Snowball, русский язык) */
const stemWord = (word) => {
  try {
    return (
      snowball.stemword(word.toLowerCase().trim(), "russian") ||
      word.toLowerCase().trim()
    );
  } catch {
    return word.toLowerCase().trim();
  }
};

/** Разбивает фразу на слова, стеммирует, возвращает уникальные стеммы */
const stemPhrase = (phrase) => {
  if (!phrase?.trim()) return [];
  return [
    ...new Set(
      phrase
        .replace(/[,.;!?()"']/g, " ")
        .split(/\s+/)
        .filter(Boolean)
        .map(stemWord),
    ),
  ];
};

/** Кэш категорий на 10 минут */
let _categoriesCache = null;
let _cacheExpiry = 0;
const fetchCategories = async () => {
  if (_categoriesCache && Date.now() < _cacheExpiry) return _categoriesCache;
  try {
    const [rows] = await db.execute("SELECT name FROM category ORDER BY name");
    _categoriesCache = rows.map((r) => r.name);
    _cacheExpiry = Date.now() + 10 * 60 * 1000;
    return _categoriesCache;
  } catch (err) {
    console.error("[fetchCategories]", err.message);
    return _categoriesCache || [];
  }
};

/** Экранирует спецсимволы SQL LIKE */
const escapeLike = (str) =>
  str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

/** Нормализует запрос для использования как ключ кэша */
const normalizeQueryKey = (q) =>
  q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!?.,']/g, "");

/** Санитизирует историю чата (с защитой search_params от инъекций) */
const sanitizeHistory = (rawHistory) => {
  if (!Array.isArray(rawHistory)) return [];
  const filtered = rawHistory
    .filter(
      (h) => h && typeof h.role === "string" && typeof h.content === "string",
    )
    .map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: sanitizeInput(h.content),
      ...(h.search_params
        ? { search_params: validateSearchParams(h.search_params) }
        : {}),
    }));
  let totalChars = 0;
  const trimmed = [];
  for (let i = filtered.length - 1; i >= 0; i--) {
    totalChars += filtered[i].content.length;
    if (totalChars > MAX_HISTORY_CHARS) break;
    trimmed.unshift(filtered[i]);
  }
  return trimmed.slice(-HISTORY_LIMIT);
};

/** Вызывает fn() с таймаутом + retry */
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

const buildHistoryContext = (history) => {
  if (!history.length) return "";
  const lines = history.map((h) => {
    if (h.role === "user") return `  Пользователь: "${h.content}"`;
    const p = h.search_params
      ? ` [фильтры: ${JSON.stringify(h.search_params)}]`
      : "";
    return `  ИИ: "${h.content.slice(0, 150)}"${p}`;
  });
  return "\nИстория диалога:\n" + lines.join("\n") + "\n";
};

const buildInterpretedLabel = (p) => {
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

// ════════════════════════════════════════════════════════════════════════════
// SEARCH LOGGING (молча пропускается если таблицы нет)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Пишет строку в search_log.
 * Не бросает исключений — если таблицы нет, просто пропускает.
 *
 * Полезные SQL-запросы для аналитики:
 *   -- Что ищут и не находят (дыры в меню)
 *   SELECT query_raw, COUNT(*) AS cnt FROM search_log
 *   WHERE results_count = 0 GROUP BY query_raw ORDER BY cnt DESC LIMIT 20;
 *
 *   -- Насколько часто срабатывает relaxed-поиск
 *   SELECT COUNT(*) AS relaxed FROM search_log WHERE used_relaxed = 1;
 *
 *   -- Эффективность Gemini-кэша
 *   SELECT AVG(gemini_cached) * 100 AS cache_hit_rate FROM search_log;
 */
const logSearch = async ({
  endpoint,
  query,
  params,
  count,
  fallback,
  relaxed,
  cached,
}) => {
  try {
    await db.execute(
      `INSERT INTO search_log
         (endpoint, query_raw, search_params, results_count, was_fallback, used_relaxed, gemini_cached)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        endpoint,
        query.slice(0, 300),
        JSON.stringify(params ?? null),
        count ?? 0,
        fallback ? 1 : 0,
        relaxed ? 1 : 0,
        cached ? 1 : 0,
      ],
    );
  } catch {
    /* search_log не создана — ничего не делаем */
  }
};

// ════════════════════════════════════════════════════════════════════════════
// SQL BUILDER
// ════════════════════════════════════════════════════════════════════════════

const buildDishQuery = (searchParams, limit) => {
  const safeLimit = Math.floor(
    Math.max(
      1,
      Math.min(
        Number.isFinite(Number(limit)) ? Math.abs(Number(limit)) : 10,
        100,
      ),
    ),
  );

  let sql = `
    SELECT
      d.id_dish    AS id,
      d.name       AS title,
      d.description,
      d.price,
      d.calories,
      d.proteins,
      d.fats,
      d.carbs,
      d.weight,
      d.id_category,
      d.image_url  AS image
    FROM dish d
    LEFT JOIN category c ON d.id_category = c.id_category
    WHERE 1=1
  `;
  const params = [];

  // ── Числовые фильтры ──────────────────────────────────────────────────────
  if (searchParams.min_calories) {
    sql += " AND d.calories >= ?";
    params.push(searchParams.min_calories);
  }
  if (searchParams.max_calories) {
    sql += " AND d.calories <= ?";
    params.push(searchParams.max_calories);
  }
  if (searchParams.min_proteins) {
    sql += " AND d.proteins >= ?";
    params.push(searchParams.min_proteins);
  }
  if (searchParams.max_price) {
    sql += " AND d.price <= ?";
    params.push(searchParams.max_price);
  }
  if (searchParams.category) {
    sql += " AND c.name = ?";
    params.push(searchParams.category);
  }

  // ── Флаги блюд (только если миграция выполнена) ───────────────────────────
  if (DISH_FLAGS_ENABLED) {
    if (searchParams.is_vegetarian) sql += " AND d.is_vegetarian = 1";
    if (searchParams.is_vegan) sql += " AND d.is_vegan = 1";
    if (searchParams.is_gluten_free) sql += " AND d.is_gluten_free = 1";
    if (searchParams.is_dairy_free) sql += " AND d.is_dairy_free = 1";
    if (searchParams.is_spicy) sql += " AND d.is_spicy = 1";
    if (searchParams.cooking_method) {
      sql += " AND d.cooking_method = ?";
      params.push(searchParams.cooking_method);
    }
    if (searchParams.meal_time) {
      sql += " AND d.meal_time = ?";
      params.push(searchParams.meal_time);
    }
  }

  // ── Исключение слов и ингредиентов ────────────────────────────────────────
  if (searchParams.exclude_query) {
    stemPhrase(searchParams.exclude_query).forEach((stem, idx) => {
      const pattern = `%${escapeLike(stem)}%`;
      sql += `
        AND LOWER(d.name) NOT LIKE LOWER(?)
        AND LOWER(d.description) NOT LIKE LOWER(?)
        AND NOT EXISTS (
          SELECT 1 FROM dish_composition dc_ex${idx}
          JOIN ingredient i_ex${idx} ON dc_ex${idx}.id_ingredient = i_ex${idx}.id_ingredient
          WHERE dc_ex${idx}.id_dish = d.id_dish AND LOWER(i_ex${idx}.name) LIKE LOWER(?)
        )
      `;
      params.push(pattern, pattern, pattern);
    });
  }

  // ── Поисковый блок ────────────────────────────────────────────────────────
  const searchStems = stemPhrase(searchParams.search_query || "");

  if (searchStems.length > 0) {
    if (searchParams.query_logic === "AND") {
      // Все слова должны присутствовать — отдельный AND на каждый стемм
      searchStems.forEach((stem, idx) => {
        const pattern = `%${escapeLike(stem)}%`;
        sql += `
          AND (
            LOWER(d.name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)
            OR EXISTS (
              SELECT 1 FROM dish_composition dc_a${idx}
              JOIN ingredient i_a${idx} ON dc_a${idx}.id_ingredient = i_a${idx}.id_ingredient
              WHERE dc_a${idx}.id_dish = d.id_dish AND LOWER(i_a${idx}.name) LIKE LOWER(?)
            )
          )
        `;
        params.push(pattern, pattern, pattern);
      });
    } else {
      // Достаточно одного совпадения — все через OR
      const orClauses = searchStems.map((stem, idx) => {
        const pattern = `%${escapeLike(stem)}%`;
        params.push(pattern, pattern, pattern);
        return `(
          LOWER(d.name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)
          OR EXISTS (
            SELECT 1 FROM dish_composition dc_o${idx}
            JOIN ingredient i_o${idx} ON dc_o${idx}.id_ingredient = i_o${idx}.id_ingredient
            WHERE dc_o${idx}.id_dish = d.id_dish AND LOWER(i_o${idx}.name) LIKE LOWER(?)
          )
        )`;
      });
      sql += " AND (" + orClauses.join(" OR ") + ")";
    }
  }

  // ── Сортировка ────────────────────────────────────────────────────────────
  // Весовой скор: количество стеммов, совпавших в НАЗВАНИИ блюда
  let orderClause = "";
  if (searchStems.length > 0) {
    const scoreExpr = searchStems
      .map((stem) => {
        params.push(`%${escapeLike(stem)}%`);
        return `(CASE WHEN LOWER(d.name) LIKE LOWER(?) THEN 1 ELSE 0 END)`;
      })
      .join(" + ");
    orderClause = `(${scoreExpr}) DESC`;
  }

  const SORT_MAP = {
    price_asc: "d.price ASC",
    price_desc: "d.price DESC",
    kcal_asc: "d.calories ASC",
    kcal_desc: "d.calories DESC",
  };
  const customSort = SORT_MAP[searchParams.sort_by];

  const orderParts = [
    orderClause,
    customSort,
    "d.calories ASC",
    "d.id_dish DESC",
  ].filter(Boolean);
  sql += " ORDER BY " + orderParts.join(", ");

  sql += ` LIMIT ${safeLimit}`;
  return { sql, params };
};

/**
 * Прогрессивный relaxed-поиск: при 0 результатах пробует снимать
 * фильтры один за другим до тех пор, пока что-то не найдётся.
 *
 * Возвращает { rows, relaxedParams } — relaxedParams показывает,
 * какой набор фильтров сработал (или null если всё равно пусто).
 */
const tryRelaxedSearch = async (searchParams, limit) => {
  const steps = [
    // Шаг 1: убрать категорию — самое частое ограничение
    { ...searchParams, category: null },
    // Шаг 2: убрать категорию + исключения (вдруг exclude_query слишком строгий)
    { ...searchParams, category: null, exclude_query: null },
    // Шаг 3: убрать категорию + исключения + флаги + числа, оставить только поиск
    {
      search_query: searchParams.search_query,
      exclude_query: null,
      category: null,
      min_calories: null,
      max_calories: null,
      min_proteins: null,
      max_price: null,
      sort_by: null,
      query_logic: "OR",
      is_vegetarian: null,
      is_vegan: null,
      is_gluten_free: null,
      is_dairy_free: null,
      is_spicy: null,
      cooking_method: null,
      meal_time: null,
    },
    // Шаг 4: если и search_query пустой — вернуть свежие блюда
    {
      search_query: null,
      exclude_query: null,
      category: null,
      min_calories: null,
      max_calories: null,
      min_proteins: null,
      max_price: null,
      sort_by: null,
      query_logic: "OR",
      is_vegetarian: null,
      is_vegan: null,
      is_gluten_free: null,
      is_dairy_free: null,
      is_spicy: null,
      cooking_method: null,
      meal_time: null,
    },
  ];

  const originalKey = JSON.stringify(searchParams);
  for (const relaxed of steps) {
    if (JSON.stringify(relaxed) === originalKey) continue;
    try {
      const { sql, params } = buildDishQuery(relaxed, limit);
      const [rows] = await db.execute(sql, params);
      if (rows.length > 0) return { rows, relaxedParams: relaxed };
    } catch (err) {
      console.error("[tryRelaxedSearch] ошибка шага:", err.message);
    }
  }
  return { rows: [], relaxedParams: null };
};

// ════════════════════════════════════════════════════════════════════════════
// MULTI-SLOT
// ════════════════════════════════════════════════════════════════════════════

/**
 * Параллельно выполняет запрос для каждого слота (limit=1).
 * Если слот пуст — пробует relaxed-поиск для этого слота.
 * Дедуплицирует результат по id блюда.
 */
const executeMultiSlot = async (slots) => {
  const results = await Promise.all(
    slots.map(async (slot) => {
      try {
        const { sql, params } = buildDishQuery(slot, 1);
        const [rows] = await db.execute(sql, params);
        if (rows.length > 0) return rows[0];
        // Слот вернул 0 — пробуем relaxed
        const { rows: relaxedRows } = await tryRelaxedSearch(slot, 1);
        return relaxedRows[0] ?? null;
      } catch (err) {
        console.error("[executeMultiSlot] ошибка слота:", err.message);
        return null;
      }
    }),
  );
  const seen = new Set();
  return results.filter((d) => {
    if (!d || seen.has(d.id)) return false;
    seen.add(d.id);
    return true;
  });
};

// ════════════════════════════════════════════════════════════════════════════
// GEMINI ПРОМПТЫ
// ════════════════════════════════════════════════════════════════════════════

/**
 * Общий блок правил для search_params — используется в обоих промптах.
 */
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

const buildChatPrompt = (query, categories, historyContext) =>
  `
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

Доступные категории: ${categories.join(", ")}.
${historyContext}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
МУЛЬТИ-СЛОТ (search_slots)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Используй search_slots ВМЕСТО search_params ТОЛЬКО если пользователь явно просит
несколько разных позиций одновременно: "мясное + салат + напиток", "суп + горячее + десерт".
Каждый слот = { search_query, exclude_query, category, query_logic, max_calories, min_proteins, max_price }.
При мульти-слоте → search_params заполни нулями (он игнорируется).
В остальных случаях → search_slots: null.

Пример для "одно мясное, один салат и один напиток":
"search_slots": [
  { "search_query": "мясо стейк курица", "exclude_query": null, "category": null, "query_logic": "OR" },
  { "search_query": "салат",             "exclude_query": null, "category": null, "query_logic": "OR" },
  { "search_query": "напиток сок чай",   "exclude_query": null, "category": null, "query_logic": "OR" }
]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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

// ════════════════════════════════════════════════════════════════════════════
// GEMINI ВЫЗОВЫ (с кэшированием)
// ════════════════════════════════════════════════════════════════════════════

const parseQueryWithGemini = async (query, categories) => {
  const cacheKey = `parser::${normalizeQueryKey(query)}::${categories.join(",")}`;
  if (geminiCache.has(cacheKey)) {
    console.log("[Gemini cache HIT] parser:", query);
    return { result: geminiCache.get(cacheKey), cached: true };
  }
  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    generationConfig: { responseMimeType: "application/json" },
  });
  const raw = await geminiWithRetry(() =>
    model.generateContent(buildParserPrompt(query, categories)),
  );
  const result = validateSearchParams(safeJsonParse(raw.response.text()));
  geminiCache.set(cacheKey, result);
  return { result, cached: false };
};

const getChatGeminiResponse = async (query, categories, history) => {
  // Кэшируем чат только при пустой истории (первый вопрос — самый повторяемый)
  const cacheKey =
    history.length === 0
      ? `chat::${normalizeQueryKey(query)}::${categories.join(",")}`
      : null;

  if (cacheKey && geminiCache.has(cacheKey)) {
    console.log("[Gemini cache HIT] chat:", query);
    return { ...geminiCache.get(cacheKey), cached: true };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-3.1-flash-lite",
    generationConfig: { responseMimeType: "application/json" },
  });
  const raw = await geminiWithRetry(() =>
    model.generateContent(
      buildChatPrompt(query, categories, buildHistoryContext(history)),
    ),
  );
  const parsed = safeJsonParse(raw.response.text());
  parsed.search_params = validateSearchParams(parsed.search_params);
  parsed.search_slots = validateSearchSlots(parsed.search_slots);

  if (cacheKey) geminiCache.set(cacheKey, parsed);
  return { ...parsed, cached: false };
};

// ════════════════════════════════════════════════════════════════════════════
// FALLBACK — при полном сбое Gemini
// ════════════════════════════════════════════════════════════════════════════

const fallbackTextSearch = async (searchText, res) => {
  try {
    const stems = stemPhrase(searchText);
    let sql = `
      SELECT DISTINCT
        d.id_dish AS id, d.name AS title, d.description,
        d.price, d.calories, d.proteins, d.fats, d.carbs,
        d.weight, d.id_category, d.image_url AS image
      FROM dish d
      LEFT JOIN dish_composition dc ON d.id_dish = dc.id_dish
      LEFT JOIN ingredient i ON dc.id_ingredient = i.id_ingredient
      WHERE 1=1
    `;
    const params = [];

    if (stems.length > 0) {
      // OR по всем стеммам
      const orClauses = stems.map((stem, idx) => {
        const p = `%${escapeLike(stem)}%`;
        params.push(p, p, p);
        return `(LOWER(d.name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)
                 OR EXISTS (SELECT 1 FROM dish_composition dc_f${idx}
                   JOIN ingredient i_f${idx} ON dc_f${idx}.id_ingredient = i_f${idx}.id_ingredient
                   WHERE dc_f${idx}.id_dish = d.id_dish AND LOWER(i_f${idx}.name) LIKE LOWER(?)))`;
      });
      sql += " AND (" + orClauses.join(" OR ") + ")";
      // Весовой скор в ORDER BY
      const scoreExpr = stems
        .map((stem) => {
          params.push(`%${escapeLike(stem)}%`);
          return `(CASE WHEN LOWER(d.name) LIKE LOWER(?) THEN 1 ELSE 0 END)`;
        })
        .join(" + ");
      sql += ` ORDER BY (${scoreExpr}) DESC, d.id_dish DESC`;
    } else {
      sql += " ORDER BY d.id_dish DESC";
    }
    sql += ` LIMIT ${SMART_SEARCH_LIMIT}`;

    const [rows] = await db.execute(sql, params);
    return res.status(200).json({
      dishes: rows,
      meta: {
        interpreted_as: searchText,
        filters_applied: null,
        fallback: true,
      },
    });
  } catch (err) {
    console.error("[fallbackTextSearch]", err.message);
    return res.status(500).json({ message: "Ошибка сервера" });
  }
};

// ════════════════════════════════════════════════════════════════════════════
// CONTROLLERS
// ════════════════════════════════════════════════════════════════════════════

// ── GET /api/dishes ──────────────────────────────────────────────────────────
export const getAllDishes = async (req, res) => {
  const { category, search, sortBy } = req.query;

  let query = `
    SELECT DISTINCT
      d.id_dish AS id, d.name AS title, d.description,
      d.price, d.calories, d.proteins, d.fats, d.carbs,
      d.weight, d.id_category, d.image_url AS image
    FROM dish d
    JOIN category c ON d.id_category = c.id_category
    WHERE 1=1
  `;
  const params = [];

  if (category && category !== "Все") {
    query += " AND c.name = ?";
    params.push(category);
  }

  if (search) {
    stemPhrase(search).forEach((stem, idx) => {
      const p = `%${escapeLike(stem)}%`;
      query += `
        AND (LOWER(d.name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)
        OR EXISTS (SELECT 1 FROM dish_composition dc${idx}
          JOIN ingredient i${idx} ON dc${idx}.id_ingredient = i${idx}.id_ingredient
          WHERE dc${idx}.id_dish = d.id_dish AND LOWER(i${idx}.name) LIKE LOWER(?)))
      `;
      params.push(p, p, p);
    });
  }

  const SORT_MAP = {
    price_asc: "d.price ASC",
    price_desc: "d.price DESC",
    kcal_desc: "d.calories DESC",
  };
  query += SORT_MAP[sortBy]
    ? ` ORDER BY ${SORT_MAP[sortBy]}`
    : " ORDER BY d.id_dish DESC";

  try {
    const [rows] = await db.execute(query, params);
    res.status(200).json(rows);
  } catch (err) {
    console.error("[getAllDishes]", err.message);
    res.status(500).json({ message: "Ошибка при получении блюд" });
  }
};

// ── GET /api/dishes/:id ──────────────────────────────────────────────────────
export const getDishById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await db.execute(
      `SELECT id_dish AS id, name AS title, description, price,
              calories, proteins, fats, carbs, weight, image_url AS image
       FROM dish WHERE id_dish = ?`,
      [id],
    );
    if (!rows.length)
      return res.status(404).json({ message: "Блюдо не найдено" });
    res.status(200).json(rows[0]);
  } catch (err) {
    console.error("[getDishById]", err.message);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

// ── GET /api/dishes/search?query=... ─────────────────────────────────────────
export const getSmartSearch = async (req, res) => {
  const rawQuery = req.query.query;
  if (!rawQuery?.trim())
    return res.status(400).json({ message: "Поисковый запрос пуст" });

  const query = sanitizeInput(rawQuery);

  // Кэш результатов поиска
  const resultsCacheKey = `smart::${normalizeQueryKey(query)}`;
  if (resultsCache.has(resultsCacheKey)) {
    console.log("[Results cache HIT] smart:", query);
    return res.status(200).json(resultsCache.get(resultsCacheKey));
  }

  let geminiCached = false;
  try {
    const categories = await fetchCategories();
    const { result: searchParams, cached } = await parseQueryWithGemini(
      query,
      categories,
    );
    geminiCached = cached;
    console.log("=== УМНЫЙ ПОИСК: параметры ===", searchParams);

    const { sql, params } = buildDishQuery(searchParams, SMART_SEARCH_LIMIT);
    let [rows] = await db.execute(sql, params);
    let relaxedParams = null;

    // Если ничего не нашли — прогрессивно снимаем фильтры
    if (rows.length === 0) {
      const relaxed = await tryRelaxedSearch(searchParams, SMART_SEARCH_LIMIT);
      rows = relaxed.rows;
      relaxedParams = relaxed.relaxedParams;
      if (relaxedParams)
        console.log("=== УМНЫЙ ПОИСК: relaxed сработал ===", relaxedParams);
    }

    const response = {
      dishes: rows,
      meta: {
        interpreted_as: buildInterpretedLabel(searchParams),
        filters_applied: searchParams,
        ...(relaxedParams
          ? { relaxed_to: buildInterpretedLabel(relaxedParams) }
          : {}),
      },
    };

    resultsCache.set(resultsCacheKey, response);

    // Логируем
    logSearch({
      endpoint: "smart",
      query,
      params: searchParams,
      count: rows.length,
      fallback: false,
      relaxed: !!relaxedParams,
      cached: geminiCached,
    });

    return res.status(200).json(response);
  } catch (err) {
    console.error("[getSmartSearch] Gemini error — fallback:", err.message);
    logSearch({
      endpoint: "smart",
      query,
      params: null,
      count: 0,
      fallback: true,
      relaxed: false,
      cached: false,
    });
    return fallbackTextSearch(query, res);
  }
};

// ── POST /api/dishes/ai-chat ─────────────────────────────────────────────────
export const getAIChatResponse = async (req, res) => {
  const { query: rawQuery, history: rawHistory = [] } = req.body;
  if (!rawQuery?.trim())
    return res.status(400).json({ message: "Запрос пуст" });

  const query = sanitizeInput(rawQuery);
  const history = sanitizeHistory(rawHistory);

  try {
    const categories = await fetchCategories();
    const {
      search_params,
      search_slots,
      recommendation,
      not_found_message,
      cached,
    } = await getChatGeminiResponse(query, categories, history);

    console.log("=== ЧАТ: Gemini response ===", {
      search_params,
      search_slots,
    });

    let dishes = [];
    let message = "";

    // ── ВЕТКА А: Мульти-слот ────────────────────────────────────────────────
    if (search_slots) {
      console.log("=== ЧАТ: мульти-слот, слотов:", search_slots.length);
      dishes = await executeMultiSlot(search_slots);
      message =
        dishes.length > 0
          ? recommendation ||
            `Вот подборка из ${dishes.length} позиций для вас!`
          : not_found_message ||
            "Не удалось подобрать все позиции. Попробуйте уточнить запрос.";

      logSearch({
        endpoint: "chat",
        query,
        params: { multi_slot: search_slots.length },
        count: dishes.length,
        fallback: false,
        relaxed: false,
        cached,
      });
    }
    // ── ВЕТКА Б: Обычный запрос ─────────────────────────────────────────────
    else {
      const p = search_params;
      const isPureTheory =
        !p.search_query &&
        !p.exclude_query &&
        !p.max_calories &&
        !p.min_calories &&
        !p.min_proteins &&
        !p.max_price &&
        !p.category &&
        !p.sort_by &&
        !p.is_vegetarian &&
        !p.is_gluten_free &&
        !p.is_dairy_free &&
        !p.is_spicy &&
        !p.cooking_method &&
        !p.meal_time;

      if (isPureTheory) {
        dishes = [];
        message =
          not_found_message ||
          "Отличный вопрос! К сожалению, в нашем меню нет подходящих позиций по этому запросу.";
        logSearch({
          endpoint: "chat",
          query,
          params: p,
          count: 0,
          fallback: false,
          relaxed: false,
          cached,
        });
      } else {
        const { sql, params } = buildDishQuery(p, CHAT_DISHES_LIMIT);
        let [dbRows] = await db.execute(sql, params);
        let relaxed = false;

        // Relaxed-поиск если пусто
        if (dbRows.length === 0) {
          const rel = await tryRelaxedSearch(p, CHAT_DISHES_LIMIT);
          if (rel.rows.length > 0) {
            dbRows = rel.rows;
            relaxed = true;
          }
        }

        dishes = dbRows;
        message =
          dishes.length > 0
            ? recommendation || not_found_message
            : not_found_message ||
              "Извините, в нашем меню сейчас нет подходящих блюд. Попробуйте другой запрос!";

        logSearch({
          endpoint: "chat",
          query,
          params: p,
          count: dishes.length,
          fallback: false,
          relaxed,
          cached,
        });
      }
    }

    return res.status(200).json({ message, dishes, search_params });
  } catch (err) {
    console.error("[getAIChatResponse]", err.message);
    logSearch({
      endpoint: "chat",
      query,
      params: null,
      count: 0,
      fallback: true,
      relaxed: false,
      cached: false,
    });
    return res.status(500).json({
      message:
        "Извините, временные технические трудности. Попробуйте чуть позже.",
      dishes: [],
    });
  }
};
