"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
import PieChart, { PieDatum } from "./PieChart";
import type { Transaction } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";

type Props = {
  initialTransactions: Transaction[];
};

type Summary = {
  income: number;
  expense: number;
  balance: number;
};

function calcSummary(transactions: Transaction[]): Summary {
  let income = 0;
  let expense = 0;

  for (const t of transactions) {
    if (t.type === "income") income += t.amount;
    else expense += t.amount;
  }

  return {
    income,
    expense,
    balance: income - expense,
  };
}

function ymdToMonthKey(ymd: string) {
  // "2026-02-08" -> "2026-02"
  return ymd.slice(0, 7);
}

function fmtYM(ym: string) {
  // "2026-02" -> "2026年2月"
  const [y, m] = ym.split("-");
  return `${y}年${Number(m)}月`;
}

function addMonths(ym: string, delta: number) {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  d.setMonth(d.getMonth() + delta);
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${yy}-${mm}`;
}

function yen(n: number) {
  return n.toLocaleString("ja-JP");
}

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(
    initialTransactions ?? []
  );
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ userKey（内部では使う／UI表示はしない）
  const [userKey, setUserKey] = useState<string>("");

  useEffect(() => {
    setUserKey(getOrCreateUserKey());
  }, []);

  // ✅ userKeyのデータだけを取得
  useEffect(() => {
    if (!userKey) return;

    (async () => {
      try {
        const res = await fetch("/api/transactions", {
          headers: { "x-user-key": userKey },
          cache: "no-store",
        });

        const data = await res.json().catch(() => []);
        if (!res.ok) {
          console.error("GET /api/transactions failed:", data);
          setTransactions([]);
          return;
        }

        setTransactions(Array.isArray(data) ? data : []);
      } catch (e) {
        console.error(e);
        setTransactions([]);
      }
    })();
  }, [userKey]);

  // --- 月切替（今月デフォルト）
  const nowYm = ymdToMonthKey(new Date().toISOString().slice(0, 10));
  const [selectedYm, setSelectedYm] = useState<string>(nowYm);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  const summary = useMemo(
    () => calcSummary(monthTransactions),
    [monthTransactions]
  );

  // ✅ カテゴリ候補（フォーム用）
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const c = (t.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [transactions]);

  // --- 円グラフ：内訳（カテゴリ）⇔ 割合（収入/支出）
  const [chartKind, setChartKind] = useState<"breakdown" | "ratio">("breakdown");
  const toggleChartKind = () => {
    setChartKind((k) => (k === "breakdown" ? "ratio" : "breakdown"));
  };

  const breakdownData: PieDatum[] = useMemo(() => {
    // 今月の「支出」をカテゴリ集計
    const map = new Map<string, number>();
    for (const t of monthTransactions) {
      if (t.type !== "expense") continue;
      const key = (t.category ?? "").trim() || "未分類";
      map.set(key, (map.get(key) ?? 0) + t.amount);
    }
    const arr = Array.from(map.entries()).map(([label, value]) => ({
      label,
      value,
    }));
    arr.sort((a, b) => b.value - a.value);
    return arr;
  }, [monthTransactions]);

  const breakdownTotal = useMemo(
    () => breakdownData.reduce((a, d) => a + d.value, 0),
    [breakdownData]
  );

  const ratioData: PieDatum[] = useMemo(() => {
    return [
      { label: "支出", value: summary.expense },
      { label: "収入", value: summary.income },
    ];
  }, [summary.expense, summary.income]);

  const ratioTotal = summary.income + summary.expense;

  // --- 3つの丸（今日は配置だけ）
  // 残高：今月の収入-支出（いまの実装に合わせる）
  const balanceValue = summary.balance;

  // 貯蓄：ひとまず今月の差額をそのまま（後で「貯蓄」ルールに変更OK）
  const savingValue = summary.balance;

  // 返済：今日は仮（後で「カテゴリに返済が入った支出」などで反映）
  const debtValue = 0;

  return (
    <div>
      {/* ヘッダー：タイトル＋月切替 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 900, fontSize: 22 }}>みやむmaker</div>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => setSelectedYm((v) => addMonths(v, -1))}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ◀
        </button>

        <div style={{ fontWeight: 800 }}>{fmtYM(selectedYm)}</div>

        <button
          onClick={() => setSelectedYm((v) => addMonths(v, 1))}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          ▶
        </button>
      </div>

      {/* === 3つの丸（配置だけ） === */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          gridTemplateAreas: `
            ". main ."
            "left . right"
          `,
          gap: 14,
          justifyItems: "center",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        {/* 上：残高（大） */}
        <button
          type="button"
          style={{
            gridArea: "main",
            width: 200,
            height: 200,
            borderRadius: 999,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            padding: 12,
            textAlign: "center",
            boxShadow: "0 1px 10px rgba(0,0,0,0.07)",
          }}
          title="（後でタップで入れ替え）"
        >
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            残高
          </div>
          <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>
            {yen(balanceValue)}円
          </div>
          <div style={{ fontSize: 11, opacity: 0.65 }}>
            収入 {yen(summary.income)} / 支出 {yen(summary.expense)}
          </div>
        </button>

        {/* 左下：返済（小） */}
        <button
          type="button"
          style={{
            gridArea: "left",
            width: 135,
            height: 135,
            borderRadius: 999,
            border: "1px solid #eee",
            background: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            padding: 10,
            textAlign: "center",
          }}
          title="（後でタップで上に移動）"
        >
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            返済
          </div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {yen(debtValue)}円
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>（仮）</div>
        </button>

        {/* 右下：貯蓄（小） */}
        <button
          type="button"
          style={{
            gridArea: "right",
            width: 135,
            height: 135,
            borderRadius: 999,
            border: "1px solid #eee",
            background: "#fff",
            cursor: "pointer",
            display: "grid",
            placeItems: "center",
            padding: 10,
            textAlign: "center",
          }}
          title="（後でタップで上に移動）"
        >
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            貯蓄
          </div>
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            {yen(savingValue)}円
          </div>
          <div style={{ fontSize: 10, opacity: 0.6 }}>今月</div>
        </button>
      </div>

      {/* 円グラフ（現状のまま） */}
      {chartKind === "breakdown" ? (
        <PieChart
          title="支出の内訳"
          data={
            breakdownData.length
              ? breakdownData
              : [{ label: "（データなし）", value: 0 }]
          }
          totalLabel={`${yen(breakdownTotal)}円`}
          onToggle={toggleChartKind}
          toggleHint="円グラフをタップで「割合」に切替"
        />
      ) : (
        <PieChart
          title="収入と支出の割合"
          data={ratioData}
          totalLabel={`${yen(ratioTotal)}円`}
          showPercent={true}
          percentDigits={1}
          onToggle={toggleChartKind}
          toggleHint="円グラフをタップで「内訳」に切替"
        />
      )}

      {/* 入力フォーム */}
      <TransactionForm
        editing={editing}
        categorySuggestions={categorySuggestions}
        onAdded={(t) => {
          setTransactions((prev) => [t, ...prev]);
          setEditing(null);
        }}
        onUpdated={(t) => {
          setTransactions((prev) => prev.map((x) => (x.id === t.id ? t : x)));
          setEditing(null);
        }}
        onCancelEdit={() => setEditing(null)}
      />

      <hr style={{ margin: "24px 0" }} />

      {/* 履歴（今月のみ表示） */}
      <TransactionList
        transactions={monthTransactions}
        onEdit={(t) => setEditing(t)}
        onDeleted={(id) => {
          setTransactions((prev) => prev.filter((t) => t.id !== id));
          if (editing?.id === id) setEditing(null);
        }}
      />
    </div>
  );
}