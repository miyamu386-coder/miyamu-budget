"use client";

import { useEffect, useMemo, useState } from "react";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
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

// ✅ 本番(Vercel)では userKey UI を出さない（ローカル開発だけ表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV !== "production";

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

/**
 * ✅ リング描画（SVG）
 * progress: 0〜1
 */
function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
}) {
  const p = clamp01(progress);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  return (
    <svg
      width={size}
      height={size}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${size} ${size}`}
    >
      {/* track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      {/* progress */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: "stroke-dashoffset 0.35s ease" }}
      />
    </svg>
  );
}

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(
    initialTransactions ?? []
  );
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ 現在のuserKeyをstate管理（UIは本番では非表示だけど、内部では使う）
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

  // ✅ userKey切替（デモUI：本番では非表示）
  const [keyEditingOpen, setKeyEditingOpen] = useState(false);
  const [userKeyInput, setUserKeyInput] = useState("");

  useEffect(() => {
    if (keyEditingOpen) setUserKeyInput(userKey);
  }, [keyEditingOpen, userKey]);

  const applyUserKey = () => {
    const next = normalizeUserKeyInput(userKeyInput);
    if (next.length < 8 || next.length > 64) {
      alert("userKey は8〜64文字で入力してください（英数字推奨）");
      return;
    }
    localStorage.setItem(STORAGE_KEY, next);
    setUserKey(next);
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

  // --- ③ 目標：残高目標 / 今月の貯金目標 / 返済総額（任意入力）
  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const targetBalance = Number(targetBalanceStr.replace(/,/g, "")) || 0;

  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget =
    targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  const [monthlySaveTargetStr, setMonthlySaveTargetStr] =
    useState<string>("50000");
  const monthlySaveTarget = Number(monthlySaveTargetStr.replace(/,/g, "")) || 0;

  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave =
    monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

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

  // =========================
  // ✅ 3つの円（総資産/返済/貯蓄）＋タップで拡大＋詳細表示＋任意額入力UI
  // =========================

  // 返済総額（任意）
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");
  const debtTotal = Number(debtTotalStr.replace(/,/g, "")) || 0;

  // 「返済」扱いの条件：カテゴリに「返済」を含む支出
  const isRepayment = (t: Transaction) => {
    const c = (t.category ?? "").trim();
    return t.type === "expense" && c.includes("返済");
  };

  // 返済累計（全期間）
  const repaidTotal = useMemo(() => {
    return transactions.reduce(
      (sum, t) => (isRepayment(t) ? sum + t.amount : sum),
      0
    );
  }, [transactions]);

  // 残り返済総額
  const remainingDebt = Math.max(0, debtTotal - repaidTotal);

  // ✅ リング進捗
  const balanceRingProgress = progressToTarget;
  const debtRingProgress =
    debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;
  const saveRingProgress = progressMonthlySave;

  // スマホ判定
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // どの円がアクティブか
  const [activeCircle, setActiveCircle] = useState<
    "balance" | "debt" | "save" | null
  >(null);

  // ✅ 円のサイズ（表示用：拡大縮小）
  // ★スマホは小さめに調整（縦一列をやめるので、2列に収まるサイズ感に）
  const sizeFor = (key: "balance" | "debt" | "save") => {
    // 通常サイズ
    const baseBalance = isMobile ? 140 : 240;
    const baseSmall = isMobile ? 120 : 190;

    // 拡大時サイズ
    const activeBalance = isMobile ? 200 : 300;
    const activeSmall = isMobile ? 170 : 260;

    if (activeCircle === null) {
      return key === "balance" ? baseBalance : baseSmall;
    }
    if (activeCircle === key) {
      return key === "balance" ? activeBalance : activeSmall;
    }
    // 非アクティブ2つはさらに少し小さく
    return isMobile ? 105 : 170;
  };

  // ✅ リングのサイズは固定（リングが消えない/ズレない対策）
  const baseSizeFor = (key: "balance" | "debt" | "save") => {
    if (key === "balance") return isMobile ? 140 : 240;
    return isMobile ? 120 : 190;
  };

  const strokeFor = (key: "balance" | "debt" | "save") => {
    const s = baseSizeFor(key);
    if (key === "balance") return s >= 200 ? 12 : 10;
    return s >= 180 ? 11 : 9;
  };

  const circleEditorTitle =
    activeCircle === "balance"
      ? "総資産（目標総資産を設定）"
      : activeCircle === "debt"
      ? "返済（返済総額を設定）"
      : activeCircle === "save"
      ? "貯蓄（今月の目標を設定）"
      : "";

  // ✅ 「＋リング追加」仮ハンドラ（後でタブUIに差し替え）
  const handleAddRing = () => {
    alert("（今は仮）リング追加UIは次のステップで実装します！");
  };

  return (
    <div>
      {/* ① 月切替 */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div style={{ fontWeight: 800 }}>みやむMaker</div>

        {SHOW_USERKEY_UI && (
          <>
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
          </>
        )}

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

      {/* userKey切替UI（ローカル開発だけ表示） */}
      {SHOW_USERKEY_UI && keyEditingOpen && (
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
          <div
            style={{
              display: "flex",
              gap: 10,
              marginTop: 10,
              flexWrap: "wrap",
            }}
          >
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

      {/* ✅ 3つの円サマリー（スマホも三角配置） */}
      <div style={{ maxWidth: isMobile ? 420 : 900, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gridTemplateAreas: `
              "balance balance"
              "debt    save"
              "add     add"
            `,
            gap: isMobile ? 12 : 16,
            alignItems: "center",
            justifyItems: "center",
            marginBottom: 12,
          }}
        >
          {/* 上（総資産） */}
          <div style={{ gridArea: "balance" }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "balance" ? null : "balance")
              }
              style={{
                width: sizeFor("balance"),
                height: sizeFor("balance"),
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                transition: "all 0.25s ease",
                userSelect: "none",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <Ring
                size={baseSizeFor("balance")}
                stroke={strokeFor("balance")}
                progress={balanceRingProgress}
                color="#9ca3af"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                総資産
              </div>
              <div
                style={{
                  fontSize: activeCircle === "balance" ? 42 : 34,
                  fontWeight: 900,
                  color: summary.balance < 0 ? "#ef4444" : "#111",
                }}
              >
                {yen(summary.balance)}円
              </div>

              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                収入 {yen(summary.income)} / 支出 {yen(summary.expense)}
              </div>

              {activeCircle === "balance" && (
                <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
                  目標まであと {yen(remainToTarget)}円
                </div>
              )}
            </div>
          </div>

          {/* 左下（返済） */}
          <div style={{ gridArea: "debt" }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "debt" ? null : "debt")
              }
              style={{
                width: sizeFor("debt"),
                height: sizeFor("debt"),
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                transition: "all 0.25s ease",
                userSelect: "none",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <Ring
                size={baseSizeFor("debt")}
                stroke={strokeFor("debt")}
                progress={debtRingProgress}
                color="#ef4444"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                返済
              </div>
              <div
                style={{
                  fontSize: activeCircle === "debt" ? 32 : 26,
                  fontWeight: 900,
                }}
              >
                {yen(repaidTotal)}円
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                (累計)
              </div>

              {activeCircle === "debt" && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  残り総額 {yen(remainingDebt)}円
                </div>
              )}
            </div>
          </div>

          {/* 右下（貯蓄） */}
          <div style={{ gridArea: "save" }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "save" ? null : "save")
              }
              style={{
                width: sizeFor("save"),
                height: sizeFor("save"),
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                transition: "all 0.25s ease",
                userSelect: "none",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <Ring
                size={baseSizeFor("save")}
                stroke={strokeFor("save")}
                progress={saveRingProgress}
                color="#22c55e"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                貯蓄
              </div>
              <div
                style={{
                  fontSize: activeCircle === "save" ? 32 : 26,
                  fontWeight: 900,
                }}
              >
                {yen(savedThisMonth)}円
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                今月
              </div>

              {activeCircle === "save" && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  目標差 {yen(remainToMonthlySave)}円
                </div>
              )}
            </div>
          </div>

          {/* 下：＋リング追加 */}
          <div style={{ gridArea: "add" }}>
            <button
              type="button"
              onClick={handleAddRing}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              ＋ リング追加
            </button>
          </div>
        </div>
      </div>

      {/* ✅ タップした円に応じて任意額を入力 */}
      {activeCircle && (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 12,
            padding: 14,
            marginBottom: 14,
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            {circleEditorTitle}
          </div>

          {activeCircle === "balance" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                目標総資産（任意）
              </div>
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
                  <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                    達成まであと {yen(remainToTarget)}円 / 進捗{" "}
                    {(progressToTarget * 100).toFixed(1)}%
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
                        background:
                          dangerLevel === "danger" ? "#ef4444" : "#22c55e",
                      }}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {activeCircle === "debt" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                返済総額（任意）
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={debtTotalStr}
                  onChange={(e) => setDebtTotalStr(e.target.value)}
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
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                返済累計：{yen(repaidTotal)}円 / 残り：{yen(remainingDebt)}円
                <br />
                ※カテゴリに「返済」を含む支出を返済扱い
              </div>
            </>
          )}

          {activeCircle === "save" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
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
              <div style={{ marginTop: 10, fontSize: 12, opacity: 0.75 }}>
                達成まであと {yen(remainToMonthlySave)}円 / 進捗{" "}
                {(progressMonthlySave * 100).toFixed(1)}%
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
            </>
          )}

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              marginTop: 12,
            }}
          >
            <button
              type="button"
              onClick={() => setActiveCircle(null)}
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
        </div>
      )}

      {/* ✅ 年間予測 & 危険ゾーン（常時表示） */}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontSize: 12, opacity: 0.7 }}>年間予測（ざっくり）</div>
        <div style={{ marginTop: 6, fontWeight: 900 }}>
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
            fontWeight: 800,
          }}
        >
          {dangerText}
        </div>
      </div>

      {/* ✅ 入力フォーム（上部へ移動） */}
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