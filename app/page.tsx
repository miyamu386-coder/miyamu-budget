import { prisma } from "@/lib/prisma";
import TransactionsClient from "./TransactionsClient";
import type { Transaction, TxType } from "./types";

export default async function Home() {
  const rows = await prisma.transaction.findMany({
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
  });

  const transactions: Transaction[] = rows.map((t) => ({
    id: t.id,
    amount: t.amount,
    category: t.category,
    type: (t.type === "income" ? "income" : "expense") as TxType,
    createdAt: t.createdAt.toISOString(),
    occurredAt: t.occurredAt.toISOString(),
  }));

  return (
    <main style={{ padding: 24 }}>
      <h1>miyamu budget</h1>
      <TransactionsClient initialTransactions={transactions} />
    </main>
  );
}