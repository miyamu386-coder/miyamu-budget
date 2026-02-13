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
function normalizeNumberInput(s: string) {
  return s.replace(/[^\d]/g, "").slice(0, 12); // 数字だけ + 桁制限
}

// ✅ 本番(Vercel)では userKey UI を出さない（ローカル開発だけ表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV !== "production";

// userKey（永続キー）
const STORAGE_KEY_USERKEY = "miyamu_budget_user_key";

// 目標値の保存キー（userKeyごとに分ける）
const goalsKey = (userKey: string) => `miyamu_budget_goals:${userKey || "anon"}`;

// ✅ 目標値3つをまとめて保存（将来8リング化しても拡張しやすい）
type Goals = {
  targetBalance: string; // 目標残高
  debtTotal: string; // 返済総額
  monthlySaveTarget: string; // 今月貯蓄目標
};

const DEFAULT_GOALS: Goals = {
  targetBalance: "200000",
  debtTotal: "0",
  monthlySaveTarget: "50000",
};

function maskKey(k: string) {
  if (!k) return "";
  if (k.length <= 8) return k;
  return `${k.slice(0, 4)}…${k.slice(-4)}`;
}
function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
}

// ✅ localStorage 永続 state（string版）
function usePersistedString(
  key: string,
  initialValue: string
): [string, (v: string) => void, boolean] {
  const [value, setValue] = useState(initialValue);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(key);
      if (v != null) setValue(v);
    } catch {
      // ignore
    } finally {
      setReady(true);
    }
  }, [key]);

  const setAndPersist = (v: string) => {
    setValue(v);
    try {
      localStorage.setItem(key, v);
    } catch {
      // ignore
    }
  };

  return [value, setAndPersist, ready];
}

// ✅ goals をまとめて永続化
function usePersistedGoals(userKey: string) {
  const key = goalsKey(userKey);
  const [raw, setRaw, ready] = usePersistedString(key, JSON.stringify(DEFAULT_GOALS));

  const goals: Goals = useMemo(() => {
    try {
      const parsed = JSON.parse(raw) as Partial<Goals>;
      return {
        targetBalance: parsed.targetBalance ?? DEFAULT_GOALS.targetBalance,
        debtTotal: parsed.debtTotal ?? DEFAULT_GOALS.debtTotal,
        monthlySaveTarget: parsed.monthlySaveTarget ?? DEFAULT_GOALS.monthlySaveTarget,
      };
    } catch {
      return DEFAULT_GOALS;
    }
  }, [raw]);

  const setGoals = (next: Goals) => setRaw(JSON.stringify(next));

  return { goals, setGoals, ready };
}

/**
 * ✅ 外周リング（SVG）
 * - ringPadding をつけて「外側」に描く（文字に被らない）
 * - startAngleDeg / clockwise で将来「時計回りに動かす」拡張もOK
 */
function OuterRing({
  size,
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
  ringPadding = 10,
  startAngleDeg = -90,
  clockwise = true,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
  ringPadding?: number;
  startAngleDeg?: number;
  clockwise?: boolean;
}) {
  const p = clamp01(progress);

  const svgSize = size + ringPadding * 2;
  const center = svgSize / 2;

  // 半径：外周側に出したいので ringPadding 分だけ広げる
  const r = (size - stroke) / 2 + ringPadding;
  const c = 2 * Math.PI * r;

  // 進行方向（時計回り）
  const dir = clockwise ? 1 : -1;
  const dashOffset = c * (1 - p) * dir;

  return (
    <svg
      width={svgSize}
      height={svgSize}
      viewBox={`0 0 ${svgSize} ${svgSize}`}
      style={{
        position: "absolute",
        top: -ringPadding,
        left: -ringPadding,
        pointerEvents: "none",
      }}
    >
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
        transform={`rotate(${startAngleDeg} ${center} ${center})`}
        style={{ transition: "stroke-dashoffset 0.35s ease" }}
      />
    </svg>
  );
}

type CircleKey = "balance" | "debt" | "save";

type RingItem = {
  key: CircleKey;
  title: string;
  valueText: string;
  subText?: string;
  color: string;
  trackColor?: string;
  progress: number; // 0..1
  achieved: boolean;
  helperText?: string;
};

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(
    initialTransactions ?? []
  );
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ 現在のuserKeyをstate管理
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

  // ✅ userKey切替UI（デモUI：本番では非表示）
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
    localStorage.setItem(STORAGE_KEY_USERKEY, next);
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  const regenerateUserKey = () => {
    localStorage.removeItem(STORAGE_KEY_USERKEY);
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

  // ✅ スマホ判定
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // ✅ どの円がアクティブか
  const [activeCircle, setActiveCircle] = useState<CircleKey | null>(null);

  // ✅ 円のサイズ（ここは「小さめ」方針に寄せた）
  const sizeFor = (key: CircleKey) => {
    // 通常時
    const base = isMobile ? (key === "balance" ? 230 : 150) : (key === "balance" ? 280 : 200);
    // 拡大時
    const active = isMobile ? (key === "balance" ? 300 : 230) : (key === "balance" ? 340 : 260);
    // 他は少し小さく
    const small = isMobile ? 140 : 190;

    if (activeCircle === null) return base;
    return activeCircle === key ? active : small;
  };

  const strokeFor = (key: CircleKey) => {
    const s = sizeFor(key);
    if (key === "balance") return s >= 280 ? 14 : 12;
    return s >= 220 ? 12 : 10;
  };

  // ✅ 外周に出すための padding
  const ringPaddingFor = (key: CircleKey) => {
    // 8リング化を見据えて「外周余白」を少し確保
    if (key === "balance") return isMobile ? 14 : 16;
    return isMobile ? 12 : 14;
  };

  // ✅ 目標値（3つ）を localStorage 永続化
  const { goals, setGoals, ready: goalsReady } = usePersistedGoals(userKey || "anon");

  // 目標残高
  const targetBalance = Number(goals.targetBalance || "0") || 0;
  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget =
    targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  // 貯蓄目標
  const monthlySaveTarget = Number(goals.monthlySaveTarget || "0") || 0;
  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave =
    monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

  // 返済総額
  const debtTotal = Number(goals.debtTotal || "0") || 0;

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

  const remainingDebt = Math.max(0, debtTotal - repaidTotal);

  // ✅ 返済リング進捗：達成したら 100%（=光る）
  const progressDebt =
    debtTotal > 0 ? clamp01(repaidTotal / debtTotal) : 0;

  // ✅ 年間予測（ざっくり）
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

  // ✅ 達成判定（光る）
  const balanceAchieved = targetBalance > 0 && summary.balance >= targetBalance;
  const saveAchieved = monthlySaveTarget > 0 && savedThisMonth >= monthlySaveTarget;
  const debtAchieved = debtTotal > 0 && repaidTotal >= debtTotal;

  // ✅ 将来8リング化しやすい：rings 配列で管理（まず3つ）
  const rings: RingItem[] = useMemo(() => {
    return [
      {
        key: "balance",
        title: "総資産",
        valueText: `${yen(summary.balance)}円`,
        subText: `収入 ${yen(summary.income)} / 支出 ${yen(summary.expense)}`,
        color: "#9ca3af",
        trackColor: "#e5e7eb",
        progress: progressToTarget,
        achieved: balanceAchieved,
        helperText: targetBalance > 0 ? `目標まであと ${yen(remainToTarget)}円` : "目標未設定",
      },
      {
        key: "debt",
        title: "返済",
        valueText: `${yen(repaidTotal)}円`,
        subText: "(累計)",
        color: "#22c55e",
        trackColor: "#e5e7eb",
        progress: progressDebt,
        achieved: debtAchieved,
        helperText: debtTotal > 0 ? `残り総額 ${yen(remainingDebt)}円` : "返済総額 未設定",
      },
      {
        key: "save",
        title: "貯蓄",
        valueText: `${yen(savedThisMonth)}円`,
        subText: "今月",
        color: "#22c55e",
        trackColor: "#e5e7eb",
        progress: progressMonthlySave,
        achieved: saveAchieved,
        helperText:
          monthlySaveTarget > 0 ? `目標差 ${yen(remainToMonthlySave)}円` : "目標未設定",
      },
    ];
  }, [
    summary.balance,
    summary.income,
    summary.expense,
    progressToTarget,
    balanceAchieved,
    targetBalance,
    remainToTarget,
    repaidTotal,
    progressDebt,
    debtAchieved,
    debtTotal,
    remainingDebt,
    savedThisMonth,
    progressMonthlySave,
    saveAchieved,
    monthlySaveTarget,
    remainToMonthlySave,
  ]);

  // ✅ 追加リング（将来用：今はデモ）
  const handleAddRing = () => {
    alert("ここは将来：最大8リング追加UIを入れる場所（追加タブ）");
  };

  // ✅ タップした円に応じて入力UIを出す
  const circleEditorTitle =
    activeCircle === "balance"
      ? "総資産（目標総資産を設定）"
      : activeCircle === "debt"
      ? "返済（返済総額を設定）"
      : activeCircle === "save"
      ? "貯蓄（今月の目標を設定）"
      : "";

  // ✅ 1つのカードを描画（rings配列から）
  const renderRingCard = (item: RingItem) => {
    const size = sizeFor(item.key);
    const stroke = strokeFor(item.key);
    const ringPadding = ringPaddingFor(item.key);

    const isActive = activeCircle === item.key;
    const baseShadow = "0 10px 25px rgba(0,0,0,0.05)";
    const glowShadow = "0 0 26px rgba(34,197,94,0.55)";
    const boxShadow = item.achieved ? glowShadow : baseShadow;

    return (
      <div
        key={item.key}
        role="button"
        onClick={() => setActiveCircle(isActive ? null : item.key)}
        style={{
          width: size,
          height: size,
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
          overflow: "visible", // ✅ 外周リングを外側に出すため（重要）
          boxShadow, // ✅ boxShadowは1回だけ（赤線回避）
        }}
      >
        {/* ✅ 外周リング（外側） */}
        <OuterRing
          size={size}
          stroke={stroke}
          progress={item.progress}
          color={item.color}
          trackColor={item.trackColor}
          ringPadding={ringPadding}
          startAngleDeg={-90} // ここを将来「時計回り開始角」調整に使える
          clockwise={true}
        />

        <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 700 }}>
          {item.title}
        </div>

        <div
          style={{
            fontSize: isActive ? (item.key === "balance" ? 42 : 34) : item.key === "balance" ? 34 : 26,
            fontWeight: 900,
            color:
              item.key === "balance" && summary.balance < 0 ? "#ef4444" : "#111",
            lineHeight: 1.05,
          }}
        >
          {item.valueText}
        </div>

        {item.subText && (
          <div style={{ marginTop: 6, fontSize: 12, opacity: 0.72 }}>
            {item.subText}
          </div>
        )}

        {isActive && item.helperText && (
          <div style={{ marginTop: 8, fontSize: 13, opacity: 0.85 }}>
            {item.helperText}
            {(item.key === "debt" && debtAchieved) ||
            (item.key === "save" && saveAchieved) ||
            (item.key === "balance" && balanceAchieved) ? (
              <div style={{ marginTop: 6, fontWeight: 800 }}>
                ✅ 目標達成！
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
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

      {/* ✅ 三角配置（スマホ） / PCは上+下2つ */}
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gap: 16,
            justifyItems: "center",
            alignItems: "center",
            marginBottom: 14,
            gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr",
            gridTemplateAreas: isMobile
              ? `
                "balance balance"
                "debt save"
                "add add"
              `
              : `
                "balance balance"
                "debt save"
              `,
          }}
        >
          <div style={{ gridArea: "balance" }}>{renderRingCard(rings[0])}</div>
          <div style={{ gridArea: "debt" }}>{renderRingCard(rings[1])}</div>
          <div style={{ gridArea: "save" }}>{renderRingCard(rings[2])}</div>

          {isMobile && (
            <div style={{ gridArea: "add" }}>
              <button
                type="button"
                onClick={handleAddRing}
                style={{
                  padding: "12px 18px",
                  borderRadius: 14,
                  border: "1px solid #cfcfcf",
                  background: "#fff",
                  cursor: "pointer",
                  fontWeight: 900,
                  fontSize: 16,
                  boxShadow: "0 10px 25px rgba(0,0,0,0.06)",
                }}
              >
                ＋ リング追加
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ✅ タップした円に応じて任意額を入力（3つ全部 永続化） */}
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
                目標総資産（任意）※リロードしても保持されます
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={goals.targetBalance}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      targetBalance: normalizeNumberInput(e.target.value),
                    })
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
                <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
                  達成まであと {yen(remainToTarget)}円 / 進捗{" "}
                  {(progressToTarget * 100).toFixed(1)}%
                </div>
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
                  value={goals.debtTotal}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      debtTotal: normalizeNumberInput(e.target.value),
                    })
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
              </div>
            </>
          )}

          {activeCircle === "save" && (
            <>
              <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
                今月の貯蓄目標（任意）※リロードしても保持されます
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input
                  value={goals.monthlySaveTarget}
                  onChange={(e) =>
                    setGoals({
                      ...goals,
                      monthlySaveTarget: normalizeNumberInput(e.target.value),
                    })
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

      {/* ✅ 入力フォーム（上部へ） */}
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