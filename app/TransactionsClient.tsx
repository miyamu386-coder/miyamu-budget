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
 */
function Ring({
  size,
  stroke,
  progress,
  color,
  trackColor = "#e5e7eb",
  outward = 0,
  offsetDeg = -90,
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
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />
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
 * slot: 周囲の配置位置（0=返済固定, 1=貯蓄固定, 2〜=追加リング）
 * ========================= */
type ExtraRing = {
  id: string;
  title: string;
  current: number;
  target: number;
  color: string;
  offsetDeg?: number;
  slot?: number; // ✅ 追加
};

function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

const MAX_EXTRA_RINGS = 8;
const SLOT_COUNT = 2 + MAX_EXTRA_RINGS; // 返済/貯蓄 + 追加最大8 = 10

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(
    initialTransactions ?? []
  );
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ userKey
  const [userKey, setUserKey] = useState<string>("");

  useEffect(() => {
    setUserKey(getOrCreateUserKey());
  }, []);

  // ✅ userKeyが変わったらデータ再取得
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

  // ✅ userKey切替（ローカル用）
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

  // --- 月切替
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

  // ✅ カテゴリ候補
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const c = (t.category ?? "").trim();
      if (c) set.add(c);
    }
    return Array.from(set);
  }, [transactions]);

  // =========================
  // ✅ 目標値 localStorage（userKey別）
  // =========================
  const goalsStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_goals_v1:${k}`;
  }, [userKey]);

  const [targetBalanceStr, setTargetBalanceStr] = useState<string>("200000");
  const [monthlySaveTargetStr, setMonthlySaveTargetStr] = useState<string>("50000");
  const [debtTotalStr, setDebtTotalStr] = useState<string>("0");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(goalsStorageKey);
      if (!raw) return;
      const obj = JSON.parse(raw) as {
        targetBalanceStr?: string;
        monthlySaveTargetStr?: string;
        debtTotalStr?: string;
      };
      if (typeof obj.targetBalanceStr === "string") setTargetBalanceStr(obj.targetBalanceStr);
      if (typeof obj.monthlySaveTargetStr === "string") setMonthlySaveTargetStr(obj.monthlySaveTargetStr);
      if (typeof obj.debtTotalStr === "string") setDebtTotalStr(obj.debtTotalStr);
    } catch (e) {
      console.warn("goals load failed", e);
    }
  }, [goalsStorageKey]);

  useEffect(() => {
    try {
      localStorage.setItem(
        goalsStorageKey,
        JSON.stringify({ targetBalanceStr, monthlySaveTargetStr, debtTotalStr })
      );
    } catch (e) {
      console.warn("goals save failed", e);
    }
  }, [goalsStorageKey, targetBalanceStr, monthlySaveTargetStr, debtTotalStr]);

  const targetBalance = Number(targetBalanceStr.replace(/,/g, "")) || 0;
  const monthlySaveTarget = Number(monthlySaveTargetStr.replace(/,/g, "")) || 0;
  const debtTotal = Number(debtTotalStr.replace(/,/g, "")) || 0;

  // 残高進捗
  const remainToTarget = Math.max(0, targetBalance - summary.balance);
  const progressToTarget = targetBalance > 0 ? clamp01(summary.balance / targetBalance) : 0;

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

  const repaidTotal = useMemo(() => {
    return transactions.reduce((sum, t) => (isRepayment(t) ? sum + t.amount : sum), 0);
  }, [transactions]);

  const remainingDebt = Math.max(0, debtTotal - repaidTotal);

  const balanceRingProgress = progressToTarget;
  const debtRingProgress = debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;
  const saveRingProgress = progressMonthlySave;

  const balanceAchieved = targetBalance > 0 ? summary.balance >= targetBalance : false;
  const debtAchieved = debtTotal > 0 ? repaidTotal >= debtTotal : false;
  const saveAchieved = monthlySaveTarget > 0 ? savedThisMonth >= monthlySaveTarget : false;

  // =========================
  // ✅ 年間予測（ざっくり）
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
  // ✅ スマホ判定
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
  // ✅ 追加リング localStorage（userKey別）
  //   - v2: slot対応
  //   - v1/v2どちらでも救済読み込み
  // =========================
  const extrasStorageKeyV2 = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v2:${k}`;
  }, [userKey]);

  const extrasStorageKeyV1 = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v1:${k}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);
  const [activeExtraId, setActiveExtraId] = useState<string | null>(null);

  // ✅ タップ入れ替え：選択中slot
  const [pickedSlot, setPickedSlot] = useState<number | null>(null);

  // slotの空きを探す（追加用/補正用）
  const findNextFreeSlot = (rings: ExtraRing[]) => {
    const used = new Set(
      rings.map((r) => r.slot).filter((x): x is number => typeof x === "number")
    );
    let slot = 2; // 0,1は固定
    while (used.has(slot)) slot++;
    return slot;
  };

  // ✅ userKey確定後にロード（slotが無い古いデータも救済）
  useEffect(() => {
    if (!userKey) return;

    const load = (key: string) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const arr = JSON.parse(raw) as ExtraRing[];
        if (!Array.isArray(arr)) return null;
        return arr;
      } catch {
        return null;
      }
    };

    const v2 = load(extrasStorageKeyV2);
    const v1 = v2 ? null : load(extrasStorageKeyV1);
    const source = v2 ?? v1;

    if (!source) {
      setExtraRings([]);
      setActiveExtraId(null);
      setPickedSlot(null);
      return;
    }

    let safe = source
      .filter((x) => x && typeof x.id === "string")
      .slice(0, MAX_EXTRA_RINGS)
      .map((x) => ({
        ...x,
        title: (x.title ?? "").toString().slice(0, 24) || "追加リング",
        current: Number((x as any).current) || 0,
        target: Number((x as any).target) || 0,
        color: (x.color ?? "#60a5fa").toString(),
        offsetDeg: typeof x.offsetDeg === "number" ? x.offsetDeg : -90,
        slot: typeof x.slot === "number" ? x.slot : undefined,
      }));

    // ✅ slotが無いものに自動でslotを割り当て（重複も直す）
    const used = new Set<number>([0, 1]);
    safe = safe.map((r) => {
      let slot = typeof r.slot === "number" && r.slot >= 2 ? r.slot : undefined;

      if (slot === undefined || used.has(slot)) {
        slot = findNextFreeSlot(
          safe.map((x) => ({ ...x, slot: x.id === r.id ? undefined : x.slot }))
        );
      }
      used.add(slot);
      return { ...r, slot };
    });

    setExtraRings(safe);
    setActiveExtraId((cur) => cur ?? safe[0]?.id ?? null);
    setPickedSlot(null);
  }, [userKey, extrasStorageKeyV2, extrasStorageKeyV1]);

  // ✅ 保存（v2に保存）
  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(extrasStorageKeyV2, JSON.stringify(extraRings));
    } catch (e) {
      console.warn("extra rings save failed", e);
    }
  }, [userKey, extrasStorageKeyV2, extraRings]);

  const canAddExtra = extraRings.length < MAX_EXTRA_RINGS;

  const addExtraRing = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }
    const n = extraRings.length + 1;
    const slot = findNextFreeSlot(extraRings);

    const next: ExtraRing = {
      id: makeId(),
      title: `追加リング${n}`,
      current: 0,
      target: 100000,
      color: "#60a5fa",
      offsetDeg: -90,
      slot,
    };

    setExtraRings((prev) => [...prev, next]);
    setActiveExtraId(next.id);
  };

  const removeExtraRing = (id: string) => {
    setExtraRings((prev) => {
      const next = prev.filter((x) => x.id !== id);
      setActiveExtraId((cur) => {
        if (cur !== id) return cur;
        return next[0]?.id ?? null;
      });
      return next;
    });
    setPickedSlot(null);
  };

  const updateExtraRing = (id: string, patch: Partial<ExtraRing>) => {
    setExtraRings((prev) =>
      prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
    );
  };

  const activeExtra = useMemo(() => {
    if (!activeExtraId) return null;
    return extraRings.find((x) => x.id === activeExtraId) ?? null;
  }, [extraRings, activeExtraId]);

  // ✅ slot -> entry
  const slotMap = useMemo(() => {
    const map = new Map<number, { kind: "debt" | "save" | "extra"; id: string }>();
    map.set(0, { kind: "debt", id: "debt" });
    map.set(1, { kind: "save", id: "save" });

    for (const r of extraRings) {
      if (typeof r.slot === "number") {
        map.set(r.slot, { kind: "extra", id: r.id });
      }
    }
    return map;
  }, [extraRings]);

  // ✅ slot入れ替え（追加リング同士のみ）
  const swapSlots = (a: number, b: number) => {
    const fixed = new Set([0, 1]);
    if (fixed.has(a) || fixed.has(b)) return;

    setExtraRings((prev) => {
      const next = prev.map((r) => ({ ...r }));
      const ra = next.find((r) => r.slot === a);
      const rb = next.find((r) => r.slot === b);

      if (ra) ra.slot = b;
      if (rb) rb.slot = a;

      return next;
    });
  };

  // =========================
  // ✅ 表示サイズ
  // =========================
  const bigSize = isMobile ? 260 : 360;
  const smallSize = isMobile ? 140 : 180;

  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;

  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;

  // 周囲配置半径（中央リングの外側に並ぶ距離）
  const orbitRadius = isMobile ? 220 : 300;

  return (
    <div>
      {/* 月切替 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {SHOW_USERKEY_UI && (
          <>
            <div style={{ fontSize: 12, opacity: 0.75 }}>userKey: {maskKey(userKey)}</div>
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

      {/* userKey切替UI（ローカルのみ） */}
      {SHOW_USERKEY_UI && keyEditingOpen && (
        <div style={{ border: "1px dashed #ddd", borderRadius: 12, padding: 12, marginBottom: 12 }}>
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>userKeyを切り替える（デモ用）</div>
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

      {/* =========================
          ✅ 中央：総資産 / 周囲：返済・貯蓄・追加リング（タップ入れ替え）
         ========================= */}
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: isMobile ? 720 : 820,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* 中央：総資産（大リング） */}
          <button
            type="button"
            onClick={() => {
              // ✅ 中央を押したら選択解除（誤操作防止）
              setPickedSlot(null);
              setActiveExtraId(null);
            }}
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
              position: "absolute",
              left: "50%",
              top: "50%",
              transform: "translate(-50%, -50%)",
              overflow: "visible",
              boxShadow: balanceAchieved
                ? "0 0 28px rgba(34,197,94,0.45)"
                : "0 10px 25px rgba(0,0,0,0.06)",
              zIndex: 2,
              cursor: "pointer",
              padding: 0,
            }}
            title="中央（選択解除）"
          >
            <Ring
              size={bigSize}
              stroke={strokeBig}
              outward={outwardBig}
              progress={balanceRingProgress}
              color="#9ca3af"
            />

            <div style={{ zIndex: 2, position: "relative" }}>
              <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 800 }}>総資産</div>
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
                <div style={{ marginTop: 10, fontWeight: 900 }}>✅ 目標達成！</div>
              )}
            </div>
          </button>

          {/* 周囲：スロット配置（タップ入れ替え） */}
          {Array.from({ length: SLOT_COUNT }).map((_, slotIdx) => {
            const deg = -90 + (360 / SLOT_COUNT) * slotIdx;
            const rad = (deg * Math.PI) / 180;

            const x = Math.cos(rad) * orbitRadius;
            const y = Math.sin(rad) * orbitRadius;

            const entry = slotMap.get(slotIdx);

            let title = "空き";
            let value = 0;
            let progress = 0;
            let color = "#f3f4f6";
            let sub = "";
            let achieved = false;

            if (entry?.kind === "debt") {
              title = "返済";
              value = repaidTotal;
              progress = debtRingProgress;
              color = "#d1d5db";
              sub = "(累計)";
              achieved = debtAchieved;
            } else if (entry?.kind === "save") {
              title = "貯蓄";
              value = savedThisMonth;
              progress = saveRingProgress;
              color = "#22c55e";
              sub = "今月";
              achieved = saveAchieved;
            } else if (entry?.kind === "extra") {
              const r = extraRings.find((x) => x.id === entry.id);
              if (r) {
                title = r.title;
                value = r.current;
                progress = r.target > 0 ? clamp01(r.current / r.target) : 0;
                color = r.color;
                achieved = r.target > 0 ? r.current >= r.target : false;
              }
            }

            const fixed = slotIdx === 0 || slotIdx === 1;
            const isPicked = pickedSlot === slotIdx;

            return (
              <button
                key={`slot_${slotIdx}`}
                type="button"
                onClick={() => {
                  // ✅ 固定スロットでも「反応」はさせる（選択解除）
                  if (fixed) {
                    setPickedSlot(null);
                    setActiveExtraId(null);
                    return;
                  }

                  // 1回目タップ：選択
                  if (pickedSlot === null) {
                    setPickedSlot(slotIdx);
                  } else {
                    // 2回目タップ：swap
                    swapSlots(pickedSlot, slotIdx);
                    setPickedSlot(null);
                  }

                  // 追加リングなら編集対象にする
                  if (entry?.kind === "extra") setActiveExtraId(entry.id);
                }}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  width: smallSize,
                  height: smallSize,
                  borderRadius: 999,
                  border: fixed
                    ? "1px solid #e5e5e5"
                    : isPicked
                    ? "3px solid #111"
                    : "1px solid #e5e5e5",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  overflow: "visible",
                  cursor: fixed ? "pointer" : "pointer",
                  boxShadow: achieved
                    ? "0 0 28px rgba(34,197,94,0.45)"
                    : "0 10px 25px rgba(0,0,0,0.05)",
                  zIndex: 1,
                  opacity: entry ? 1 : 0.55,
                  padding: 0,
                }}
                title={
                  fixed
                    ? "固定リング（タップで選択解除）"
                    : pickedSlot === null
                    ? "タップで選択"
                    : "タップで移動（入れ替え）"
                }
              >
                <Ring
                  size={smallSize}
                  stroke={strokeSmall}
                  outward={outwardSmall}
                  progress={progress}
                  color={color}
                />
                <div style={{ zIndex: 2 }}>
                  <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>{title}</div>
                  <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>
                    {yen(value)}円
                  </div>
                  {sub && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>{sub}</div>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ✅ 操作説明 */}
        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, textAlign: "center" }}>
          追加リング：1回目タップで選択 → 2回目タップで入れ替え（返済/貯蓄は固定・タップで選択解除）
        </div>

        {/* ✅ 追加リングボタン */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 12 }}>
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

        {/* ✅ 追加リング編集（編集内容は即 state 更新 → 上の円にも即反映） */}
        {activeExtra && (
          <div
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 12,
              background: "#fff",
              marginTop: 14,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, flex: 1 }}>編集：{activeExtra.title}</div>
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
                    updateExtraRing(activeExtra.id, { title: e.target.value.slice(0, 24) })
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
                      current: Number(e.target.value.replace(/,/g, "")) || 0,
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
                      target: Number(e.target.value.replace(/,/g, "")) || 0,
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
                    updateExtraRing(activeExtra.id, { color: e.target.value.slice(0, 16) })
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
                  ? `${(clamp01(activeExtra.current / activeExtra.target) * 100).toFixed(1)}%`
                  : "—"}
                {activeExtra.target > 0 && activeExtra.current >= activeExtra.target ? " ✅ 目標達成！" : ""}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ✅ 目標入力（3つ） */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, marginBottom: 14, marginTop: 16 }}>
        <div style={{ fontWeight: 900, marginBottom: 10 }}>目標設定（リロードしても保持）</div>

        <div style={{ display: "grid", gap: 10 }}>
          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>総資産 目標（任意）</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={targetBalanceStr}
                onChange={(e) => setTargetBalanceStr(e.target.value)}
                inputMode="numeric"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
              />
              <span style={{ opacity: 0.7 }}>円</span>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>返済総額（任意）</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={debtTotalStr}
                onChange={(e) => setDebtTotalStr(e.target.value)}
                inputMode="numeric"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
              />
              <span style={{ opacity: 0.7 }}>円</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              返済累計：{yen(repaidTotal)}円 / 残り：{yen(remainingDebt)}円
              <br />
              ※カテゴリに「返済」を含む支出を返済扱い
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>今月の貯金目標（任意）</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                value={monthlySaveTargetStr}
                onChange={(e) => setMonthlySaveTargetStr(e.target.value)}
                inputMode="numeric"
                style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
              />
              <span style={{ opacity: 0.7 }}>円</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>目標差：{yen(remainToMonthlySave)}円</div>
          </div>
        </div>
      </div>

      {/* ✅ 年間予測 */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, marginBottom: 14 }}>
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