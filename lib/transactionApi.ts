import type { Transaction } from "../app/types";

export type CreateTransactionPayload = {
  type: "income" | "expense";
  amount: number;
  occurredAt: string;
  category: string;
  detailCategory?: string;
};

export async function createTransactionApi(
  userKey: string,
  payload: CreateTransactionPayload
): Promise<Transaction> {
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