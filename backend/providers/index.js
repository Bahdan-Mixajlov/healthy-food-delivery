import { getSetting } from "../services/settingService.js";
import { ALLOWED_MEAL_IMAGE_TYPES } from "./shared/mealRecognition.js";
import * as gemini from "./gemini.js";
import * as openrouter from "./openrouter.js";
import * as spoonacular from "./spoonacular.js";
import * as logmeal from "./logmeal.js";

const PROVIDERS = {
  gemini,
  openrouter,
  spoonacular,
  logmeal,
};

const DEFAULT_PROVIDER = "gemini";
const FALLBACK_ORDER = ["gemini", "logmeal", "spoonacular", "openrouter"];
const CHAIN_BUDGET_MS = 60000;

const resolveChain = async () => {
  const name = await getSetting("meal_recognition_provider", DEFAULT_PROVIDER);
  if (!Object.hasOwn(PROVIDERS, name)) {
    throw new Error(
      `[providers] неизвестный провайдер в настройке meal_recognition_provider: "${name}". ` +
        `Доступны: ${Object.keys(PROVIDERS).join(", ")}`,
    );
  }
  return [name, ...FALLBACK_ORDER.filter((candidate) => candidate !== name)];
};

export const recognizeMeal = async (params) => {
  if (!ALLOWED_MEAL_IMAGE_TYPES.includes(params?.mimeType)) {
    throw new Error(
      `[providers] неподдерживаемый тип файла: ${params?.mimeType}`,
    );
  }

  const chain = await resolveChain();
  const startedAt = Date.now();
  const failures = [];

  for (const name of chain) {
    if (Date.now() - startedAt >= CHAIN_BUDGET_MS) {
      failures.push("общий лимит времени исчерпан");
      break;
    }
    try {
      const result = await PROVIDERS[name].recognizeMeal(params);
      return { ...result, provider: name };
    } catch (err) {
      failures.push(`${name}: ${err.message}`);
      console.warn(`[providers] ${name} не справился:`, err.message);
    }
  }

  throw new Error(
    `[providers] ни один провайдер не смог распознать фото — ${failures.join(" | ")}`,
  );
};
