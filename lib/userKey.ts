// lib/userKey.ts
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
  // crypto.randomUUID が使えるならそれ優先
  try {
    // @ts-ignore
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      // UUIDのハイフンを消して32桁相当に
      return crypto.randomUUID().replace(/-/g, "").slice(0, 32);
    }
  } catch {}

  // fallback: Math.random で32桁hex
  const hex = () => Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return (hex() + hex() + hex() + hex()).slice(0, 32);
}

// ✅ 絶対に throw しない版
export async function getOrCreateUserKey(): Promise<string> {
  if (cached) return cached;

  // SSR対策（ここは呼ばれない想定だけど保険）
  if (typeof window === "undefined") {
    cached = "server";
    return cached;
  }

  // 1) 既存を読む
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved.trim()) {
      cached = saved.trim();
      return cached;
    }
  } catch {
    // 読めなくても続行
  }

  // 2) 新規作成
  const key = gen32hex();

  // 3) 保存（失敗しても続行）
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {}

  cached = key;
  return cached;
}