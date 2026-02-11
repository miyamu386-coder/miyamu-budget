const STORAGE_KEY = "miyamu_budget_user_key";

function genKey(): string {
  try {
    const a = crypto.getRandomValues(new Uint8Array(16));
    return Array.from(a)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return Math.random().toString(16).slice(2) +
           Math.random().toString(16).slice(2);
  }
}

export function getOrCreateUserKey(): string {
  if (typeof window === "undefined") return "";

  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing && existing.length >= 8 && existing.length <= 64) {
    return existing;
  }

  const key = genKey();
  localStorage.setItem(STORAGE_KEY, key);
  return key;
}