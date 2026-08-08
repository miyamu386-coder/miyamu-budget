import { Capacitor } from "@capacitor/core";
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
  userKey: string,
  payload: CreateTransactionPayload
): Promise<Transaction> {
  // iPhone / Androidアプリ
  if (Capacitor.isNativePlatform()) {
    return createLocalTransaction(payload);
  }

  // ブラウザ版は今まで通り
  const response = await fetch("/api/transactions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-user-key": userKey,
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(
      JSON.stringify(
        data ?? {
          error: "POST failed",
        }
      )
    );
  }

  return data as Transaction;
}