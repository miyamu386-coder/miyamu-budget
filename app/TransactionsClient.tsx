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
 * ✅ 外周リング描画（SVG）
 * - 文字に被らないように「外周」に出す
 * - offsetDeg で開始位置（-90で12時スタート）
 */
function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
  outward = 0, // 外側に出す量
  offsetDeg = -90, // 開始位置（-90で12時スタート）
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  trackColor?: string;
  outward?: number;
  offsetDeg?: number;
}) {
  const p = clamp01(progress);

  // SVGを外側に伸ばすためのパディング
  const pad = Math.max(0, outward) + stroke;
  const full = size + pad * 2;

  const r = (size - stroke) / 2 + outward;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  const cx = full / 2;
  const cy = full / 2;

  return (
    <svg
      width={full}
      height={full}
      style={{
        position: "absolute",
        top: -pad,
        left: -pad,
        pointerEvents: "none",
        overflow: "visible",
      }}
      viewBox={`0 0 ${full} ${full}`}
    >
      {/* track */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
      {/* progress */}
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(${offsetDeg} ${cx} ${cy})`}
        style={{ transition: "stroke-dashoffset 0.35s ease" }}
      />
    </svg>
  );
}

/** =========================
 * 追加リング（最大8）
 * ========================= */
type ExtraRing = {
  id: string;
  title: string;
  // 手入力でOK（あとでカテゴリ連動などに拡張しやすい）
  current: number;
  target: number;
  color: string; // リング色
  offsetDeg?: number; // 将来「時計回りに動かす」用
};

function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

const MAX_EXTRA_RINGS = 8;

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
  // ✅ 目標値を localStorage 永続化
  // - 残高目標 / 今月貯金目標 / 返済総額
  // =========================
  const goalsStorageKey = useMemo(() => {
    // userKey別に保存（いっちーと分けられる）
    const k = userKey || "anonymous";
    return `miyamu_maker_goals_v1:${k}`;
  }, [userKey]);

  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const [monthlySaveTargetStr, setMonthlySaveTargetStr] =
    useState<string>("50000");
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");

  // 初回ロード
  useEffect(() => {
    if (!userKey) return;
    try {
      const raw = localStorage.getItem(goalsStorageKey);
      if (!raw) return;
      const obj = JSON.parse(raw) as {
        targetBalanceStr?: string;
        monthlySaveTargetStr?: string;
        debtTotalStr?: string;
      };
      if (typeof obj.targetBalanceStr === "string")
        setTargetBalanceStr(obj.targetBalanceStr);
      if (typeof obj.monthlySaveTargetStr === "string")
        setMonthlySaveTargetStr(obj.monthlySaveTargetStr);
      if (typeof obj.debtTotalStr === "string") setDebtTotalStr(obj.debtTotalStr);
    } catch (e) {
      console.warn("goals load failed", e);
    }
  }, [userKey, goalsStorageKey]);

  // 変更時保存
  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(
        goalsStorageKey,
        JSON.stringify({ targetBalanceStr, monthlySaveTargetStr, debtTotalStr })
      );
    } catch (e) {
      console.warn("goals save failed", e);
    }
  }, [userKey, goalsStorageKey, targetBalanceStr, monthlySaveTargetStr, debtTotalStr]);

  const targetBalance = Number(targetBalanceStr.replace(/,/g, "")) || 0;
  const monthlySaveTarget = Number(monthlySaveTargetStr.replace(/,/g, "")) || 0;
  const debtTotal = Number(debtTotalStr.replace(/,/g, "")) || 0;

  // 残高進捗
  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget =
    targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

  // 今月貯蓄進捗
  const savedThisMonth = summary.balance;
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const progressMonthlySave =
    monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

  // 返済扱い：カテゴリに「返済」を含む支出
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

  // ✅ リング進捗
  const balanceRingProgress = progressToTarget;
  // 返済：達成までの「残り割合」を減らす（0に近いほど達成）
  const debtRingProgress = debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;
  const saveRingProgress = progressMonthlySave;

  // ✅ 達成判定（光る）
  const balanceAchieved =
    targetBalance > 0 ? summary.balance >= targetBalance : false;
  const debtAchieved = debtTotal > 0 ? repaidTotal >= debtTotal : false;
  const saveAchieved =
    monthlySaveTarget > 0 ? savedThisMonth >= monthlySaveTarget : false;

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
  // ✅ スマホ判定（サイズ調整）
  // =========================
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  // =========================
  // ✅ 追加リング（最大8）を localStorage 永続化
  // =========================
  const extrasStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v1:${k}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);
  const [activeExtraTab, setActiveExtraTab] = useState<string | null>(null);

  useEffect(() => {
    if (!userKey) return;
    try {
      const raw = localStorage.getItem(extrasStorageKey);
      if (!raw) return;
      const arr = JSON.parse(raw) as ExtraRing[];
      if (Array.isArray(arr)) {
        const safe = arr
          .filter((x) => x && typeof x.id === "string")
          .slice(0, MAX_EXTRA_RINGS);
        setExtraRings(safe);
        setActiveExtraTab(safe[0]?.id ?? null);
      }
    } catch (e) {
      console.warn("extra rings load failed", e);
    }
  }, [userKey, extrasStorageKey]);

  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(extrasStorageKey, JSON.stringify(extraRings));
    } catch (e) {
      console.warn("extra rings save failed", e);
    }
  }, [userKey, extrasStorageKey, extraRings]);

  const canAddExtra = extraRings.length < MAX_EXTRA_RINGS;

  const addExtraRing = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }
    const n = extraRings.length + 1;
    const next: ExtraRing = {
      id: makeId(),
      title: `追加リング${n}`,
      current: 0,
      target: 100000,
      color: "#60a5fa",
      offsetDeg: -90,
    };
    setExtraRings((prev) => [...prev, next]);
    setActiveExtraTab(next.id);
  };

  const removeExtraRing = (id: string) => {
    setExtraRings((prev) => prev.filter((x) => x.id !== id));
    setActiveExtraTab((cur) => {
      if (cur !== id) return cur;
      const remain = extraRings.filter((x) => x.id !== id);
      return remain[0]?.id ?? null;
    });
  };

  const updateExtraRing = (id: string, patch: Partial<ExtraRing>) => {
    setExtraRings((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );
  };

  const activeExtra = useMemo(() => {
    if (!activeExtraTab) return null;
    return extraRings.find((x) => x.id === activeExtraTab) ?? null;
  }, [extraRings, activeExtraTab]);

  // ✅ 追加リングを「上部リングエリア」に反映する用（小リング一覧）
  const extraPreview = useMemo(() => {
    return extraRings.slice(0, MAX_EXTRA_RINGS).map((r) => {
      const progress = r.target > 0 ? clamp01(r.current / r.target) : 0;
      const achieved = r.target > 0 ? r.current >= r.target : false;
      return { ...r, progress, achieved };
    });
  }, [extraRings]);

  // =========================
  // ✅ 表示サイズ（外周リングで文字が被らない設計）
  // =========================
  const bigSize = isMobile ? 260 : 360;
  const smallSize = isMobile ? 160 : 220;

  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;

  // 外周に出す量（文字に被らない）
  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;

  // ✅ 三角配置（スマホでも縦一列にならない）
  const gridCols = "1fr 1fr";
  const gap = isMobile ? 14 : 18;

  // ✅ 上部に出す「追加リング反映」の小リングサイズ
  const extraMiniSize = isMobile ? 140 : 160;
  const extraMiniStroke = isMobile ? 10 : 12;
  const extraMiniOutward = isMobile ? 7 : 8;

  return (
    <div>
      {/* ① 月切替（このコンポーネント側では “みやむMaker” タイトルは出さない） */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
        }}
      >
        {SHOW_USERKEY_UI && (
          <>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
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
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ◀
        </button>
        <div style={{ fontWeight: 900, fontSize: 18 }}>{fmtYM(selectedYm)}</div>
        <button
          onClick={() => setSelectedYm((v) => addMonths(v, 1))}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 800,
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

      {/* ✅ 3つのリング（三角配置） */}
      <div style={{ maxWidth: 920, margin: "0 auto" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: gridCols,
            gap,
            alignItems: "center",
            marginBottom: 12,
          }}
        >
          {/* 上（総資産：大） */}
          <div
            style={{
              gridColumn: "1 / 3",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: bigSize,
                height: bigSize,
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                position: "relative",
                overflow: "visible",
                boxShadow: balanceAchieved
                  ? "0 0 28px rgba(34,197,94,0.45)"
                  : "0 10px 25px rgba(0,0,0,0.06)",
              }}
            >
              <Ring
                size={bigSize}
                stroke={strokeBig}
                outward={outwardBig}
                progress={balanceRingProgress}
                color="#9ca3af"
              />

              <div style={{ zIndex: 2, position: "relative" }}>
                <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 800 }}>
                  総資産
                </div>
                <div
                  style={{
                    fontSize: isMobile ? 44 : 54,
                    fontWeight: 900,
                    color: summary.balance < 0 ? "#ef4444" : "#111",
                    lineHeight: 1.05,
                  }}
                >
                  {yen(summary.balance)}円
                </div>
                <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                  収入 {yen(summary.income)} / 支出 {yen(summary.expense)}
                </div>

                {targetBalance > 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>
                    目標まであと {yen(remainToTarget)}円
                  </div>
                )}

                {balanceAchieved && (
                  <div style={{ marginTop: 10, fontWeight: 900 }}>
                    ✅ 目標達成！
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 左下（返済：小） */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: smallSize,
                height: smallSize,
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                position: "relative",
                overflow: "visible",
                boxShadow: debtAchieved
                  ? "0 0 28px rgba(34,197,94,0.45)"
                  : "0 10px 25px rgba(0,0,0,0.05)",
              }}
            >
              <Ring
                size={smallSize}
                stroke={strokeSmall}
                outward={outwardSmall}
                progress={debtRingProgress}
                color="#d1d5db"
              />

              <div style={{ zIndex: 2, position: "relative" }}>
                <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 800 }}>
                  返済
                </div>
                <div
                  style={{
                    fontSize: isMobile ? 30 : 34,
                    fontWeight: 900,
                    lineHeight: 1.05,
                  }}
                >
                  {yen(repaidTotal)}円
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                  (累計)
                </div>
                {debtTotal > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    残り総額 {yen(remainingDebt)}円
                  </div>
                )}
                {debtAchieved && (
                  <div style={{ marginTop: 8, fontWeight: 900 }}>
                    ✅ 目標達成！
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 右下（貯蓄：小） */}
          <div style={{ display: "flex", justifyContent: "center" }}>
            <div
              style={{
                width: smallSize,
                height: smallSize,
                borderRadius: 999,
                border: "1px solid #e5e5e5",
                background: "#fff",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                position: "relative",
                overflow: "visible",
                boxShadow: saveAchieved
                  ? "0 0 28px rgba(34,197,94,0.45)"
                  : "0 10px 25px rgba(0,0,0,0.05)",
              }}
            >
              <Ring
                size={smallSize}
                stroke={strokeSmall}
                outward={outwardSmall}
                progress={saveRingProgress}
                color="#22c55e"
              />

              <div style={{ zIndex: 2, position: "relative" }}>
                <div style={{ fontSize: 14, opacity: 0.75, fontWeight: 800 }}>
                  貯蓄
                </div>
                <div
                  style={{
                    fontSize: isMobile ? 30 : 34,
                    fontWeight: 900,
                    lineHeight: 1.05,
                  }}
                >
                  {yen(savedThisMonth)}円
                </div>
                <div style={{ marginTop: 4, fontSize: 12, opacity: 0.6 }}>
                  今月
                </div>
                {monthlySaveTarget > 0 && (
                  <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                    目標差 {yen(remainToMonthlySave)}円
                  </div>
                )}
                {saveAchieved && (
                  <div style={{ marginTop: 8, fontWeight: 900 }}>
                    ✅ 目標達成！
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ✅ 追加リングボタン（最大8） */}
          <div
            style={{
              gridColumn: "1 / 3",
              display: "flex",
              justifyContent: "center",
            }}
          >
            <button
              type="button"
              onClick={addExtraRing}
              disabled={!canAddExtra}
              style={{
                padding: "14px 18px",
                borderRadius: 14,
                border: "1px solid #ccc",
                background: canAddExtra ? "#fff" : "#f3f4f6",
                cursor: canAddExtra ? "pointer" : "not-allowed",
                fontWeight: 900,
                fontSize: 16,
                minWidth: 220,
              }}
            >
              ＋ リング追加 {canAddExtra ? "" : "(上限)"}
            </button>
          </div>

          {/* ✅ 上部に反映：追加リングの小リング一覧（保存した値がここに出る） */}
          {extraPreview.length > 0 && (
            <div style={{ gridColumn: "1 / 3" }}>
              <div style={{ fontWeight: 900, margin: "8px 0 10px" }}>
                追加リング（上部反映）
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)",
                  gap: 12,
                }}
              >
                {extraPreview.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveExtraTab(r.id)}
                    style={{
                      border: activeExtraTab === r.id ? "2px solid #111" : "1px solid #e5e7eb",
                      borderRadius: 14,
                      background: "#fff",
                      padding: 10,
                      cursor: "pointer",
                      textAlign: "center",
                      boxShadow: r.achieved
                        ? "0 0 20px rgba(34,197,94,0.35)"
                        : "0 10px 20px rgba(0,0,0,0.05)",
                    }}
                  >
                    <div
                      style={{
                        width: extraMiniSize,
                        height: extraMiniSize,
                        margin: "0 auto",
                        borderRadius: 999,
                        border: "1px solid #e5e5e5",
                        position: "relative",
                        overflow: "visible",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Ring
                        size={extraMiniSize}
                        stroke={extraMiniStroke}
                        outward={extraMiniOutward}
                        progress={r.progress}
                        color={r.color}
                        offsetDeg={r.offsetDeg ?? -90}
                      />
                      <div style={{ zIndex: 2, position: "relative" }}>
                        <div style={{ fontSize: 12, fontWeight: 900, opacity: 0.75 }}>
                          {r.title}
                        </div>
                        <div style={{ fontSize: 22, fontWeight: 900 }}>
                          {yen(r.current)}
                        </div>
                        {r.achieved && (
                          <div style={{ marginTop: 4, fontSize: 12, fontWeight: 900 }}>
                            ✅
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ✅ 追加リングの「タブ」 + 編集（ここで詳細設定） */}
          {extraRings.length > 0 && (
            <div style={{ gridColumn: "1 / 3", marginTop: 6 }}>
              <div style={{ fontWeight: 900, margin: "6px 0 10px" }}>
                追加リング（最大{MAX_EXTRA_RINGS}）
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  marginBottom: 10,
                }}
              >
                {extraRings.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setActiveExtraTab(r.id)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: "1px solid #ddd",
                      background: activeExtraTab === r.id ? "#111" : "#fff",
                      color: activeExtraTab === r.id ? "#fff" : "#111",
                      cursor: "pointer",
                      fontWeight: 800,
                      fontSize: 12,
                    }}
                  >
                    {r.title}
                  </button>
                ))}
              </div>

              {activeExtra && (
                <div
                  style={{
                    border: "1px solid #eee",
                    borderRadius: 12,
                    padding: 12,
                    background: "#fff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontWeight: 900, flex: 1 }}>
                      {activeExtra.title}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeExtraRing(activeExtra.id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 10,
                        border: "1px solid #ddd",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      削除
                    </button>
                  </div>

                  <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      タイトル
                      <input
                        value={activeExtra.title}
                        onChange={(e) =>
                          updateExtraRing(activeExtra.id, {
                            title: e.target.value.slice(0, 24),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      現在値（手入力）
                      <input
                        value={String(activeExtra.current)}
                        inputMode="numeric"
                        onChange={(e) =>
                          updateExtraRing(activeExtra.id, {
                            current:
                              Number(e.target.value.replace(/,/g, "")) || 0,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      目標値
                      <input
                        value={String(activeExtra.target)}
                        inputMode="numeric"
                        onChange={(e) =>
                          updateExtraRing(activeExtra.id, {
                            target:
                              Number(e.target.value.replace(/,/g, "")) || 0,
                          })
                        }
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      リング色（HEX）
                      <input
                        value={activeExtra.color}
                        onChange={(e) =>
                          updateExtraRing(activeExtra.id, {
                            color: e.target.value.slice(0, 16),
                          })
                        }
                        style={{
                          width: "100%",
                          padding: 10,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                    </label>

                    <div style={{ fontSize: 12, opacity: 0.75 }}>
                      進捗：{" "}
                      {activeExtra.target > 0
                        ? `${(
                            clamp01(activeExtra.current / activeExtra.target) *
                            100
                          ).toFixed(1)}%`
                        : "—"}
                      {activeExtra.target > 0 &&
                      activeExtra.current >= activeExtra.target
                        ? " ✅ 目標達成！"
                        : ""}
                    </div>

                    {/* 追加リングのプレビュー（大きめ） */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginTop: 6,
                      }}
                    >
                      <div
                        style={{
                          width: isMobile ? 200 : 220,
                          height: isMobile ? 200 : 220,
                          borderRadius: 999,
                          border: "1px solid #e5e5e5",
                          background: "#fff",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          position: "relative",
                          overflow: "visible",
                          textAlign: "center",
                          boxShadow:
                            activeExtra.target > 0 &&
                            activeExtra.current >= activeExtra.target
                              ? "0 0 28px rgba(34,197,94,0.45)"
                              : "0 10px 25px rgba(0,0,0,0.05)",
                        }}
                      >
                        <Ring
                          size={isMobile ? 200 : 220}
                          stroke={isMobile ? 12 : 14}
                          outward={isMobile ? 8 : 10}
                          progress={
                            activeExtra.target > 0
                              ? clamp01(activeExtra.current / activeExtra.target)
                              : 0
                          }
                          color={activeExtra.color}
                          offsetDeg={activeExtra.offsetDeg ?? -90}
                        />
                        <div style={{ zIndex: 2, position: "relative" }}>
                          <div style={{ fontWeight: 900, opacity: 0.75 }}>
                            {activeExtra.title}
                          </div>
                          <div style={{ fontSize: 28, fontWeight: 900 }}>
                            {yen(activeExtra.current)}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      ※追加リングは「手入力」でまず完成 → 後でカテゴリ連動や時計回りオフセット等を実装しやすい形にしてます
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ✅ 目標入力（3つ） */}
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div style={{ fontWeight: 900, marginBottom: 10 }}>
          目標設定（リロードしても保持）
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          {/* 残高 */}
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
              総資産 目標（任意）
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
          </div>

          {/* 返済 */}
          <div>
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
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              返済累計：{yen(repaidTotal)}円 / 残り：{yen(remainingDebt)}円
              <br />
              ※カテゴリに「返済」を含む支出を返済扱い
            </div>
          </div>

          {/* 貯蓄 */}
          <div>
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
          </div>
        </div>
      </div>

      {/* ✅ 年間予測 */}
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

      {/* ✅ 入力フォーム */}
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