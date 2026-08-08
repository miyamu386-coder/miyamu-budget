import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type RingGoal = {
  category: string;
  target: number;
};

function storageKey(userKey: string) {
  return `miyamuLog:ringGoals:${userKey}`;
}

async function getStoredValue(
  key: string
): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key });

      if (result.value !== null) {
        return result.value;
      }

      const oldValue = localStorage.getItem(key);

      if (oldValue !== null) {
        await Preferences.set({
          key,
          value: oldValue,
        });

        return oldValue;
      }

      return null;
    }

    return localStorage.getItem(key);
  } catch (error) {
    console.warn("ring goals load failed", error);
    return null;
  }
}

async function setStoredValue(
  key: string,
  value: string
) {
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key,
        value,
      });

      return;
    }

    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("ring goals save failed", error);
  }
}

export async function loadRingGoals(
  userKey: string
): Promise<RingGoal[]> {
  if (!userKey) return [];

  const raw = await getStoredValue(
    storageKey(userKey)
  );

  if (!raw) return [];

  try {
    const arr = JSON.parse(raw);

    if (!Array.isArray(arr)) return [];

    return arr.map((g) => ({
      category: String(g.category),
      target: Number(g.target ?? 0),
    }));
  } catch {
    return [];
  }
}

export async function saveRingGoals(
  userKey: string,
  goals: RingGoal[]
) {
  if (!userKey) return;

  await setStoredValue(
    storageKey(userKey),
    JSON.stringify(goals)
  );
}

export function getTarget(
  goals: RingGoal[],
  category: string
): number {
  return (
    goals.find(
      (g) => g.category === category
    )?.target ?? 0
  );
}

export async function upsertTarget(
  userKey: string,
  goals: RingGoal[],
  category: string,
  target: number
): Promise<RingGoal[]> {
  const next = [...goals];

  const idx = next.findIndex(
    (g) => g.category === category
  );

  if (idx >= 0) {
    next[idx] = {
      category,
      target,
    };
  } else {
    next.push({
      category,
      target,
    });
  }

  await saveRingGoals(userKey, next);

  return next;
}