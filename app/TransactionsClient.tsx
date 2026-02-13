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
  return ymd.slice(0, 7);
}

function fmtYM(ym: string) {
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
 * - 親の円サイズに追従するため、width/height を 100% にする
 * - viewBox を 0..100 の正規化座標に固定する
 */
function Ring({
  progress,
  color,
  trackColor = "#e5e7eb",
  stroke = 10, // 0..100座標系での太さ
}: {
  progress: number;
  color: string;
  trackColor?: string;
  stroke?: number;
}) {
  const p = clamp01(progress);
  const size = 100;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  return (
    <svg
      width="100%"
      height="100%"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
      viewBox={`0 0 ${size} ${size}`}
      preserveAspectRatio="xMidYMid meet"
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
  // ✅ 3つの円（残高/返済/貯蓄）
  // =========================

  // 返済総額（任意）
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");
  const debtTotal = Number(debtTotalStr.replace(/,/g, "")) || 0;

  // 「返済」扱い：カテゴリに「返済」を含む支出
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

  // 返済：B方式 → 「残り割合」が減っていく（赤）
  const debtRingProgress =
    debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;

  // 貯蓄：今月目標に近づくほど増える（緑）
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

  /**
   * ✅ サイズを clamp() でレスポンシブ化
   * - PC: 上限で止まる
   * - スマホ: vwに合わせて縮む
   */
  const sizeCss = (key: "balance" | "debt" | "save") => {
    // 通常サイズ（未拡大）
    const base =
      key === "balance"
        ? isMobile
          ? "clamp(160px, 70vw, 240px)"
          : "clamp(220px, 28vw, 300px)"
        : isMobile
        ? "clamp(130px, 52vw, 190px)"
        : "clamp(180px, 20vw, 240px)";

    // 拡大サイズ
    const active =
      key === "balance"
        ? isMobile
          ? "clamp(220px, 84vw, 300px)"
          : "clamp(260px, 32vw, 340px)"
        : isMobile
        ? "clamp(190px, 72vw, 260px)"
        : "clamp(220px, 26vw, 300px)";

    // 他2つを少し小さく
    const small =
      isMobile ? "clamp(115px, 46vw, 170px)" : "clamp(170px, 18vw, 220px)";

    if (activeCircle === null) return base;
    return activeCircle === key ? active : small;
  };

  // stroke（正規化 0..100座標）
  const strokeFor = (key: "balance" | "debt" | "save") => {
    if (key === "balance") return 10;
    return 9;
  };

  // どの円をタップしたかで入力UIを出す
  const circleEditorTitle =
    activeCircle === "balance"
      ? "残高（目標残高を設定）"
      : activeCircle === "debt"
      ? "返済（返済総額を設定）"
      : activeCircle === "save"
      ? "貯蓄（今月の目標を設定）"
      : "";

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

      {/* ✅ 3つの円サマリー（タップで拡大＆詳細表示） */}
      <div style={{ maxWidth: 860, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
            justifyItems: "center",
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          {/* 上の円（残高） */}
          <div style={{ gridColumn: isMobile ? "auto" : "1 / 3" }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "balance" ? null : "balance")
              }
              style={{
                width: sizeCss("balance"),
                height: sizeCss("balance"),
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
                padding: 12,
              }}
            >
              <Ring
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
                  lineHeight: 1.05,
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
          <div>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "debt" ? null : "debt")
              }
              style={{
                width: sizeCss("debt"),
                height: sizeCss("debt"),
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
                padding: 12,
              }}
            >
              <Ring
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
                  lineHeight: 1.05,
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
          <div>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "save" ? null : "save")
              }
              style={{
                width: sizeCss("save"),
                height: sizeCss("save"),
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
                padding: 12,
              }}
            >
              <Ring
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
                  lineHeight: 1.05,
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
            maxWidth: 860,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          <div style={{ fontWeight: 900, marginBottom: 8 }}>
            {circleEditorTitle}
          </div>

          {activeCircle === "balance" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                目標残高（任意）
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
          maxWidth: 860,
          marginLeft: "auto",
          marginRight: "auto",
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