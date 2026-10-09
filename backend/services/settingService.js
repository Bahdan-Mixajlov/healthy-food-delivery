import { db } from "../config/db.js";

const SETTING_CACHE_TTL_MS = 15 * 1000;
const cache = new Map();

export const getSetting = async (key, fallback = null) => {
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value;
  }

  const [rows] = await db.execute(
    "SELECT `value` FROM `setting` WHERE `key` = ? LIMIT 1",
    [key],
  );

  const value = rows[0]?.value ?? fallback;
  cache.set(key, { value, expiresAt: Date.now() + SETTING_CACHE_TTL_MS });
  return value;
};

export const invalidateSettingCache = (key) => {
  if (key) cache.delete(key);
  else cache.clear();
};
