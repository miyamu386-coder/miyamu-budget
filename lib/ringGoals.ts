// /app/lib/ringGoals.ts
import { getOrCreateUserKey } from "./userKey";

export type RingGoal = {
  category: string;
  target: number;
};

function key() {
  const userKey = getOrCreateUserKey();
  return `miyamuLog:ringGoals:${userKey}`;
}

export function loadRingGoals(): RingGoal[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(key());
    if (!raw) return [];
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

export function saveRingGoals(goals: RingGoal[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key(), JSON.stringify(goals));
}

export function getTarget(goals: RingGoal[], category: string): number {
  return goals.find((g) => g.category === category)?.target ?? 0;
}

export function upsertTarget(goals: RingGoal[], category: string, target: number): RingGoal[] {
  const next = [...goals];
  const idx = next.findIndex((g) => g.category === category);

  if (idx >= 0) next[idx] = { category, target };
  else next.push({ category, target });

  saveRingGoals(next);
  return next;
}