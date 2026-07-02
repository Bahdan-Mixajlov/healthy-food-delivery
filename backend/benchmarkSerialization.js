import { GoogleGenerativeAI } from "@google/generative-ai";
import { encode as toToon, decode as toonDecode } from "@toon-format/toon";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("❌ Ошибка: GEMINI_API_KEY не найден в файле .env.");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite" });

const RANK_DESC_TRUNCATE = 60;

// ── Генерация реалистичных данных для тестирования ───────────────────────────
const mockRoles = ["user", "assistant"];
const mockUserQueries = [
  "хочу что-нибудь легкое на ужин",
  "порекомендуйте блюдо без глютена и молока",
  "какой суп самый сытный?",
  "покажите вегетарианские блюда до 300 ккал",
  "есть ли у вас острый цыпленок?",
  "что взять на завтрак быстрое?",
  "мне нужно больше белка, от 25 грамм",
  "посоветуйте несладкий десерт",
];
const mockAssistantReplies = [
  "Рекомендую запеченную рыбу с овощами или салат.",
  "Отличным выбором будет гречка с грибами и запеченные яблоки.",
  "Наш крем-суп из тыквы со сливками очень сытный и вкусный.",
  "Попробуйте овощной боул с тофу, в нем ровно 280 ккал.",
  "Да, наш цыпленок на гриле подается с пикантным чили соусом.",
  "Овсяная каша на воде с лесными ягодами готовится за 5 минут.",
  "Стейк из индейки содержит 28 г чистого диетического белка.",
  "Чиа-пудинг на кокосовом молоке приготовлен вообще без сахара.",
];
const mockFilters = [
  "ккал до 350, ужин",
  "без глютена, без молочного",
  "категория: Супы, сытное",
  "вегетарианское, ккал до 300",
  "острое",
  "завтрак, категория: Каши",
  "белок ≥ 25 г",
  "категория: Десерты, без сахара",
];

const mockDishTitles = [
  "Салат Цезарь Лайт",
  "Куриное филе на пару",
  "Запеченная дорадо",
  "Суп-пюре из тыквы",
  "Овсяная каша с черникой",
  "Стейк из индейки",
  "Овощной боул с тофу",
  "Творожная запеканка",
  "Протеиновый батончик",
  "Рыбные паровые котлеты",
  "Крем-суп грибной",
  "Гречка с грибами",
];
const mockDescriptions = [
  "Легкий салат с сочным куриным филе и свежей зеленью под легким соусом",
  "Нежное диетическое филе, приготовленное на пару с прованскими травами",
  "Свежая дорадо, запеченная с долькой лимона и ароматным розмарином",
  "Густой суп-пюре из сладкой тыквы со сливками минимальной жирности",
  "Классическая овсянка медленной варки с сочными лесными ягодами",
  "Сочный стейк из грудки индейки, обжаренный без масла на гриле",
  "Сытный боул со свежими овощами, киноа и обжаренным сыром тофу",
  "Воздушная запеканка из обезжиренного творога с изюмом без сахара",
  "Питательный перекус с высоким содержанием сывороточного белка",
  "Котлеты из трески и горбуши, бережно приготовленные на пару",
  "Нежный крем-суп из шампиньонов со сливками и зеленью",
  "Рассыпчатая гречневая крупа с обжаренными лесными грибами",
];

const mockCategories = [
  "Салаты",
  "Супы",
  "Горячее",
  "Каши",
  "Десерты",
  "Напитки",
  "Перекусы",
];

const generateHistory = (count) => {
  const history = [];
  for (let i = 0; i < count; i++) {
    const role = mockRoles[i % 2];
    const content =
      role === "user"
        ? mockUserQueries[Math.floor(i / 2) % mockUserQueries.length]
        : mockAssistantReplies[
            Math.floor((i - 1) / 2) % mockAssistantReplies.length
          ];
    const filters =
      role === "user"
        ? mockFilters[Math.floor(i / 2) % mockFilters.length]
        : "";

    history.push({ role, content, filters });
  }
  return history;
};

const generateCandidates = (count) => {
  const candidates = [];
  for (let i = 0; i < count; i++) {
    const idx = i % mockDishTitles.length;
    candidates.push({
      id: 100 + i,
      title: mockDishTitles[idx],
      description: mockDescriptions[idx].slice(0, RANK_DESC_TRUNCATE),
      price: parseFloat((10 + ((i * 1.5) % 25)).toFixed(2)),
      calories: 120 + ((i * 30) % 350),
      proteins: 5 + ((i * 3) % 20),
    });
  }
  return candidates;
};

// ── Форматирование входящих данных ────────────────────────────────────────

const buildHistoryContext = (history, format) => {
  if (!history.length) return "";
  const rows = history.map((h) => ({
    role: h.role,
    content: h.content.slice(0, 150),
    filters: h.filters || "",
  }));

  const serialized =
    format === "toon" ? toToon(rows) : JSON.stringify(rows, null, 2);

  return (
    `\nИстория диалога (формат ${format.toUpperCase()}):\n` + serialized + "\n"
  );
};

const buildRankingPrompt = (
  query,
  candidates,
  historyContext,
  limit,
  format,
) => {
  const serializedCandidates =
    format === "toon"
      ? toToon(candidates)
      : JSON.stringify(candidates, null, 2);

  return `
Ты — нутрициолог-консультант приложения доставки здоровой еды.
Запрос пользователя: "${query}"
${historyContext}

Список блюд-кандидатов (уже прошли базовую фильтрацию по бюджету/категории/КБЖУ),
в формате ${format.toUpperCase()} (поля: id, title, description, price, calories, proteins):

${serializedCandidates}

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
};

/** Шаблон системной инструкции ranking-этапа (без кандидатов/запроса — только сама рамка) */
const buildSystemInstructionsTemplate = (limit, format) => {
  return `
Ты — нутрициолог-консультант приложения доставки здоровой еды.
Запрос пользователя: ""


Список блюд-кандидатов (уже прошли базовую фильтрацию по бюджету/категории/КБЖУ),
в формате ${format.toUpperCase()} (поля: id, title, description, price, calories, proteins):



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
};

// ════════════════════════════════════════════════════════════════════════════
// РЕАЛИСТИЧНЫЙ ПРОМПТ CHAT-ЭТАПА (system + rules + examples + history + query)
// ────────────────────────────────────────────────────────────────────────────
// В прошлой версии стоимость chat-этапа считалась ТОЛЬКО по истории диалога,
// без системной части, правил, few-shot примеров и самого запроса — то есть
// не отражала реальный размер промпта, который реально уходит в Gemini.
// Здесь промпт собирается целиком, чтобы "реалистичный расчёт" был
// реалистичным по факту, а не только по названию.
//
// Текст правил ниже — сокращённая, но сопоставимая по объёму версия
// SEARCH_PARAMS_RULES из dishController.js: даёт корректный порядок величины
// токенов системной части, не дублируя весь промпт слово в слово.
// ════════════════════════════════════════════════════════════════════════════

const CHAT_RULES_TEXT = `
ПРАВИЛА для search_params / слота:
1. "search_query" — максимум 3–4 ключевых слова в именительном падеже.
   НЕ раскрывай группы продуктов в списки синонимов — пиши одно общее слово.
   Абстракции ("вкусное", "полезное") → null.
2. "exclude_query" — ТОЛЬКО исключения, раскрывай группы продуктов полностью
   (ягоды, фрукты, орехи, овощи, мясо, молочное, глютен — каждая своим списком слов).
3. Числовые фильтры: "около N ккал" → диапазон ±20%; "не больше N" → max; "от N до M" → диапазон;
   "с высоким белком" → min_proteins: 25.
4. Флаги (true только при явном запросе): вегетарианское, веганское, без глютена,
   без молочного, острое.
5. cooking_method: запеченное / вареное / на пару / жареное / тушеное / сырое.
6. meal_time: завтрак / обед / ужин / перекус — только если явно упомянуто время суток.
7. "category" — строго точное название из списка доступных категорий, иначе null.
8. "sort_by": дешёвое → price_asc, дорогое → price_desc, лёгкое → kcal_asc, сытное → kcal_desc.
9. "query_logic": AND — одно составное блюдо; OR — несколько разных блюд.
`.trim();

const chatExampleSingle = {
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
};

const chatExampleMulti = {
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
};

const buildChatPromptFull = (query, categories, historyContext, format) => {
  const exampleSingle =
    format === "toon"
      ? toToon(chatExampleSingle)
      : JSON.stringify(chatExampleSingle, null, 2);
  const exampleMulti =
    format === "toon"
      ? toToon(chatExampleMulti)
      : JSON.stringify(chatExampleMulti, null, 2);

  return `
Ты — заботливый нутрициолог-консультант приложения доставки здоровой еды.
Проанализируй текущий запрос с учётом истории и верни ответ СТРОГО в формате ${format.toUpperCase()}.
Ответ ВСЕГДА содержит ровно эти 4 верхнеуровневых ключа:
search_params, search_slots, recommendation, not_found_message.

Пример обычного ответа (search_slots: null):
${exampleSingle}

Пример мульти-слот ответа (search_params: null, несколько позиций сразу):
${exampleMulti}

Доступные категории: ${categories.join(", ")}.
${historyContext}

${CHAT_RULES_TEXT}

ПРАВИЛА ИСТОРИИ:
- Уточнение ("а подешевле", "без лука") → корректируй только нужный фильтр.
- Смена темы → сбрось все фильтры.

Запрос: "${query}"
`.trim();
};

const countTokensSafe = async (text) => {
  if (!text) return 0;
  try {
    const result = await model.countTokens(text);
    return result.totalTokens ?? 0;
  } catch (err) {
    console.error("Ошибка API при подсчете токенов:", err.message);
    return 0;
  }
};

const formatPercent = (savingValue) => {
  if (savingValue > 0) return `${savingValue.toFixed(1)}%`;
  if (savingValue < 0) return `-${Math.abs(savingValue).toFixed(1)}%`;
  return "0.0%";
};

// ════════════════════════════════════════════════════════════════════════════
// ОТВЕТ RANKING-ЭТАПА
// В продакшене остаётся на JSON (TOON здесь не применяется — короткий
// фиксированный объект, а JSON-режим API даёт гарантию синтаксической
// валидности). Сравнение форматов тут не нужно — просто фиксируем размер.
// ════════════════════════════════════════════════════════════════════════════

const rankingResponseObject = {
  selected_ids: [100, 101, 102, 103, 104],
  recommendation:
    "Предлагаю вам попробовать салат Цезарь Лайт и куриное филе на пару. Эти легкие блюда идеально подходят для ужина, не содержат глютена и не создадут чувства тяжести.",
};
const rankingResponsePretty = JSON.stringify(rankingResponseObject, null, 2);
// Фактический ответ API в JSON-режиме приходит без pretty-printing — это не
// "альтернативный формат для сравнения", а реальное значение, которое нужно
// для честного расчёта стоимости в разделе 3.
const rankingResponseApiTokensSrc = JSON.stringify(rankingResponseObject);

// ════════════════════════════════════════════════════════════════════════════
// ОТВЕТ CHAT-ЭТАПА — единственная точка, где формат ответа модели реально
// меняется (JSON pretty vs настоящий TOON через toToon()).
// ════════════════════════════════════════════════════════════════════════════

const chatResponseObject = chatExampleSingle;

const chatResponsePretty = JSON.stringify(chatResponseObject, null, 2);
const chatResponseToon = toToon(chatResponseObject);

/** Сквозная проверка: то, что реально вернёт toToon(), реально разбирается decode() без искажений */
const verifyRealToonRoundTrip = () => {
  console.log("🛠️  Проверка настоящего TOON round-trip (encode → decode)...");
  try {
    const decoded = toonDecode(chatResponseToon);
    const ok =
      decoded.recommendation === chatResponseObject.recommendation &&
      decoded.search_params?.meal_time ===
        chatResponseObject.search_params.meal_time &&
      decoded.search_params?.is_vegetarian ===
        chatResponseObject.search_params.is_vegetarian;
    console.log(
      ok
        ? "✅ Round-trip успешен, данные не искажены.\n"
        : "❌ Round-trip дал расхождение в данных!\n",
    );
    if (!ok) {
      console.log("Ожидалось:", JSON.stringify(chatResponseObject));
      console.log("Получено: ", JSON.stringify(decoded));
    }
  } catch (err) {
    console.error(
      "❌ decode() упал с ошибкой на собственном же encode()-выводе:",
      err.message,
    );
  }
};

// ── Сценарии ─────────────────────────────────────────────────────────────────
const TEST_CASES = [
  { name: "Small", history: 2, candidates: 5 },
  { name: "Medium", history: 6, candidates: 15 },
  { name: "Large", history: 6, candidates: 30 },
  { name: "Huge", history: 10, candidates: 50 },
];

async function runBenchmark() {
  verifyRealToonRoundTrip();

  console.log(
    "⏳ Запуск бенчмарка с раздробленным подсчетом токенов... Пожалуйста, подождите.\n",
  );

  const userQueryText = "что-нибудь легкое на ужин без глютена";

  // Токены ответов считаем один раз — это статичные объекты, не зависящие от сценария
  const rankingRespPrettyTokens = await countTokensSafe(rankingResponsePretty);
  const rankingRespApiTokens = await countTokensSafe(
    rankingResponseApiTokensSrc,
  );

  const chatRespPrettyTokens = await countTokensSafe(chatResponsePretty);
  const chatRespToonTokens = await countTokensSafe(chatResponseToon);

  const results = [];

  for (const tc of TEST_CASES) {
    const limit = 5;

    const historyData = generateHistory(tc.history);
    const candidatesData = generateCandidates(tc.candidates);

    // ── ranking-этап (кандидаты + история как вход) ──────────────────────
    const sysPrettyStr = buildSystemInstructionsTemplate(limit, "pretty");
    const sysToonStr = buildSystemInstructionsTemplate(limit, "toon");
    const sysPrettyTokens = await countTokensSafe(sysPrettyStr);
    const sysToonTokens = await countTokensSafe(sysToonStr);

    const histPrettyStr = buildHistoryContext(historyData, "pretty");
    const histToonStr = buildHistoryContext(historyData, "toon");
    const histPrettyTokens = await countTokensSafe(histPrettyStr);
    const histToonTokens = await countTokensSafe(histToonStr);

    const candPrettyStr = JSON.stringify(candidatesData, null, 2);
    const candToonStr = toToon(candidatesData);
    const candPrettyTokens = await countTokensSafe(candPrettyStr);
    const candToonTokens = await countTokensSafe(candToonStr);

    const promptPrettyStr = buildRankingPrompt(
      userQueryText,
      candidatesData,
      histPrettyStr,
      limit,
      "pretty",
    );
    const promptToonStr = buildRankingPrompt(
      userQueryText,
      candidatesData,
      histToonStr,
      limit,
      "toon",
    );
    const promptPrettyTokens = await countTokensSafe(promptPrettyStr);
    const promptToonTokens = await countTokensSafe(promptToonStr);

    // ── chat-этап (ПОЛНЫЙ промпт: system+rules+examples+history+query) ───
    const chatPromptPrettyStr = buildChatPromptFull(
      userQueryText,
      mockCategories,
      histPrettyStr,
      "pretty",
    );
    const chatPromptToonStr = buildChatPromptFull(
      userQueryText,
      mockCategories,
      histToonStr,
      "toon",
    );
    const chatPromptPrettyTokens = await countTokensSafe(chatPromptPrettyStr);
    const chatPromptToonTokens = await countTokensSafe(chatPromptToonStr);

    results.push({
      name: tc.name,
      historyCount: tc.history,
      candidatesCount: tc.candidates,
      system: { pretty: sysPrettyTokens, toon: sysToonTokens },
      history: { pretty: histPrettyTokens, toon: histToonTokens },
      candidates: { pretty: candPrettyTokens, toon: candToonTokens },
      promptTotal: { pretty: promptPrettyTokens, toon: promptToonTokens },
      chatPromptTotal: {
        pretty: chatPromptPrettyTokens,
        toon: chatPromptToonTokens,
      },
    });
  }

  // 1. Детальный отчёт по сценарию "Large" — ВХОД (ranking-этап)
  const largeRes = results.find((r) => r.name === "Large") || results[2];
  if (largeRes) {
    console.log(
      "==================== ВХОД: ranking-этап (Large) ====================\n",
    );
    console.log(
      `История: ${largeRes.historyCount} собщ. | Кандидаты: ${largeRes.candidatesCount} шт.\n`,
    );
    console.log("Категория             JSON    TOON");
    console.log(
      `Системные инстр.      ${String(largeRes.system.pretty).padEnd(14)} ${largeRes.system.toon}`,
    );
    console.log(
      `История диалога       ${String(largeRes.history.pretty).padEnd(14)} ${largeRes.history.toon}`,
    );
    console.log(
      `Кандидаты             ${String(largeRes.candidates.pretty).padEnd(14)} ${largeRes.candidates.toon}`,
    );
    console.log(
      `ИТОГО PROMPT           ${String(largeRes.promptTotal.pretty).padEnd(14)} ${largeRes.promptTotal.toon}`,
    );

    const saveVsPretty =
      ((largeRes.promptTotal.pretty - largeRes.promptTotal.toon) /
        largeRes.promptTotal.pretty) *
      100;
    console.log(
      `\nЭкономия промпта (TOON vs JSON): ${saveVsPretty.toFixed(1)}%\n`,
    );

    console.log(
      "==================== ВХОД: chat-этап, полный промпт (Large) ====================\n",
    );
    console.log(
      `ИТОГО PROMPT (system+rules+examples+history+query)   JSON: ${largeRes.chatPromptTotal.pretty}   TOON: ${largeRes.chatPromptTotal.toon}`,
    );
    const chatPromptSave =
      ((largeRes.chatPromptTotal.pretty - largeRes.chatPromptTotal.toon) /
        largeRes.chatPromptTotal.pretty) *
      100;
    console.log(
      `Экономия полного chat-промпта (TOON vs JSON): ${formatPercent(chatPromptSave)}\n`,
    );
  }

  // 2. Отчёт по ОТВЕТУ модели — сравнение только Pretty JSON vs TOON
  console.log(
    "==================== ВЫХОД: ответ модели (JSON vs TOON) ====================\n",
  );
  console.log("RANKING-этап (в проде остаётся на JSON, TOON не применяется):");
  console.log(`  Pretty JSON : ${rankingRespPrettyTokens} токенов`);
  console.log(
    `  (для справки: фактический ответ API без pretty-printing — ${rankingRespApiTokens} токенов, используется ниже только в расчёте стоимости)\n`,
  );

  console.log("CHAT-этап (в проде переведён на настоящий TOON):");
  console.log(`  Pretty JSON : ${chatRespPrettyTokens} токенов`);
  console.log(
    `  TOON (реальный encode()) : ${chatRespToonTokens} токенов  ← фактически используется в проде`,
  );

  const chatSaveVsPretty =
    ((chatRespPrettyTokens - chatRespToonTokens) / chatRespPrettyTokens) * 100;
  console.log(
    `\nЭкономия ответа чата (TOON vs JSON): ${formatPercent(chatSaveVsPretty)}`,
  );
  console.log(
    "\n=================================================================\n",
  );

  // 3. Стоимость — реалистичный расчёт: для chat используется ПОЛНЫЙ промпт
  // (chatPromptTotal), а не только история; для ranking — промпт для
  // ранжирования + фактический размер ответа API (без pretty-printing).
  console.log(
    "===================== СТОИМОСТЬ (реалистичный расчёт для прода) =====================\n",
  );
  for (const res of results) {
    // ranking: baseline — гипотетический Pretty JSON вход, факт — TOON вход (SERIALIZATION_FORMAT=toon),
    // ответ в обоих случаях фактический формат API (без pretty-printing) — это не меняется экспериментом.
    const rankingCostToon =
      (res.promptTotal.toon * 0.25 + rankingRespApiTokens * 1.5) / 1000;
    const rankingCostPrettyBaseline =
      (res.promptTotal.pretty * 0.25 + rankingRespApiTokens * 1.5) / 1000;

    // chat: и вход (полный промпт), и выход реально меняются между Pretty JSON и TOON.
    const chatCostToon =
      (res.chatPromptTotal.toon * 0.25 + chatRespToonTokens * 1.5) / 1000;
    const chatCostPrettyBaseline =
      (res.chatPromptTotal.pretty * 0.25 + chatRespPrettyTokens * 1.5) / 1000;

    console.log(
      `[${res.name}] Ranking: $${rankingCostPrettyBaseline.toFixed(5)} → $${rankingCostToon.toFixed(5)} (только вход меняется, ответ неизменен)`,
    );
    console.log(
      `[${res.name}] Chat:    $${chatCostPrettyBaseline.toFixed(5)} → $${chatCostToon.toFixed(5)} (меняются и вход, и выход; вход — полный промпт)`,
    );
  }
  console.log(
    "\n=============================================================",
  );
}

runBenchmark();
