import {
  readFileSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
} from "fs";
import { extname, join, basename } from "path";

const PROVIDER_NAMES = ["gemini", "openrouter", "spoonacular", "logmeal"];

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

const OUTPUT_DIR = "test-results";
const DELAY_BETWEEN_CALLS_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const pad = (n) => String(n).padStart(2, "0");

const [targetPath, providerArg = "gemini"] = process.argv.slice(2);

if (!targetPath) {
  console.error(
    `Использование: node scripts/testRecognizeMeal.js <фото или папка> [${PROVIDER_NAMES.join("|")}|all]`,
  );
  process.exit(1);
}

if (providerArg !== "all" && !PROVIDER_NAMES.includes(providerArg)) {
  console.error(
    `Неизвестный провайдер "${providerArg}". Доступны: ${PROVIDER_NAMES.join(", ")}, all`,
  );
  process.exit(1);
}

const providerNames = providerArg === "all" ? PROVIDER_NAMES : [providerArg];

let stat;
try {
  stat = statSync(targetPath);
} catch {
  console.error(`Путь не найден: ${targetPath}`);
  process.exit(1);
}

const isSupportedImage = (name) =>
  Boolean(MIME_BY_EXT[extname(name).toLowerCase()]);

const files = stat.isDirectory()
  ? readdirSync(targetPath)
      .filter(isSupportedImage)
      .sort()
      .map((name) => join(targetPath, name))
  : isSupportedImage(targetPath)
    ? [targetPath]
    : [];

if (files.length === 0) {
  console.error(
    "Не найдено подходящих фото. Разрешены: .jpg, .jpeg, .png, .webp",
  );
  process.exit(1);
}

const providers = {};
for (const name of providerNames) {
  try {
    providers[name] = await import(`../providers/${name}.js`);
  } catch (err) {
    providers[name] = { loadError: err.message };
  }
}

const runs = [];
const totalRuns = files.length * providerNames.length;
let runNumber = 0;

for (const file of files) {
  const mimeType = MIME_BY_EXT[extname(file).toLowerCase()];
  const imageBase64 = readFileSync(file).toString("base64");

  for (const name of providerNames) {
    runNumber += 1;
    const startedAt = Date.now();
    let outcome;

    try {
      if (providers[name].loadError) {
        throw new Error(
          `не удалось загрузить провайдер: ${providers[name].loadError}`,
        );
      }
      const result = await providers[name].recognizeMeal({
        imageBase64,
        mimeType,
      });
      outcome = { ok: true, result };
    } catch (err) {
      outcome = { ok: false, error: err.message };
    }

    const durationMs = Date.now() - startedAt;
    const seconds = (durationMs / 1000).toFixed(1);

    console.log(
      `[${runNumber}/${totalRuns}] ${basename(file)} (${name}): ` +
        (outcome.ok
          ? `ок, позиций: ${outcome.result.items.length}, ${outcome.result.total.calories} ккал, ${seconds} с`
          : `ошибка — ${outcome.error}`),
    );

    runs.push({
      file: basename(file),
      provider: name,
      ok: outcome.ok,
      durationMs,
      ...(outcome.ok ? { result: outcome.result } : { error: outcome.error }),
    });

    if (runNumber < totalRuns) await sleep(DELAY_BETWEEN_CALLS_MS);
  }
}

const now = new Date();
const stamp =
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
  `_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}`;

mkdirSync(OUTPUT_DIR, { recursive: true });
const outPath = join(OUTPUT_DIR, `results-${providerArg}-${stamp}.json`);

writeFileSync(
  outPath,
  JSON.stringify(
    {
      generatedAt: now.toISOString(),
      source: targetPath,
      providers: providerNames,
      runs,
    },
    null,
    2,
  ),
  "utf8",
);

const okCount = runs.filter((run) => run.ok).length;
console.log(
  `\nГотово: успешно ${okCount} из ${totalRuns}. Результаты: ${outPath}`,
);
