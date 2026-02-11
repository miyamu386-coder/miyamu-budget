export const dynamic = "force-dynamic";

import TransactionsClient from "./TransactionsClient";
import type { Transaction } from "./types";

export default async function Home() {
  const transactions: Transaction[] = []; // ✅ サーバーではユーザー判別できないので空で渡す

  return (
    <main style={{ padding: 24 }}>
      <h1>みやむMaker</h1>
      <TransactionsClient initialTransactions={transactions} />
    </main>
  );
}