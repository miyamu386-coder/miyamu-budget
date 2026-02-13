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

// userKey 保存キー
const STORAGE_KEY_USER = "miyamu_budget_user_key";

// 目標値 保存キー（全部永続化）
const STORAGE_KEY_TARGET_BALANCE = "miyamu_budget_target_balance";
const STORAGE_KEY_MONTHLY_SAVE_TARGET = "miyamu_budget_monthly_save_target";
const STORAGE_KEY_DEBT_TOTAL = "miyamu_budget_debt_total";

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return k;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}

function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
}

function safeGetLS(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSetLS(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

/**
 * ✅ 外周リング（SVG）
 * - 「カードの外側」に描画する（中の文字には一切被らない）
 * - index で外側に重ねられる（将来8本まで）
 */
function OuterRing({
  innerSize, // カードの幅/高さ（丸の直径）
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
  gap = 10, // カード外周からどれだけ外に出すか
  index = 0, // 0,1,2... 外側に重ねる
  clockwise = true, // 将来用（時計回りに回す）
  startAngleDeg = -90, // 12時スタート
}: {
  innerSize: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
  gap?: number;
  index?: number;
  clockwise?: boolean;
  startAngleDeg?: number;
}) {
  const p = clamp01(progress);

  // 外側に重ねるほど半径を少しずつ増やす
  const ringOffset = gap + index * (stroke + 6);

  // SVG 全体サイズ（カードより外側に描画するため大きくする）
  const size = innerSize + ringOffset * 2 + stroke * 2;

  // 半径は SVG の中心から
  const r = size / 2 - stroke / 2;

  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  const center = size / 2;
  const rotate = `${clockwise ? startAngleDeg : -startAngleDeg} ${center} ${center}`;
  const flip = clockwise ? "" : `scale(-1 1) translate(${-size} 0)`; // 反時計回り対応（将来用）

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{
        position: "absolute",
        left: "50%",
        top: "50%",
        transform: "translate(-50%, -50%)",
        pointerEvents: "none",
        overflow: "visible",
      }}
    >
      <g transform={flip}>
        {/* track */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {/* progress */}
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={dashOffset}
          transform={`rotate(${rotate})`}
          style={{ transition: "stroke-dashoffset 0.35s ease" }}
        />
      </g>
    </svg>
  );
}

/**
 * ✅ 目標達成で光らせる（外周の“にじみ”）
 */
function glowStyle(color: string, enabled: boolean) {
  if (!enabled) return {};
  return {
    boxShadow: `0 0 30px ${color}55, 0 0 70px ${color}33`,
  } as const;
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
    safeSetLS(STORAGE_KEY_USER, next);
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  const regenerateUserKey = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_USER);
    } catch {}
    const next = getOrCreateUserKey();
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  // --- 月切替（今月をデフォルト）
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
  // ✅ 目標値（全部 localStorage 永続化）
  // =========================

  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const [monthlySaveTargetStr, setMonthlySaveTargetStr] =
    useState<string>("50000");
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");

  // 初回に localStorage から読み込み
  useEffect(() => {
    const tb = safeGetLS(STORAGE_KEY_TARGET_BALANCE);
    const ms = safeGetLS(STORAGE_KEY_MONTHLY_SAVE_TARGET);
    const dt = safeGetLS(STORAGE_KEY_DEBT_TOTAL);

    if (tb && tb.trim()) setTargetBalanceStr(tb);
    if (ms && ms.trim()) setMonthlySaveTargetStr(ms);
    if (dt && dt.trim()) setDebtTotalStr(dt);
  }, []);

  // 変更時に保存
  useEffect(() => {
    safeSetLS(STORAGE_KEY_TARGET_BALANCE, targetBalanceStr);
  }, [targetBalanceStr]);
  useEffect(() => {
    safeSetLS(STORAGE_KEY_MONTHLY_SAVE_TARGET, monthlySaveTargetStr);
  }, [monthlySaveTargetStr]);
  useEffect(() => {
    safeSetLS(STORAGE_KEY_DEBT_TOTAL, debtTotalStr);
  }, [debtTotalStr]);

  const targetBalance = Number(targetBalanceStr.replace(/,/g, "")) || 0;
  const monthlySaveTarget = Number(monthlySaveTargetStr.replace(/,/g, "")) || 0;
  const debtTotal = Number(debtTotalStr.replace(/,/g, "")) || 0;

  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget =
    targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave =
    monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

  // 「返済」扱いの条件：カテゴリに「返済」を含む支出
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

  // ✅ リング進捗（外周で回す）
  const balanceRingProgress = progressToTarget; // 目標残高に近づくほど増える
  const debtRingProgress =
    debtTotal > 0 ? clamp01(repaidTotal / debtTotal) : 0; // 返済は「達成に近いほど増える」
  const saveRingProgress = progressMonthlySave; // 貯蓄は目標に近づくほど増える

  // =========================
  // ✅ 年間予測 & 危険ゾーン（シンプル版）
  // =========================

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
  // ✅ UI：スマホ判定 + 拡大切替
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

  const sizeFor = (key: "balance" | "debt" | "save") => {
    const base = isMobile ? 150 : 240;
    const active = isMobile ? 240 : 300;
    const small = isMobile ? 130 : 190;

    if (activeCircle === null) return base;
    return activeCircle === key ? active : small;
  };

  // ✅ “外周リング”の太さ（見やすい太さに固定）
  const ringStrokeFor = (key: "balance" | "debt" | "save") => {
    const s = sizeFor(key);
    if (s >= 280) return 12;
    if (s >= 220) return 11;
    return 10;
  };

  const circleEditorTitle =
    activeCircle === "balance"
      ? "残高（目標残高を設定）"
      : activeCircle === "debt"
      ? "返済（返済総額を設定）"
      : activeCircle === "save"
      ? "貯蓄（今月の目標を設定）"
      : "";

  // =========================
  // ✅ 将来8リング対応しやすい構造：rings 配列
  // （いまは3つだけ表示）
  // =========================
  type RingDef = {
    key: "balance" | "debt" | "save";
    title: string;
    valueMain: string;
    sub?: string;
    progress: number;
    color: string;
    trackColor?: string;
    glowOnAchieve?: boolean;
    achieved?: boolean;
  };

  const achievedBalance = targetBalance > 0 && summary.balance >= targetBalance;
  const achievedDebt = debtTotal > 0 && repaidTotal >= debtTotal;
  const achievedSave = monthlySaveTarget > 0 && savedThisMonth >= monthlySaveTarget;

  const rings: RingDef[] = [
    {
      key: "balance",
      title: "総資産",
      valueMain: `${yen(summary.balance)}円`,
      sub: `収入 ${yen(summary.income)} / 支出 ${yen(summary.expense)}`,
      progress: balanceRingProgress,
      color: "#9ca3af",
      trackColor: "#e5e7eb",
      achieved: achievedBalance,
      glowOnAchieve: false, // 残高は光らせない（好みでtrueにしてOK）
    },
    {
      key: "debt",
      title: "返済",
      valueMain: `${yen(repaidTotal)}円`,
      sub: "(累計)",
      progress: debtRingProgress,
      color: "#22c55e", // ✅達成時の色味と相性で緑寄り（赤にしたければ#ef4444）
      trackColor: "#e5e7eb",
      achieved: achievedDebt,
      glowOnAchieve: true,
    },
    {
      key: "save",
      title: "貯蓄",
      valueMain: `${yen(savedThisMonth)}円`,
      sub: "今月",
      progress: saveRingProgress,
      color: "#22c55e",
      trackColor: "#e5e7eb",
      achieved: achievedSave,
      glowOnAchieve: true,
    },
  ];

  // リングの配置（今は基本3つ：上1つ + 下2つ）
  const getRingDef = (k: "balance" | "debt" | "save") =>
    rings.find((r) => r.key === k)!;

  // カード共通スタイル
  const cardStyle = (key: "balance" | "debt" | "save") => {
    const def = getRingDef(key);
    const size = sizeFor(key);
    const achieved = !!def.achieved && !!def.glowOnAchieve;

    return {
      width: size,
      height: size,
      borderRadius: 999,
      border: "1px solid #e5e5e5",
      background: "#fff",
      display: "flex",
      flexDirection: "column" as const,
      alignItems: "center",
      justifyContent: "center",
      transition: "all 0.25s ease",
      userSelect: "none" as const,
      cursor: "pointer",
      textAlign: "center" as const,
      position: "relative" as const,
      overflow: "visible" as const, // ✅ 外周リングを切らない
      ...glowStyle(def.color, achieved),
    };
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

      {/* ✅ 3つの円サマリー（外周リング） */}
      {/* ★ PC版の散らばり対策：maxWidthで中央寄せ */}
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
          {/* 上：残高 */}
          <div
            style={{
              gridColumn: isMobile ? "auto" : "1 / 3",
              display: "flex",
              justifyContent: "center",
              paddingTop: 12, // 外周リング分の余白
              paddingBottom: 12,
            }}
          >
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "balance" ? null : "balance")
              }
              style={cardStyle("balance")}
            >
              {/* ✅ 外周リング：カード外側 */}
              <OuterRing
                innerSize={sizeFor("balance")}
                stroke={ringStrokeFor("balance")}
                progress={getRingDef("balance").progress}
                color={getRingDef("balance").color}
                trackColor={getRingDef("balance").trackColor}
                gap={10}
                index={0}
                clockwise={true}
                startAngleDeg={-90}
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

          {/* 左下：返済 */}
          <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "debt" ? null : "debt")
              }
              style={cardStyle("debt")}
            >
              <OuterRing
                innerSize={sizeFor("debt")}
                stroke={ringStrokeFor("debt")}
                progress={getRingDef("debt").progress}
                color={getRingDef("debt").color}
                trackColor={getRingDef("debt").trackColor}
                gap={10}
                index={0}
                clockwise={true}
                startAngleDeg={-90}
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
                  {achievedDebt && (
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      ✅ 目標達成！
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* 右下：貯蓄 */}
          <div style={{ display: "flex", justifyContent: "center", padding: 12 }}>
            <div
              role="button"
              onClick={() =>
                setActiveCircle(activeCircle === "save" ? null : "save")
              }
              style={cardStyle("save")}
            >
              <OuterRing
                innerSize={sizeFor("save")}
                stroke={ringStrokeFor("save")}
                progress={getRingDef("save").progress}
                color={getRingDef("save").color}
                trackColor={getRingDef("save").trackColor}
                gap={10}
                index={0}
                clockwise={true}
                startAngleDeg={-90}
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
              <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>今月</div>

              {activeCircle === "save" && (
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.85 }}>
                  目標差 {yen(remainToMonthlySave)}円
                  {achievedSave && (
                    <div style={{ marginTop: 6, fontWeight: 900 }}>
                      ✅ 目標達成！
                    </div>
                  )}
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
                返済総額（任意）※リロードしても保持されます
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
                今月の貯金目標（任意）※リロードしても保持されます
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