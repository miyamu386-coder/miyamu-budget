import type { Transaction } from "../app/types";

export type CreateTransactionPayload = {
  type: "income" | "expense";
  amount: number;
  occurredAt: string;
  category: string;
  detailCategory?: string;
};

function createLocalTransaction(
  payload: CreateTransactionPayload
): Transaction {
  const now = new Date().toISOString();

  return {
    id: Date.now(),
    type: payload.type,
    amount: payload.amount,
    category: payload.category,
    detailCategory: payload.detailCategory,
    occurredAt: payload.occurredAt,
    createdAt: now,
  };
}

export async function createTransactionApi(
  _userKey: string,
  payload: CreateTransactionPayload
): Promise<Transaction> {
  return createLocalTransaction(payload);
}