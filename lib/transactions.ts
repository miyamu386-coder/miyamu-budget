import type { Transaction } from "../app/types";

export type Summary = {
  income: number;
  expense: number;
  balance: number;
};

export function calcSummary(transactions: Transaction[]): Summary {
  let income = 0;
  let expense = 0;

  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }

  return {
    income,
    expense,
    balance: income - expense,
  };
}

export function isTransferTransaction(tx: Transaction) {
  const text = [
    tx.category ?? "",
    tx.detailCategory ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const keywords = [
    "資金移動",
    "送金",
    "振替",
    "振り替え",
    "口座移動",
    "口座間移動",
    "銀行移動",
    "移し替え",
    "口座振替",
    "transfer",
  ];

  return keywords.some((kw) =>
    text.includes(kw.toLowerCase())
  );
}