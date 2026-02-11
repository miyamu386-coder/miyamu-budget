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

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

// lib/userKey.ts と同じキー名（ここだけ一致させる）
const STORAGE_KEY = "miyamu_budget_user_key";

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return k;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
}

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions ?? []);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ 現在のuserKeyをstate管理（切替できるように）
  const [userKey, setUserKey] = useState<string>("");

  // 初回：localStorageから userKey を確定
  useEffect(() => {
    setUserKey(getOrCreateUserKey());
  }, []);

  // ✅ userKeyが変わったら、そのuserKeyのデータを再取得
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

  // ✅ userKey切替（小UI）
  const [keyEditingOpen, setKeyEditingOpen] = useState(false);
  const [userKeyInput, setUserKeyInput] = useState("");

  useEffect(() => {
    // UIを開いた時に現行キーを入れておく
    if (keyEditingOpen) setUserKeyInput(userKey);
  }, [keyEditingOpen, userKey]);

  const applyUserKey = () => {
    const next = normalizeUserKeyInput(userKeyInput);
    if (next.length < 8 || next.length > 64) {
      alert("userKey は8〜64文字で入力してください（英数字推奨）");
      return;
    }
    localStorage.setItem(STORAGE_KEY, next);
    setUserKey(next); // ← これで即再取得される
    setKeyEditingOpen(false);
  };

  const regenerateUserKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    const next = getOrCreateUserKey();
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  // --- ① 月切替（今月をデフォルト）
  const nowYm = ymdToMonthKey(new Date().toISOString().slice(0, 10));
  const [selectedYm, setSelectedYm] = useState<string>(nowYm);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  const summary = useMemo(() => calcSummary(monthTransactions), [monthTransactions]);

  // ✅ カテゴリ候補（フォーム用）
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const c = (t.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [transactions]);

  // --- ② 円グラフ：内訳（カテゴリ）⇔ 割合（収入/支出）
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
    const arr = Array.from(map.entries()).map(([label, value]) => ({ label, value }));
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

  // --- ③ 目標：残高目標 / 今月の貯金目標（任意入力）
  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const targetBalance = Number(targetBalanceStr.replace(/,/g, "")) || 0;

  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget = targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  const [monthlySaveTargetStr, setMonthlySaveTargetStr] = useState<string>("50000");
  const monthlySaveTarget = Number(monthlySaveTargetStr.replace(/,/g, "")) || 0;

  // 今月の貯金 = 収入 - 支出
  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave = monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

  // --- ④ 年間予測 & 危険ゾーン（シンプル版）
  const monthlyBalances = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of transactions) {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) continue;
      const ym = ymdToMonthKey(ymd);
      const cur = map.get(ym) ?? { income: 0, expense: 0 };
      if (t.type === "income") cur.income += t.amount;
      else cur.expense += t.amount;
      map.set(ym, cur);
    }
    const arr = Array.from(map.entries())
      .map(([ym, v]) => ({ ym, balance: v.income - v.expense }))
      .sort((a, b) => (a.ym < b.ym ? -1 : 1));
    return arr;
  }, [transactions]);

  const recent3Avg = useMemo(() => {
    const last = monthlyBalances.slice(-3);
    if (last.length === 0) return 0;
    const sum = last.reduce((a, x) => a + x.balance, 0);
    return sum / last.length;
  }, [monthlyBalances]);

  const year = selectedYm.slice(0, 4);
  const remainingMonthsInYear = useMemo(() => {
    const m = Number(selectedYm.slice(5, 7));
    return 13 - m;
  }, [selectedYm]);

  const predictedYearEndBalance = useMemo(() => {
    const rest = Math.max(0, remainingMonthsInYear - 1);
    return summary.balance + recent3Avg * rest;
  }, [summary.balance, recent3Avg, remainingMonthsInYear]);

  const dangerLevel = useMemo(() => {
    if (summary.balance < 0) return "danger";
    if (recent3Avg < 0) return "warning";
    return "ok";
  }, [summary.balance, recent3Avg]);

  const dangerText =
    dangerLevel === "danger"
      ? "危険：今月が赤字です"
      : dangerLevel === "warning"
      ? "注意：直近の平均貯金がマイナスです"
      : "良好：この調子！";

  const handleAdded = (created: Transaction) => {
    setTransactions((prev) => [created, ...prev]);
    setEditing(null);
  };

  const handleUpdated = (updated: Transaction) => {
    setTransactions((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setEditing(null);
  };

  const handleCancelEdit = () => setEditing(null);

  const handleDeleted = (id: number) => {
    setTransactions((prev) => prev.filter((t) => t.id !== id));
    if (editing?.id === id) setEditing(null);
  };

  return (
    <div>
      {/* ① 月切替 + userKey表示 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        <div style={{ fontWeight: 800 }}>miyamu budget</div>

        <div style={{ marginLeft: 8, fontSize: 12, opacity: 0.75 }}>
          userKey: {maskKey(userKey)}
        </div>
        <button
          type="button"
          onClick={() => setKeyEditingOpen((v) => !v)}
          style={{
            padding: "6px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          切替
        </button>

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

      {/* userKey切替UI（コンパクト） */}
      {keyEditingOpen && (
        <div
          style={{
            border: "1px dashed #ddd",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            userKeyを切り替える（デモ用）
          </div>
          <input
            value={userKeyInput}
            onChange={(e) => setUserKeyInput(e.target.value)}
            placeholder="8〜64文字（例：itchy-2026）"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={applyUserKey}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              このuserKeyに切替
            </button>
            <button
              type="button"
              onClick={regenerateUserKey}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              再生成
            </button>
            <button
              type="button"
              onClick={() => setKeyEditingOpen(false)}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              閉じる
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
            ※切替すると、その場で一覧を再取得します（リロード不要）
          </div>
        </div>
      )}

      {/* サマリー */}
      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ fontSize: 14, opacity: 0.7 }}>現在の残高</div>
        <div style={{ fontSize: 36, fontWeight: 700 }}>{yen(summary.balance)}円</div>

        <div style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
          収入：{yen(summary.income)}円　支出：{yen(summary.expense)}円
        </div>

        {/* ③ 目標 */}
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>目標残高（任意）</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={targetBalanceStr}
              onChange={(e) => setTargetBalanceStr(e.target.value)}
              inputMode="numeric"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
            />
            <span style={{ opacity: 0.7 }}>円</span>
          </div>

          {targetBalance > 0 && (
            <>
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                達成まであと {yen(remainToTarget)}円
              </div>
              <div
                style={{
                  height: 10,
                  background: "#eee",
                  borderRadius: 999,
                  overflow: "hidden",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressToTarget * 100}%`,
                    background: dangerLevel === "danger" ? "#ef4444" : "#22c55e",
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                進捗 {(progressToTarget * 100).toFixed(1)}%
              </div>
            </>
          )}

          <div style={{ marginTop: 12, fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            今月の貯金目標（任意）
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input
              value={monthlySaveTargetStr}
              onChange={(e) => setMonthlySaveTargetStr(e.target.value)}
              inputMode="numeric"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 10,
                border: "1px solid #ccc",
              }}
            />
            <span style={{ opacity: 0.7 }}>円</span>
          </div>

          {monthlySaveTarget > 0 && (
            <>
              <div style={{ marginTop: 8, fontWeight: 700 }}>
                達成まであと {yen(remainToMonthlySave)}円
              </div>
              <div
                style={{
                  height: 10,
                  background: "#eee",
                  borderRadius: 999,
                  overflow: "hidden",
                  marginTop: 8,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progressMonthlySave * 100}%`,
                    background: progressMonthlySave >= 1 ? "#22c55e" : "#60a5fa",
                  }}
                />
              </div>
              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                進捗 {(progressMonthlySave * 100).toFixed(1)}%
              </div>
            </>
          )}

          {/* ④ 年間予測 & 危険ゾーン */}
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid #eee" }}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>年間予測（ざっくり）</div>
            <div style={{ marginTop: 6, fontWeight: 800 }}>
              {year}年末の予測残高：{yen(Math.round(predictedYearEndBalance))}円
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              直近3ヶ月の平均貯金：{yen(Math.round(recent3Avg))}円 / 月
            </div>

            <div
              style={{
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                border: "1px solid #eee",
                background:
                  dangerLevel === "danger"
                    ? "#fff0f0"
                    : dangerLevel === "warning"
                    ? "#fff7ed"
                    : "#f0fff4",
                color:
                  dangerLevel === "danger"
                    ? "#b42318"
                    : dangerLevel === "warning"
                    ? "#9a3412"
                    : "#166534",
                fontWeight: 700,
              }}
            >
              {dangerText}
            </div>
          </div>
        </div>
      </div>

      {/* ② 円グラフ（タップで切替） */}
      {chartKind === "breakdown" ? (
        <PieChart
          title="支出の内訳"
          data={breakdownData.length ? breakdownData : [{ label: "（データなし）", value: 0 }]}
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