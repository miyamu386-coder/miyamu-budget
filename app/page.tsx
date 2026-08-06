import TransactionsClient from "./TransactionsClient";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <TransactionsClient initialTransactions={[]} />
    </main>
  );
}