// lib/userKey.ts
let cached: string | null = null;

// TransactionsClient と揃える（同じキー名じゃないと意味ない）
export const STORAGE_KEY = "miyamu_budget_user_key";

function safeGetLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSetLocalStorage(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Safari プライベート等で失敗することがあるので握りつぶす
  }
}

/**
 * ✅ userKeyを「永続的に固定」する版
 * 1) localStorage を最優先
 * 2) 無ければ /api/user-key で取得して localStorage に保存
 */
export async function getOrCreateUserKey(opts?: { forceRefresh?: boolean }): Promise<string> {
  if (!opts?.forceRefresh && cached) return cached;

  // ① localStorage 優先（WEB / PWA のズレ対策の要）
  const stored = safeGetLocalStorage(STORAGE_KEY);
  if (stored && stored.length >= 8) {
    cached = stored;
    return stored;
  }

  // ② 無ければ API（cookieベース）から取得
  const res = await fetch("/api/user-key", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to get userKey");

  const data = (await res.json()) as { userKey: string };
  const k = String(data.userKey || "").trim();

  if (!k) throw new Error("Empty userKey");

  // ③ 取得できたら localStorage に固定保存
  safeSetLocalStorage(STORAGE_KEY, k);

  cached = k;
  return k;
}

/**
 * ✅ UIでuserKeyを切り替えた時用（任意）
 * TransactionsClient側で localStorage.setItem した後にこれ呼ぶと
 * cached が古いまま問題を防げる
 */
export function clearUserKeyCache() {
  cached = null;
}