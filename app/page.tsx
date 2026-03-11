export const dynamic = "force-dynamic";

import TransactionsClient from "./TransactionsClient";
import type { Transaction } from "./types";

export default async function Home() {
  const transactions: Transaction[] = [];

  return (
    <main style={{ padding: 24 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
    <h1>みやむMaker</h1>
  </div>

  <TransactionsClient initialTransactions={transactions} />
</main>
  );
}