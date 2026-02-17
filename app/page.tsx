export const dynamic = "force-dynamic";

import TransactionsClient from "./TransactionsClient";
import type { Transaction } from "./types";

export default async function Home() {
  const transactions: Transaction[] = [];

  return (
    <main
      style={{
        padding: 24,
        position: "relative", // ← これ重要（モフの基準点）
        minHeight: "100vh",
      }}
    >
      <h1>みやむMaker</h1>

      <TransactionsClient initialTransactions={transactions} />

      {/* 👇 見守りモフ（ヌッと出てくる） */}
      <img
        src="/mofu-watch.png"
        alt="watch mofu"
        style={{
          position: "fixed",
          bottom: -60,              // ← ここが「ヌッ」開始位置
          left: "50%",
          transform: "translateX(-50%)",
          width: 130,
          opacity: 0.9,
          pointerEvents: "none",
          zIndex: 999,

          // 👇 アニメーション
          animation: "mofuUp 1.2s ease-out forwards",
        }}
      />

      {/* 👇 ヌッと出る動き */}
      <style>
        {`
          @keyframes mofuUp {
            0% {
              bottom: -120px;
              opacity: 0;
            }
            60% {
              bottom: 10px;
              opacity: 1;
            }
            100% {
              bottom: -20px;
              opacity: 1;
            }
          }
        `}
      </style>
    </main>
  );
}