import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const STORAGE_KEY = "miyamu_budget_user_key";
const NAME_KEY_PREFIX = "miyamu_budget_user_name:";

let cached: string | null = null;

export function clearUserKeyCache() {
  cached = null;
}

async function getStoredValue(key: string): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key });
      return result.value;
    }

    return localStorage.getItem(key);
  } catch (error) {
    console.error("storage get failed:", error);
    return null;
  }
}

async function setStoredValue(key: string, value: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({ key, value });
      return;
    }

    localStorage.setItem(key, value);
  } catch (error) {
    console.error("storage set failed:", error);
  }
}

async function removeStoredValue(key: string) {
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.remove({ key });
      return;
    }

    localStorage.removeItem(key);
  } catch (error) {
    console.error("storage remove failed:", error);
  }
}
export async function saveUserKey(key: string) {
  await setStoredValue(STORAGE_KEY, key);
  cached = key;
}

export async function getUserKeyName(key: string) {
  return (await getStoredValue(NAME_KEY_PREFIX + key)) ?? "";
}

export async function setUserKeyName(key: string, name: string) {
  await setStoredValue(NAME_KEY_PREFIX + key, name);
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

export async function getOrCreateUserKey(): Promise<string> {
  if (cached) {
    return cached;
  }

  if (typeof window === "undefined") {
    cached = "server";
    return cached;
  }

  const saved = await getStoredValue(STORAGE_KEY);

  if (saved && saved.trim()) {
    cached = saved.trim();

    return cached;
  }

  const key = gen32hex();

  await setStoredValue(STORAGE_KEY, key);

  cached = key;

  return cached;
}

export async function removeUserKey() {
  await removeStoredValue(STORAGE_KEY);
  clearUserKeyCache();
}

export function maskKey(key: string) {
  if (!key) return "";
  if (key.length <= 8) return key;

  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function normalizeUserKeyInput(value: string) {
  return value.trim().slice(0, 64);
}