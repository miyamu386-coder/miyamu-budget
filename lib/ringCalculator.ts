import type { Transaction } from "@/app/types";
import { ringCategory } from "./ringUtils";

export type RingSums = {
  income: number;
  expense: number;
  balance: number;
};

export function buildCategorySums(transactions: Transaction[]) {
  const map = new Map<string, RingSums>();

  for (const t of transactions) {
    const cat = (t.category ?? "").trim();
    if (!cat) continue;

    const cur = map.get(cat) ?? { income: 0, expense: 0, balance: 0 };

    if (t.type === "income") cur.income += t.amount;
    else cur.expense += t.amount;

    cur.balance = cur.income - cur.expense;
    map.set(cat, cur);
  }

  return map;
}

export function getRingSumsFromMap(
  map: Map<string, RingSums>,
  ringKey: string
): RingSums {
  const cat = ringCategory(ringKey);
  return map.get(cat) ?? { income: 0, expense: 0, balance: 0 };
}