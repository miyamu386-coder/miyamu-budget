import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export async function getStoredValue(
  key: string
): Promise<string | null> {
  if (Capacitor.isNativePlatform()) {
    const result = await Preferences.get({ key });
    return result.value;
  }

  return localStorage.getItem(key);
}

export async function setStoredValue(
  key: string,
  value: string
) {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key, value });
    return;
  }

  localStorage.setItem(key, value);
}

export async function removeStoredValue(
  key: string
) {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key });
    return;
  }

  localStorage.removeItem(key);
}