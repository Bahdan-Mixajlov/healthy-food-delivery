import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error("Ошибка: GEMINI_API_KEY не найден в .env");
  process.exit(1);
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const modelName = "gemini-3.1-flash-lite";
const model = genAI.getGenerativeModel({
  model: modelName,
  generationConfig: { responseMimeType: "application/json" },
});

// Тарифы за 1 000 000 токенов (из скриншота)
const PRICE_INPUT_PER_M = 0.25; // $0.25 за 1 млн входных токенов
const PRICE_OUTPUT_PER_M = 1.5; // $1.50 за 1 млн выходных токенов

// Мок категорий из БД
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

// ════════════════════════════════════════════════════════════════════════════
// ШАБЛОНЫ ИЗ ОРИГИНАЛЬНОГО КОЛЛЕКТОРA
// ════════════════════════════════════════════════════════════════════════════

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

const getParserPromptComponents = (query, categories) => {
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
    systemInstructions: `${systemInstructions}\n\n${rules}`,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
};

const getChatPromptComponents = (query, categories, historyContext) => {
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

ПРАВИЛА ИСТОРИИ:
- Уточнение ("а подешевле", "без лука", "добавь is_gluten_free") → корректируй только нужный фильтр.
- Смена темы → сбрось все фильтры.

ПРАВИЛА ТЕКСТОВЫХ ПОЛЕЙ:
- "recommendation": 2–3 предложения, аппетитно, на "вы", без цен.
- "not_found_message": теоретический вопрос → научный ответ нутрициолога 3–5 предл.;
  еда не найдена → вежливо извинись, предложи конкретную альтернативу.
  `.trim();

  const rules = SEARCH_PARAMS_RULES(categories);
  const userPayload = `
Доступные категории: ${categories.join(", ")}.
${historyContext}

Запрос: "${query}"
  `.trim();

  return {
    systemInstructions: `${systemInstructions}\n\n${rules}`,
    userPayload,
    fullPrompt: `${systemInstructions}\n\n${rules}\n\n${userPayload}`,
  };
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

// ════════════════════════════════════════════════════════════════════════════
// ТЕСТОВЫЙ ЗАПУСК И СБОР ДАННЫХ
// ════════════════════════════════════════════════════════════════════════════

async function runTestCase(tc) {
  let systemText = "";
  let userText = "";
  let fullPrompt = "";

  if (tc.type === "parser") {
    const comps = getParserPromptComponents(tc.query, MOCK_CATEGORIES);
    systemText = comps.systemInstructions;
    userText = comps.userPayload;
    fullPrompt = comps.fullPrompt;
  } else {
    const historyContext = buildHistoryContext(tc.history || []);
    const comps = getChatPromptComponents(
      tc.query,
      MOCK_CATEGORIES,
      historyContext,
    );
    systemText = comps.systemInstructions;
    userText = comps.userPayload;
    fullPrompt = comps.fullPrompt;
  }

  try {
    const result = await model.generateContent(fullPrompt);
    let input = 0;
    let output = 0;

    if (result.response.usageMetadata) {
      const meta = result.response.usageMetadata;
      input = meta.promptTokenCount;
      output = meta.candidatesTokenCount;
    } else {
      // Резервный подсчет, если метаданные не вернулись
      const responseText = result.response.text();
      const countInput = await model.countTokens(fullPrompt);
      const countOutput = await model.countTokens(responseText);
      input = countInput.totalTokens;
      output = countOutput.totalTokens;
    }

    const total = input + output;
    const cost =
      (input / 1000000) * PRICE_INPUT_PER_M +
      (output / 1000000) * PRICE_OUTPUT_PER_M;

    return {
      success: true,
      scenario: tc.scenario,
      query: tc.query,
      input,
      output,
      total,
      cost,
    };
  } catch (err) {
    console.error(`Ошибка выполнения сценария ${tc.scenario}:`, err.message);
    return { success: false, scenario: tc.scenario };
  }
}

async function runAnalysis() {
  const testCases = [
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

  console.log(`Запуск тестирования JSON формата для модели: ${modelName}`);
  console.log("--------------------------------------------------");

  const results = [];

  for (const tc of testCases) {
    console.log(`Выполнение сценария: "${tc.scenario}"...`);
    const res = await runTestCase(tc);
    if (res.success) {
      results.push(res);
    }
    await new Promise((r) => setTimeout(r, 1500)); // Пауза для стабильности лимитов API
  }

  if (results.length > 0) {
    console.log("\n\n" + "=".repeat(60));
    console.log("РЕЗУЛЬТАТЫ СГЕНЕРИРОВАННОЙ ТАБЛИЦЫ ДЛЯ ВАШЕГО ОТЧЕТА (JSON):");
    console.log("=".repeat(60) + "\n");

    console.log(
      "| Scenario | User Query | Input (Prompt) | Output (Response) | Total Tokens | Estimated Cost (USD) |",
    );
    console.log("| :--- | :--- | :---: | :---: | :---: | :---: |");

    let sumInput = 0,
      sumOutput = 0,
      sumTotal = 0,
      sumCost = 0;

    results.forEach((r) => {
      const displayQuery =
        r.query.length > 40 ? r.query.slice(0, 37) + "..." : r.query;
      console.log(
        `| **${r.scenario}** | "${displayQuery}" | ${r.input} | ${r.output} | ${r.total} | $${r.cost.toFixed(6)} |`,
      );
      sumInput += r.input;
      sumOutput += r.output;
      sumTotal += r.total;
      sumCost += r.cost;
    });

    const count = results.length;
    const avgInput = Math.round(sumInput / count);
    const avgOutput = Math.round(sumOutput / count);
    const avgTotal = Math.round(sumTotal / count);
    const avgCost = sumCost / count;

    console.log(
      `| **Average** | **-** | **${avgInput}** | **${avgOutput}** | **${avgTotal}** | **$${avgCost.toFixed(6)}** |`,
    );
    console.log("\n" + "=".repeat(60));
  } else {
    console.log("\nНе удалось собрать статистику.");
  }
}

runAnalysis();
