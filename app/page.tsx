import TransactionsClient from "./TransactionsClient";
import FirstLaunchNotice from "./FirstLaunchNotice";

export default function Home() {
  return (
    <main style={{ padding: 24 }}>
      <FirstLaunchNotice />
      <TransactionsClient initialTransactions={[]} />
    </main>
  );
}