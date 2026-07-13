const STORAGE_KEY = "miyamu_budget_user_key";
const NAME_KEY_PREFIX = "miyamu_budget_user_name:";

let cached: string | null = null;

export function clearUserKeyCache() {
  cached = null;
}

export function getUserKeyName(key: string) {
  try {
    return localStorage.getItem(NAME_KEY_PREFIX + key) ?? "";
  } catch {
    return "";
  }
}

export function setUserKeyName(key: string, name: string) {
  try {
    localStorage.setItem(NAME_KEY_PREFIX + key, name);
  } catch {}
}

function gen32hex() {
  try {
    if (
      typeof crypto !== "undefined" &&
      typeof crypto.randomUUID === "function"
    ) {
      return crypto
        .randomUUID()
        .replace(/-/g, "")
        .slice(0, 32);
    }
  } catch {}

  const hex = () =>
    Math.floor(Math.random() * 0xffffffff)
      .toString(16)
      .padStart(8, "0");

  return (hex() + hex() + hex() + hex()).slice(0, 32);
}

async function syncUserKeyCookie(userKey: string) {
  try {
    const response = await fetch("/api/user-key", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ userKey }),
    });

    if (!response.ok) {
      const data = await response.json().catch(() => null);

      console.error(
        "userKey cookie sync failed:",
        response.status,
        data
      );
    }
  } catch (error) {
    console.error("userKey cookie sync failed:", error);
  }
}

// 絶対にthrowしない
export async function getOrCreateUserKey(): Promise<string> {
  if (cached) {
    await syncUserKeyCookie(cached);
    return cached;
  }

  if (typeof window === "undefined") {
    cached = "server";
    return cached;
  }

  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (saved && saved.trim()) {
      cached = saved.trim();

      await syncUserKeyCookie(cached);

      return cached;
    }
  } catch {
    // 読めなくても新規作成へ進む
  }

  const key = gen32hex();

  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {}

  cached = key;

  await syncUserKeyCookie(key);

  return cached;
}

export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return key;

  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function normalizeUserKeyInput(value: string) {
  return value.trim().slice(0, 64);
}