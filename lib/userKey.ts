// lib/userKey.ts
let cached: string | null = null;

export function clearUserKeyCache() {
  cached = null;
}

export async function getOrCreateUserKey(): Promise<string> {
  if (cached) return cached;

  const res = await fetch("/api/user-key", {
    method: "GET",
    cache: "no-store",
    credentials: "include",
  });

  if (!res.ok) throw new Error("Failed to get userKey");

  const data = (await res.json()) as { userKey: string };
  cached = data.userKey;
  return cached;
}

// ✅ ここから追加：ユーザーキーに対する「ユーザーネーム（ラベル）」を端末に保存
const NAME_PREFIX = "userKeyName:";

export function getUserKeyName(userKey: string): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(NAME_PREFIX + userKey) ?? "";
}

export function setUserKeyName(userKey: string, name: string) {
  if (typeof window === "undefined") return;
  const trimmed = name.trim();
  if (!trimmed) return;
  localStorage.setItem(NAME_PREFIX + userKey, trimmed);
}