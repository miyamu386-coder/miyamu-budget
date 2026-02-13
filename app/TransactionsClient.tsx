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

  return { income, expense, balance: income - expense };
}

function ymdToMonthKey(ymd: string) {
  return ymd.slice(0, 7); // "2026-02-08" -> "2026-02"
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

// userKey 永続キー
const STORAGE_USERKEY = "miyamu_budget_user_key";

// ✅ 目標値 永続キー（全部保存）
const STORAGE_TARGET_BALANCE = "miyamu_budget_target_balance";
const STORAGE_MONTHLY_SAVE_TARGET = "miyamu_budget_monthly_save_target";
const STORAGE_DEBT_TOTAL = "miyamu_budget_debt_total";

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return k;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
}

function safeGetLS(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  try {
    const v = localStorage.getItem(key);
    return v ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSetLS(key: string, value: string) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function normalizeNumberInputString(s: string) {
  // 余計な空白削除
  const t = (s ?? "").trim();
  // 数字とカンマだけ残す（マイナスは許可したいならここ調整）
  const cleaned = t.replace(/[^\d,]/g, "");
  // 先頭ゼロだけの変なやつはそのままでもOK
  return cleaned.slice(0, 24);
}

/**
 * ✅ リング描画（SVG）
 * - 進捗 ring は「外周」に出す
 * - 拡大しても文字に被らないよう「内側余白（innerPad）」を確保
 */
function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
  innerPad = 0, // ✅ 文字と被らない用の内側余白
  startAngleDeg = 90, // ✅ 上(12時)開始。0=3時,90=12時
  direction = "cw", // ✅ 将来拡張：cw / ccw
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
  innerPad?: number;
  startAngleDeg?: number;
  direction?: "cw" | "ccw";
}) {
  const p = clamp01(progress);

  // ✅ 内側余白を考慮して半径を小さくする（被り対策の本体）
  const r = (size - stroke) / 2 - innerPad;
  const c = 2 * Math.PI * r;

  // 時計回り：進捗が増えるほど塗りが増える
  // 反時計回りにしたい場合は offset の計算だけ変える
  const dashOffset =
    direction === "cw" ? c * (1 - p) : c * (1 + p); // ccwは一旦簡易

  // ✅ startAngleDeg（上開始にするなら90）から描画開始
  const rot = startAngleDeg - 90;

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
        transform={`rotate(${rot} ${size / 2} ${size / 2})`}
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
    localStorage.setItem(STORAGE_USERKEY, next);
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  const regenerateUserKey = () => {
    localStorage.removeItem(STORAGE_USERKEY);
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

  // =========================
  // ✅ 目標値：全部 localStorage 永続化（リロードでも保持）
  // =========================
  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const [monthlySaveTargetStr, setMonthlySaveTargetStr] =
    useState<string>("50000");
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");

  // 初回だけ localStorage から復元
  useEffect(() => {
    setTargetBalanceStr(safeGetLS(STORAGE_TARGET_BALANCE, "200000"));
    setMonthlySaveTargetStr(safeGetLS(STORAGE_MONTHLY_SAVE_TARGET, "50000"));
    setDebtTotalStr(safeGetLS(STORAGE_DEBT_TOTAL, "0"));
  }, []);

  // 入力変更を localStorage に保存
  useEffect(() => {
    safeSetLS(STORAGE_TARGET_BALANCE, targetBalanceStr);
  }, [targetBalanceStr]);

  useEffect(() => {
    safeSetLS(STORAGE_MONTHLY_SAVE_TARGET, monthlySaveTargetStr);
  }, [monthlySaveTargetStr]);

  useEffect(() => {
    safeSetLS(STORAGE_DEBT_TOTAL, debtTotalStr);
  }, [debtTotalStr]);

  const targetBalance = Number(String(targetBalanceStr).replace(/,/g, "")) || 0;
  const monthlySaveTarget =
    Number(String(monthlySaveTargetStr).replace(/,/g, "")) || 0;
  const debtTotal = Number(String(debtTotalStr).replace(/,/g, "")) || 0;

  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget =
    targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave =
    monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

  // --- 年間予測（ざっくり）
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
    return Array.from(map.entries())
      .map(([ym, v]) => ({ ym, balance: v.income - v.expense }))
      .sort((a, b) => (a.ym < b.ym ? -1 : 1));
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
  // ✅ 返済の集計
  // =========================
  const isRepayment = (t: Transaction) => {
    const c = (t.category ?? "").trim();
    return t.type === "expense" && c.includes("返済");
  };

  const repaidTotal = useMemo(() => {
    return transactions.reduce(
      (sum, t) => (isRepayment(t) ? sum + t.amount : sum),
      0
    );
  }, [transactions]);

  const remainingDebt = Math.max(0, debtTotal - repaidTotal);

  // =========================
  // ✅ 「目標達成で光る」判定
  // - 返済：累計 >= 返済総額（任意）
  // - 貯蓄：今月 >= 今月目標（任意）
  // =========================
  const debtAchieved = debtTotal > 0 && repaidTotal >= debtTotal;
  const saveAchieved = monthlySaveTarget > 0 && savedThisMonth >= monthlySaveTarget;

  // =========================
  // ✅ リング進捗
  // =========================
  const balanceRingProgress = progressToTarget;
  // 返済リング：残り割合が減る（赤）
  const debtRingProgress =
    debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;
  const saveRingProgress = progressMonthlySave;

  // =========================
  // ✅ レスポンシブ＆拡大UI
  // =========================
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  const [activeCircle, setActiveCircle] = useState<
    "balance" | "debt" | "save" | null
  >(null);

  // 表示ボックスのサイズ（拡大縮小）
  const sizeFor = (key: "balance" | "debt" | "save") => {
    const base = isMobile ? 140 : 240;
    const active = isMobile ? 220 : 300;
    const small = isMobile ? 115 : 190;

    if (activeCircle === null) return base;
    return activeCircle === key ? active : small;
  };

  // ✅ リング描画は固定（安定化）
  const baseSizeFor = (key: "balance" | "debt" | "save") => {
    if (key === "balance") return isMobile ? 140 : 240;
    return isMobile ? 115 : 190;
  };

  const strokeFor = (key: "balance" | "debt" | "save") => {
    const s = baseSizeFor(key);
    if (key === "balance") return s >= 200 ? 12 : 10;
    return s >= 180 ? 11 : 9;
  };

  // ✅ 被り防止の「内側余白」：拡大時ほど余白増やす
  const innerPadFor = (key: "balance" | "debt" | "save") => {
    const isActive = activeCircle === key;
    if (key === "balance") return isActive ? (isMobile ? 26 : 34) : (isMobile ? 18 : 22);
    return isActive ? (isMobile ? 22 : 28) : (isMobile ? 14 : 18);
  };

  // ✅ 光るスタイル（boxShadow）
  const glowStyle = (enabled: boolean) =>
    enabled
      ? {
          boxShadow: "0 0 0 0 rgba(34,197,94,0), 0 0 40px rgba(34,197,94,0.35)",
          borderColor: "rgba(34,197,94,0.25)",
        }
      : {};

  const circleEditorTitle =
    activeCircle === "balance"
      ? "残高（目標残高を設定）"
      : activeCircle === "debt"
      ? "返済（返済総額を設定）"
      : activeCircle === "save"
      ? "貯蓄（今月の目標を設定）"
      : "";

  // =========================
  // ✅ 将来8リング対応しやすい：rings配列で管理
  // - 今は3つだけ描画
  // - 後で rings にpushするだけで増やせる
  // =========================
  type RingKey = "balance" | "debt" | "save";
  type RingDef = {
    key: RingKey;
    title: string;
    color: string;
    trackColor?: string;
    progress: number;
    achieved: boolean; // ✅ 光る判定
    mainValue: string; // 表示の大きい数字
    subLabel?: string; // 例：(累計) / 今月
    topLabel?: string; // 上の小さいラベル
    extraActive?: React.ReactNode; // 拡大時追加表示
  };

  const rings: RingDef[] = useMemo(() => {
    return [
      {
        key: "balance",
        title: "総資産",
        color: "#9ca3af",
        progress: balanceRingProgress,
        achieved: false, // 残高は今は光らせない（必要なら条件追加）
        mainValue: `${yen(summary.balance)}円`,
        topLabel: "総資産",
        subLabel: `収入 ${yen(summary.income)} / 支出 ${yen(summary.expense)}`,
        extraActive: (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
            目標まであと {yen(remainToTarget)}円
          </div>
        ),
      },
      {
        key: "debt",
        title: "返済",
        color: debtAchieved ? "#22c55e" : "#ef4444",
        progress: debtRingProgress,
        achieved: debtAchieved,
        mainValue: `${yen(repaidTotal)}円`,
        topLabel: "返済",
        subLabel: "(累計)",
        extraActive: (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            残り総額 {yen(remainingDebt)}円
            {debtAchieved && (
              <div style={{ marginTop: 6, fontWeight: 900, color: "#16a34a" }}>
                ✅ 目標達成！
              </div>
            )}
          </div>
        ),
      },
      {
        key: "save",
        title: "貯蓄",
        color: "#22c55e",
        progress: saveRingProgress,
        achieved: saveAchieved,
        mainValue: `${yen(savedThisMonth)}円`,
        topLabel: "貯蓄",
        subLabel: "今月",
        extraActive: (
          <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
            目標差 {yen(remainToMonthlySave)}円
            {saveAchieved && (
              <div style={{ marginTop: 6, fontWeight: 900, color: "#16a34a" }}>
                ✅ 目標達成！
              </div>
            )}
          </div>
        ),
      },
    ];
  }, [
    balanceRingProgress,
    debtRingProgress,
    debtAchieved,
    repaidTotal,
    remainingDebt,
    saveRingProgress,
    saveAchieved,
    savedThisMonth,
    summary.balance,
    summary.expense,
    summary.income,
    remainToTarget,
    remainToMonthlySave,
  ]);

  // ヘルパ：リング定義取得
  const ringByKey = (k: RingKey) => rings.find((r) => r.key === k)!;

  // 配置は今の3つ固定（上：balance / 下左：debt / 下右：save）
  const balanceRing = ringByKey("balance");
  const debtRing = ringByKey("debt");
  const saveRing = ringByKey("save");

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
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
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
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
            gap: 16,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          {/* 上の円（残高） */}
          <div
            style={{
              gridColumn: isMobile ? "auto" : "1 / 3",
              display: "flex",
              justifyContent: "center",
            }}
          >
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
                progress={balanceRing.progress}
                color={balanceRing.color}
                innerPad={innerPadFor("balance")} // ✅ 被り防止
                startAngleDeg={90}
                direction="cw"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                {balanceRing.topLabel}
              </div>
              <div
                style={{
                  fontSize: activeCircle === "balance" ? 42 : 34,
                  fontWeight: 900,
                  color: summary.balance < 0 ? "#ef4444" : "#111",
                  lineHeight: 1.05,
                }}
              >
                {balanceRing.mainValue}
              </div>
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                {balanceRing.subLabel}
              </div>

              {activeCircle === "balance" && balanceRing.extraActive}
            </div>
          </div>

          {/* 左下（返済） */}
          <div style={{ display: "flex", justifyContent: "center" }}>
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
                transition: "all 0.25s ease",
                userSelect: "none",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                ...(glowStyle(debtRing.achieved) as any), // ✅ 目標達成で光る
              }}
            >
              <Ring
                size={baseSizeFor("debt")}
                stroke={strokeFor("debt")}
                progress={debtRing.progress}
                color={debtRing.color}
                innerPad={innerPadFor("debt")} // ✅ 被り防止
                startAngleDeg={90}
                direction="cw"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                {debtRing.topLabel}
              </div>
              <div
                style={{
                  fontSize: activeCircle === "debt" ? 32 : 26,
                  fontWeight: 900,
                  lineHeight: 1.05,
                }}
              >
                {debtRing.mainValue}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                {debtRing.subLabel}
              </div>

              {activeCircle === "debt" && debtRing.extraActive}
            </div>
          </div>

          {/* 右下（貯蓄） */}
          <div style={{ display: "flex", justifyContent: "center" }}>
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
                transition: "all 0.25s ease",
                userSelect: "none",
                cursor: "pointer",
                textAlign: "center",
                position: "relative",
                overflow: "hidden",
                ...(glowStyle(saveRing.achieved) as any), // ✅ 目標達成で光る
              }}
            >
              <Ring
                size={baseSizeFor("save")}
                stroke={strokeFor("save")}
                progress={saveRing.progress}
                color={saveRing.color}
                innerPad={innerPadFor("save")} // ✅ 被り防止
                startAngleDeg={90}
                direction="cw"
              />

              <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
                {saveRing.topLabel}
              </div>
              <div
                style={{
                  fontSize: activeCircle === "save" ? 32 : 26,
                  fontWeight: 900,
                  lineHeight: 1.05,
                }}
              >
                {saveRing.mainValue}
              </div>
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                {saveRing.subLabel}
              </div>

              {activeCircle === "save" && saveRing.extraActive}
            </div>
          </div>
        </div>
      </div>

      {/* ✅ タップした円に応じて任意額を入力（全部永続化済み） */}
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
                目標残高（任意）※リロードしても保持されます
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={targetBalanceStr}
                  onChange={(e) =>
                    setTargetBalanceStr(
                      normalizeNumberInputString(e.target.value)
                    )
                  }
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
                        background: dangerLevel === "danger" ? "#ef4444" : "#22c55e",
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
                返済総額（任意）※リロードしても保持されます
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={debtTotalStr}
                  onChange={(e) =>
                    setDebtTotalStr(normalizeNumberInputString(e.target.value))
                  }
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
                {debtAchieved && (
                  <>
                    <br />
                    <span style={{ fontWeight: 900, color: "#16a34a" }}>
                      ✅ 目標達成（返済累計が目標以上）
                    </span>
                  </>
                )}
              </div>
            </>
          )}

          {activeCircle === "save" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                今月の貯金目標（任意）※リロードしても保持されます
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={monthlySaveTargetStr}
                  onChange={(e) =>
                    setMonthlySaveTargetStr(
                      normalizeNumberInputString(e.target.value)
                    )
                  }
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
                {saveAchieved && (
                  <>
                    <br />
                    <span style={{ fontWeight: 900, color: "#16a34a" }}>
                      ✅ 目標達成（今月が目標以上）
                    </span>
                  </>
                )}
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

          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
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