export const dynamic = "force-dynamic";

import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import TransactionsClient from "./TransactionsClient";
import type { Transaction } from "./types";

const COOKIE_NAME = "miyamu_user_key";

function isValidUserKey(value: string): boolean {
  return /^[0-9a-f]{32}$/i.test(value);
}

export default async function Home() {
  const cookieStore = await cookies();

  const userKey =
    cookieStore.get(COOKIE_NAME)?.value?.trim() ?? "";

  let transactions: Transaction[] = [];

  if (isValidUserKey(userKey)) {
    const records = await prisma.transaction.findMany({
      where: {
        userKey,
      },
      orderBy: [
        {
          occurredAt: "desc",
        },
        {
          createdAt: "desc",
        },
      ],
    });

    transactions = records.map(
      (record): Transaction => ({
        id: record.id,
        amount: record.amount,
        category: record.category,
        detailCategory:
          record.detailCategory ?? undefined,
        type: record.type as Transaction["type"],
        createdAt: record.createdAt.toISOString(),
        occurredAt: record.occurredAt.toISOString(),
      })
    );
  }

  return (
    <main style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <h1>みやむMaker</h1>
      </div>

      <TransactionsClient
        initialTransactions={transactions}
      />
    </main>
  );
}