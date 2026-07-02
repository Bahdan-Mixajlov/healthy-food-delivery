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
  generationConfig: { responseMimeType: "text/plain" },
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
// ШАБЛОНЫ ИЗ ОРИГИНАЛЬНОГО КОЛЛЕКТОРA (ПОД СТАНДАРТ TOON)
// ════════════════════════════════════════════════════════════════════════════

const SEARCH_PARAMS_RULES = (categories) =>
  `
ПРАВИЛА для параметров поиска (TOON спецификация):
0. СНАЧАЛА исправь очевидные опечатки ...

1. search_query — максимум 3–4 ключевых слова в именительном падеже.
   НЕ раскрывай группы продуктов в списки синонимов — пиши одно общее слово:
   "фрукты" (не "яблоки бананы манго персики"), "ягоды" (не "клубника малина черника").
   Абстракции ("вкусное", "полезное") → не пиши поле.
   Синонимы пиши вместе только для неоднозначных слов: "помидоры томаты".

2. exclude_query — ТОЛЬКО исключения. Никогда не пиши "без", "не" в search_query.
   В exclude_query — раскрывай группы ПОЛНОСТЬЮ:
   * без ягод    → "ягоды клубника малина черника голубика брусника вишня ежевика"
   * без фруктов    → "фрукты яблоки бананы манго персики груши киви ананасы апельсины лимоны"
   * без орехов     → "орехи кешью миндаль арахис кокос семечки фисташки фундук грецкий"
   * без овощей     → "овощи помидоры томаты огурцы перец перцы морковь лук чеснок капуста баклажаны кабачки"
   * без мяса       → "мясо курица индейка говядина свинина бекон стейк колбаса фарш сосиски"
   * без молочного  → "молоко сыр творог сметана кефир йогурт сливки масло"
   * без глютена    → "мука хлеб макароны паста лапша блины тесто выпечка пшеница"

3. Числовые фильтры:
   "около N ккал" / "примерно N ккал" → min_calories=N*0.8;max_calories=N*1.2
   "не больше N"   → max_calories=N
   "от N до M"     → min_calories=N;max_calories=M
   "с высоким белком" → min_proteins=25
   "богатое белком"   → min_proteins=20

4. Флаги (записывай только если true):
   вегетарианское/без мяса и рыбы → is_vegetarian=true
   веганское                       → is_vegan=true
   без глютена/безглютеновое       → is_gluten_free=true
   без молочного/безлактозное      → is_dairy_free=true
   острое/пикантное/с перцем чили  → is_spicy=true

5. cooking_method:
   запеченное/в духовке/в фольге → cooking_method=запеченное
   вареное/отварное              → cooking_method=вареное
   на пару/паровое               → cooking_method=на пару
   жареное/на гриле/на сковороде → cooking_method=жареное
   тушеное/в соусе               → cooking_method=тушеное
   сырое/без термообработки      → cooking_method=сырое

6. meal_time (если явно упомянуто время суток):
   на завтрак / утром            → meal_time=завтрак
   на обед / в обед              → meal_time=обед
   на ужин / вечером             → meal_time=ужин
   перекус / снэк                → meal_time=перекус

7. category — строго точное название из: ${categories.join(", ")}.

8. sort_by:
   дешёвое/бюджетное → sort_by=price_asc  |  дорогое → sort_by=price_desc
   лёгкое/диетическое → sort_by=kcal_asc  |  калорийное/сытное → sort_by=kcal_desc

9. query_logic:
   AND — одно составное блюдо ("каша с ягодами", "стейк из свинины")
   OR  — несколько разных блюд ("чай или сок", "суп или салат")
`.trim();

const getParserPromptComponents = (query, categories) => {
  const systemInstructions = `
Ты — ИИ-парсер для поиска здоровой еды. Проанализируй запрос на русском языке.
Верни ответ строго в формате TOON (Token-Oriented Object Notation) без markdown-разметки.

СПЕЦИФИКАЦИЯ TOON:
- Все пары "ключ=значение" пишутся без пробелов вокруг "=" и разделяются символом ";"
- Текстовые значения пишутся БЕЗ кавычек.
- Поля со значением null или false полностью ИГНОРИРУЮТСЯ и опускаются (не трать на них токены).

Пример TOON-ответа для "салат без томатов до 300 ккал":
search_query=салат;exclude_query=помидоры томаты;max_calories=300;query_logic=OR
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
Проанализируй текущий запрос с учётом истории и верни ответ строго в формате TOON без markdown-разметки.

СПЕЦИФИКАЦИЯ TOON ДЛЯ ЧАТА:
- Глобальные поля разделяются переносом строки. Значения полей rec и err пишутся без кавычек на одной строке.
- Вложенные объекты (структуры) записываются через круглые скобки: имя_объекта(ключ=значение;ключ=значение).
- Пустые/null поля и объекты полностью опускаются.
- Массивы объектов (слоты) перечисляются внутри скобок: slots((ключ=значение;ключ=значение)(ключ=значение;ключ=значение))

Пример TOON-ответа для чата:
rec=Отличный выбор для легкого обеда!
params(search_query=салат;max_calories=300)

Пример для мульти-слота:
rec=Подобрала для вас суп и напиток.
slots((search_query=суп;query_logic=OR)(search_query=сок чай;query_logic=OR))
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
    return `  ИИ: "${h.content.slice(0, 150)}"`;
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
      // Резервный подсчет
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

  console.log(`Запуск тестирования TOON формата для модели: ${modelName}`);
  console.log("--------------------------------------------------");

  const results = [];

  for (const tc of testCases) {
    console.log(`Выполнение сценария: "${tc.scenario}"...`);
    const res = await runTestCase(tc);
    if (res.success) {
      results.push(res);
    }
    await new Promise((r) => setTimeout(r, 1500)); // Пауза во избежание лимитов
  }

  if (results.length > 0) {
    console.log("\n\n" + "=".repeat(60));
    console.log("РЕЗУЛЬТАТЫ СГЕНЕРИРОВАННОЙ ТАБЛИЦЫ ДЛЯ ВАШЕГО ОТЧЕТА (TOON):");
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
