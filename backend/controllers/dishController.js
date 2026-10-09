import { db } from "../config/db.js";
import { LRUCache } from "lru-cache";
import snowball from "node-snowball";
import * as aiProvider from "../providers/gemini.js";

const SMART_SEARCH_LIMIT = 15;
const CHAT_DISHES_LIMIT = 5;
const HISTORY_LIMIT = 6;
const MAX_HISTORY_CHARS = 1500;
const RESULTS_CACHE_TTL_MS = 5 * 60 * 1000;
const RESULTS_CACHE_MAX = 200;

const CANDIDATE_POOL_SMART = 30;
const CANDIDATE_POOL_CHAT = 20;

const resultsCache = new LRUCache({
  max: RESULTS_CACHE_MAX,
  ttl: RESULTS_CACHE_TTL_MS,
});

let DISH_FLAGS_ENABLED = false;
(async () => {
  try {
    await db.execute("SELECT is_vegetarian FROM dish LIMIT 1");
    DISH_FLAGS_ENABLED = true;
  } catch {}
})();

const sanitizeInput = (raw) =>
  String(raw)
    .trim()
    .slice(0, 300)
    .replace(/["\\`]/g, " ");

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

const escapeLike = (str) =>
  str.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");

const normalizeQueryKey = (q) =>
  q
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[!?.,']/g, "");

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
        ? { search_params: aiProvider.validateSearchParams(h.search_params) }
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

const logSearch = async ({
  endpoint,
  query,
  params,
  count,
  fallback,
  relaxed,
  ranking,
  cached,
}) => {
  try {
    await db.execute(
      `INSERT INTO search_log
         (endpoint, query_raw, search_params, results_count, was_fallback, used_relaxed, used_ranking, gemini_cached)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        endpoint,
        query.slice(0, 300),
        JSON.stringify(params ?? null),
        count ?? 0,
        fallback ? 1 : 0,
        relaxed ? 1 : 0,
        ranking ? 1 : 0,
        cached ? 1 : 0,
      ],
    );
  } catch {}
};

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

  const searchStems = stemPhrase(searchParams.search_query || "");

  if (searchStems.length > 0) {
    if (searchParams.query_logic === "AND") {
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

const tryRelaxedSearch = async (searchParams, limit) => {
  const steps = [
    { ...searchParams, category: null },
    { ...searchParams, category: null, exclude_query: null },
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

const applyRanking = (candidates, selectedIds, limit) => {
  if (!selectedIds) return candidates.slice(0, limit);
  if (selectedIds.length === 0) return [];

  const byId = new Map(candidates.map((d) => [d.id, d]));
  const ordered = selectedIds.map((id) => byId.get(id)).filter(Boolean);

  if (ordered.length < limit) {
    const usedIds = new Set(ordered.map((d) => d.id));
    for (const d of candidates) {
      if (ordered.length >= limit) break;
      if (!usedIds.has(d.id)) ordered.push(d);
    }
  }
  return ordered.slice(0, limit);
};

const executeMultiSlot = async (slots) => {
  const results = await Promise.all(
    slots.map(async (slot) => {
      try {
        const { sql, params } = buildDishQuery(slot, 1);
        const [rows] = await db.execute(sql, params);
        if (rows.length > 0) return rows[0];
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
      const orClauses = stems.map((stem, idx) => {
        const p = `%${escapeLike(stem)}%`;
        params.push(p, p, p);
        return `(LOWER(d.name) LIKE LOWER(?) OR LOWER(d.description) LIKE LOWER(?)
                 OR EXISTS (SELECT 1 FROM dish_composition dc_f${idx}
                   JOIN ingredient i_f${idx} ON dc_f${idx}.id_ingredient = i_f${idx}.id_ingredient
                   WHERE dc_f${idx}.id_dish = d.id_dish AND LOWER(i_f${idx}.name) LIKE LOWER(?)))`;
      });
      sql += " AND (" + orClauses.join(" OR ") + ")";
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

export const getSmartSearch = async (req, res) => {
  const rawQuery = req.query.query;
  if (!rawQuery?.trim())
    return res.status(400).json({ message: "Поисковый запрос пуст" });

  const query = sanitizeInput(rawQuery);

  const resultsCacheKey = `smart::${normalizeQueryKey(query)}`;
  if (resultsCache.has(resultsCacheKey)) {
    return res.status(200).json(resultsCache.get(resultsCacheKey));
  }

  let aiCached = false;
  try {
    const categories = await fetchCategories();
    const { result: searchParams, cached } = await aiProvider.parseQuery(
      query,
      categories,
    );
    aiCached = cached;

    const { sql, params } = buildDishQuery(searchParams, CANDIDATE_POOL_SMART);
    let [rows] = await db.execute(sql, params);
    let relaxedParams = null;

    if (rows.length === 0) {
      const relaxed = await tryRelaxedSearch(
        searchParams,
        CANDIDATE_POOL_SMART,
      );
      rows = relaxed.rows;
      relaxedParams = relaxed.relaxedParams;
    }

    let finalDishes = rows.slice(0, SMART_SEARCH_LIMIT);
    let rankingUsed = false;

    if (rows.length > SMART_SEARCH_LIMIT) {
      const { selectedIds } = await aiProvider.rankCandidates(
        query,
        rows,
        SMART_SEARCH_LIMIT,
      );
      if (selectedIds !== null) {
        finalDishes = applyRanking(rows, selectedIds, SMART_SEARCH_LIMIT);
        rankingUsed = true;
      }
    }

    const response = {
      dishes: finalDishes,
      meta: {
        interpreted_as: aiProvider.buildInterpretedLabel(searchParams),
        filters_applied: searchParams,
        ranking_used: rankingUsed,
        ...(relaxedParams
          ? { relaxed_to: aiProvider.buildInterpretedLabel(relaxedParams) }
          : {}),
      },
    };

    resultsCache.set(resultsCacheKey, response);

    logSearch({
      endpoint: "smart",
      query,
      params: searchParams,
      count: finalDishes.length,
      fallback: false,
      relaxed: !!relaxedParams,
      ranking: rankingUsed,
      cached: aiCached,
    });

    return res.status(200).json(response);
  } catch (err) {
    console.error("[getSmartSearch] AI error — fallback:", err.message);
    logSearch({
      endpoint: "smart",
      query,
      params: null,
      count: 0,
      fallback: true,
      relaxed: false,
      ranking: false,
      cached: false,
    });
    return fallbackTextSearch(query, res);
  }
};

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
    } = await aiProvider.chat(query, categories, history);

    let dishes = [];
    let message = "";

    if (search_slots) {
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
        ranking: false,
        cached,
      });
    } else {
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
          ranking: false,
          cached,
        });
      } else {
        const { sql, params } = buildDishQuery(p, CANDIDATE_POOL_CHAT);
        let [dbRows] = await db.execute(sql, params);
        let relaxed = false;

        if (dbRows.length === 0) {
          const rel = await tryRelaxedSearch(p, CANDIDATE_POOL_CHAT);
          if (rel.rows.length > 0) {
            dbRows = rel.rows;
            relaxed = true;
          }
        }

        let finalDishes = dbRows.slice(0, CHAT_DISHES_LIMIT);
        let rankingUsed = false;
        let rankRecommendation = null;

        if (dbRows.length > CHAT_DISHES_LIMIT) {
          const historyContext = aiProvider.buildHistoryContext(history);
          const ranked = await aiProvider.rankCandidates(
            query,
            dbRows,
            CHAT_DISHES_LIMIT,
            historyContext,
          );
          if (ranked.selectedIds !== null) {
            finalDishes = applyRanking(
              dbRows,
              ranked.selectedIds,
              CHAT_DISHES_LIMIT,
            );
            rankingUsed = true;
            rankRecommendation = ranked.recommendation;
          }
        }

        dishes = finalDishes;
        message =
          dishes.length > 0
            ? rankRecommendation || recommendation || not_found_message
            : not_found_message ||
              "Извините, в нашем меню сейчас нет подходящих блюд. Попробуйте другой запрос!";

        logSearch({
          endpoint: "chat",
          query,
          params: p,
          count: dishes.length,
          fallback: false,
          relaxed,
          ranking: rankingUsed,
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
      ranking: false,
      cached: false,
    });
    return res.status(500).json({
      message:
        "Извините, временные технические трудности. Попробуйте чуть позже.",
      dishes: [],
    });
  }
};
