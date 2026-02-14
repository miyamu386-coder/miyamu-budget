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
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
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
 * pos: 周囲リングの並び位置（入れ替え保持）
 * ========================= */
type ExtraRing = {
  id: string;
  title: string;
  current: number;
  target: number;
  color: string;
  offsetDeg?: number;
  pos?: number;
};

type Focused =
  | { kind: "asset" }
  | { kind: "debt" }
  | { kind: "save" }
  | { kind: "extra"; id: string }
  | null;

function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

const MAX_EXTRA_RINGS = 8;

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions ?? []);
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
  const progressMonthlySave = monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;

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
  // ✅ 追加リング + レイアウト永続化（初期3→追加で増える）
  // =========================
  const extrasStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v3:${k}`;
  }, [userKey]);

  const layoutStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_ring_layout_v1:${k}`; // debtPos/savePos + extras pos
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);
  const [activeExtraId, setActiveExtraId] = useState<string | null>(null);

  // ✅ 周囲2つ（返済/貯蓄）も入れ替えOKにするため pos を持たせる
  const [debtPos, setDebtPos] = useState<number>(0);
  const [savePos, setSavePos] = useState<number>(1);

  // ✅ 2回タップ入れ替え
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  // ✅ 中央ズーム
  const [focused, setFocused] = useState<Focused>(null);

  // 次の空きpos（表示してる個数=2+extrasCount の範囲で）
  const findNextFreePos = (dPos: number, sPos: number, rings: ExtraRing[], count: number) => {
    const used = new Set<number>([dPos, sPos]);
    for (const r of rings) if (typeof r.pos === "number") used.add(r.pos);

    for (let i = 0; i < count + 5; i++) {
      const p = i % count;
      if (!used.has(p)) return p;
    }
    return 0;
  };

  // ✅ 初回ロード（extras + layout）
  useEffect(() => {
    if (!userKey) return;

    let loadedExtras: ExtraRing[] = [];
    try {
      const raw = localStorage.getItem(extrasStorageKey);
      if (raw) {
        const arr = JSON.parse(raw) as ExtraRing[];
        if (Array.isArray(arr)) {
          loadedExtras = arr
            .filter((x) => x && typeof x.id === "string")
            .slice(0, MAX_EXTRA_RINGS)
            .map((x) => ({
              ...x,
              current: Number(x.current) || 0,
              target: Number(x.target) || 0,
              color: x.color || "#60a5fa",
            }));
        }
      }
    } catch (e) {
      console.warn("extra rings load failed", e);
    }

    let ld = 0;
    let ls = 1;
    try {
      const raw2 = localStorage.getItem(layoutStorageKey);
      if (raw2) {
        const obj = JSON.parse(raw2) as { debtPos?: number; savePos?: number };
        if (typeof obj.debtPos === "number") ld = obj.debtPos;
        if (typeof obj.savePos === "number") ls = obj.savePos;
      }
    } catch (e) {
      console.warn("layout load failed", e);
    }

    const count = 2 + loadedExtras.length;
    const norm = (p: number) => ((Math.round(p) % count) + count) % count;

    ld = norm(ld);
    ls = norm(ls);

    // debt/save が被ったら救済
    if (ld === ls) ls = norm(ls + 1);

    // extras のpos救済（重複も直す）
    const used = new Set<number>([ld, ls]);
    const fixedExtras = loadedExtras.map((r) => {
      let p = typeof r.pos === "number" ? norm(r.pos) : -1;
      if (p < 0 || used.has(p)) {
        p = findNextFreePos(ld, ls, loadedExtras, count);
      }
      used.add(p);
      return { ...r, pos: p };
    });

    setDebtPos(ld);
    setSavePos(ls);
    setExtraRings(fixedExtras);
    setActiveExtraId((cur) => cur ?? fixedExtras[0]?.id ?? null);
    setPickedKey(null);
    setFocused(null);
  }, [userKey, extrasStorageKey, layoutStorageKey]);

  // ✅ 保存（extras）
  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(extrasStorageKey, JSON.stringify(extraRings));
    } catch (e) {
      console.warn("extra rings save failed", e);
    }
  }, [userKey, extrasStorageKey, extraRings]);

  // ✅ 保存（layout）
  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(layoutStorageKey, JSON.stringify({ debtPos, savePos }));
    } catch (e) {
      console.warn("layout save failed", e);
    }
  }, [userKey, layoutStorageKey, debtPos, savePos]);

  const canAddExtra = extraRings.length < MAX_EXTRA_RINGS;

  const addExtraRing = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }

    // ✅ 追加後の表示数
    const nextCount = 2 + (extraRings.length + 1);
    const norm = (p: number) => ((Math.round(p) % nextCount) + nextCount) % nextCount;

    const nd = norm(debtPos);
    const ns = norm(savePos);

    // 既存extrasもnextCountに合わせて軽く補正
    const normalizedExtras = extraRings.map((r) => ({
      ...r,
      pos: typeof r.pos === "number" ? norm(r.pos) : r.pos,
    }));

    const pos = findNextFreePos(nd, ns, normalizedExtras, nextCount);

    const n = normalizedExtras.length + 1;
    const next: ExtraRing = {
      id: makeId(),
      title: `追加リング${n}`,
      current: 0,
      target: 100000,
      color: "#60a5fa",
      offsetDeg: -90,
      pos,
    };

    setDebtPos(nd);
    setSavePos(ns);
    setExtraRings([...normalizedExtras, next]);
    setActiveExtraId(next.id);

    // ✅ 追加したら中央ズームして編集しやすく
    setFocused({ kind: "extra", id: next.id });
  };

  const removeExtraRing = (id: string) => {
    setExtraRings((prev) => prev.filter((x) => x.id !== id));
    setActiveExtraId((cur) => (cur === id ? null : cur));
    setPickedKey(null);
    if (focused?.kind === "extra" && focused.id === id) setFocused(null);
  };

  const updateExtraRing = (id: string, patch: Partial<ExtraRing>) => {
    setExtraRings((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const activeExtra = useMemo(() => {
    if (!activeExtraId) return null;
    return extraRings.find((x) => x.id === activeExtraId) ?? null;
  }, [extraRings, activeExtraId]);

  // ✅ 周囲リングリスト（空きは出さない → 初期は返済/貯蓄の2個だけ、追加で増える）
  type OrbitItem =
    | { key: "debt"; kind: "debt"; pos: number }
    | { key: "save"; kind: "save"; pos: number }
    | { key: string; kind: "extra"; id: string; pos: number };

  const orbitItems: OrbitItem[] = useMemo(() => {
    const items: OrbitItem[] = [
      { key: "debt", kind: "debt", pos: debtPos },
      { key: "save", kind: "save", pos: savePos },
    ];

    for (const r of extraRings) {
      items.push({ key: r.id, kind: "extra", id: r.id, pos: typeof r.pos === "number" ? r.pos : 9999 });
    }

    // pos順（時計回り）
    items.sort((a, b) => a.pos - b.pos);
    return items;
  }, [debtPos, savePos, extraRings]);

  // ✅ 2回タップ入れ替え（返済/貯蓄/追加 全部OK）
  const swapByKey = (aKey: string, bKey: string) => {
    if (aKey === bKey) return;

    const getPos = (k: string) => {
      if (k === "debt") return debtPos;
      if (k === "save") return savePos;
      const r = extraRings.find((x) => x.id === k);
      return typeof r?.pos === "number" ? r.pos : null;
    };

    const pa = getPos(aKey);
    const pb = getPos(bKey);
    if (pa === null || pb === null) return;

    // A
    if (aKey === "debt") setDebtPos(pb);
    else if (aKey === "save") setSavePos(pb);
    else setExtraRings((prev) => prev.map((r) => (r.id === aKey ? { ...r, pos: pb } : r)));

    // B
    if (bKey === "debt") setDebtPos(pa);
    else if (bKey === "save") setSavePos(pa);
    else setExtraRings((prev) => prev.map((r) => (r.id === bKey ? { ...r, pos: pa } : r)));
  };

  // =========================
  // ✅ サイズ（増えたら中央を少し小さく）+ 周囲半径調整
  // =========================
  const orbitCount = orbitItems.length; // 2..10
  const baseBig = isMobile ? 260 : 360;

  const centerScale = useMemo(() => {
    if (!isMobile) return 1;
    if (orbitCount >= 8) return 0.78;
    if (orbitCount >= 6) return 0.85;
    if (orbitCount >= 5) return 0.9;
    return 1;
  }, [isMobile, orbitCount]);

  const bigSize = Math.round(baseBig * centerScale);
  const smallSize = isMobile ? 150 : 190;

  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;

  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;

  const orbitRadius = useMemo(() => {
    const base = isMobile ? 180 : 300;
    return base + Math.max(0, orbitCount - 4) * (isMobile ? 10 : 12);
  }, [isMobile, orbitCount]);

  // ✅ 中央表示（focusedがあれば差し替え）
  const centerCard = useMemo(() => {
    if (!focused || focused.kind === "asset") {
      return {
        title: "総資産",
        value: summary.balance,
        progress: balanceRingProgress,
        color: "#9ca3af",
        sub1: `収入 ${yen(summary.income)} / 支出 ${yen(summary.expense)}`,
        sub2: targetBalance > 0 ? `目標まであと ${yen(remainToTarget)}円` : "",
        achieved: balanceAchieved,
        kind: "asset" as const,
      };
    }

    if (focused.kind === "debt") {
      return {
        title: "返済",
        value: repaidTotal,
        progress: debtRingProgress,
        color: "#d1d5db",
        sub1: "(累計)",
        sub2: debtTotal > 0 ? `残り総額 ${yen(remainingDebt)}円` : "",
        achieved: debtAchieved,
        kind: "debt" as const,
      };
    }

    if (focused.kind === "save") {
      return {
        title: "貯蓄",
        value: savedThisMonth,
        progress: saveRingProgress,
        color: "#22c55e",
        sub1: "今月",
        sub2: monthlySaveTarget > 0 ? `目標差 ${yen(remainToMonthlySave)}円` : "",
        achieved: saveAchieved,
        kind: "save" as const,
      };
    }

    const r = extraRings.find((x) => x.id === focused.id);
    return {
      title: r?.title ?? "追加リング",
      value: r?.current ?? 0,
      progress: r && r.target > 0 ? clamp01(r.current / r.target) : 0,
      color: r?.color ?? "#60a5fa",
      sub1: r && r.target > 0 ? `目標まであと ${yen(Math.max(0, r.target - r.current))}円` : "",
      sub2: "",
      achieved: r && r.target > 0 ? r.current >= r.target : false,
      kind: "extra" as const,
    };
  }, [
    focused,
    summary.balance,
    summary.income,
    summary.expense,
    balanceRingProgress,
    targetBalance,
    remainToTarget,
    balanceAchieved,
    repaidTotal,
    debtRingProgress,
    debtTotal,
    remainingDebt,
    debtAchieved,
    savedThisMonth,
    saveRingProgress,
    monthlySaveTarget,
    remainToMonthlySave,
    saveAchieved,
    extraRings,
  ]);

  // focusedがextraなら編集対象も合わせる
  useEffect(() => {
    if (focused?.kind === "extra") setActiveExtraId(focused.id);
    if (focused?.kind === "asset") setActiveExtraId(null);
    if (focused?.kind === "debt") setActiveExtraId(null);
    if (focused?.kind === "save") setActiveExtraId(null);
  }, [focused]);

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
          ✅ 中央：総資産（or ズーム内容） / 周囲：返済・貯蓄・追加リング（追加で1つずつ増える）
          ✅ タップ入れ替え：2回タップでswap
          ✅ タップズーム：タップしたリングを中央表示
         ========================= */}
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: isMobile ? 760 : 860,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* ズーム中の背景クリックで戻る */}
          {focused && focused.kind !== "asset" && (
            <button
              type="button"
              onClick={() => setFocused(null)}
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(0,0,0,0.04)",
                border: "none",
                cursor: "pointer",
                zIndex: 3,
              }}
              aria-label="close focus"
            />
          )}

          {/* 中央リング */}
          <button
            type="button"
            onClick={() => setFocused({ kind: "asset" })}
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
              boxShadow: centerCard.achieved
                ? "0 0 28px rgba(34,197,94,0.45)"
                : "0 10px 25px rgba(0,0,0,0.06)",
              zIndex: focused ? 4 : 2,
              cursor: "pointer",
            }}
            title="タップで総資産に戻す"
          >
            <Ring
              size={bigSize}
              stroke={strokeBig}
              outward={outwardBig}
              progress={centerCard.progress}
              color={centerCard.color}
            />
            <div style={{ zIndex: 2, position: "relative" }}>
              <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 900 }}>{centerCard.title}</div>
              <div
                style={{
                  fontSize: isMobile ? 44 : 54,
                  fontWeight: 900,
                  color: centerCard.kind === "asset" && summary.balance < 0 ? "#ef4444" : "#111",
                  lineHeight: 1.05,
                }}
              >
                {yen(centerCard.value)}円
              </div>

              {centerCard.sub1 && <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>{centerCard.sub1}</div>}
              {centerCard.sub2 && <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{centerCard.sub2}</div>}

              {centerCard.achieved && <div style={{ marginTop: 10, fontWeight: 900 }}>✅ 目標達成！</div>}
            </div>
          </button>

          {/* 周囲リング（表示分だけ） */}
          {orbitItems.map((item, idx) => {
            const count = orbitItems.length;

            // ✅ ここが変更点：初期(スマホ)は三角っぽく、増えたら通常円形へ
            let deg: number;

            if (isMobile && count === 2) {
              // 周囲2個：上(-90) と 右下(30)（左下を空けて“三角感”）
              const triangle2 = [-90, 30];
              deg = triangle2[idx] ?? (-90 + (360 / count) * idx);
            } else if (isMobile && count === 3) {
              // 周囲3個：上(-90)・右下(30)・左下(210)
              const triangle3 = [-90, 30, 210];
              deg = triangle3[idx] ?? (-90 + (360 / count) * idx);
            } else {
              // それ以外：通常の円形（上スタート）
              deg = -90 + (360 / count) * idx;
            }

            const rad = (deg * Math.PI) / 180;

            const x = Math.cos(rad) * orbitRadius;
            const y = Math.sin(rad) * orbitRadius;

            let title = "";
            let value = 0;
            let progress = 0;
            let color = "#f3f4f6";
            let sub = "";
            let achieved = false;

            if (item.kind === "debt") {
              title = "返済";
              value = repaidTotal;
              progress = debtRingProgress;
              color = "#d1d5db";
              sub = "(累計)";
              achieved = debtAchieved;
            } else if (item.kind === "save") {
              title = "貯蓄";
              value = savedThisMonth;
              progress = saveRingProgress;
              color = "#22c55e";
              sub = "今月";
              achieved = saveAchieved;
            } else {
              const r = extraRings.find((x) => x.id === item.id);
              title = r?.title ?? "追加";
              value = r?.current ?? 0;
              progress = r && r.target > 0 ? clamp01(r.current / r.target) : 0;
              color = r?.color ?? "#60a5fa";
              achieved = r && r.target > 0 ? r.current >= r.target : false;
            }

            const isPicked = pickedKey === item.key;

            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  // ✅ まずズーム
                  if (item.kind === "debt") setFocused({ kind: "debt" });
                  else if (item.kind === "save") setFocused({ kind: "save" });
                  else setFocused({ kind: "extra", id: item.id });

                  // ✅ 入れ替え（2回タップ）
                  if (pickedKey === null) {
                    setPickedKey(item.key);
                  } else {
                    swapByKey(pickedKey, item.key);
                    setPickedKey(null);
                  }

                  // ✅ 編集対象（追加リングのみ）
                  if (item.kind === "extra") setActiveExtraId(item.id);
                  else setActiveExtraId(null);
                }}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`,
                  width: smallSize,
                  height: smallSize,
                  borderRadius: 999,
                  border: isPicked ? "3px solid #111" : "1px solid #e5e5e5",
                  background: "#fff",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  textAlign: "center",
                  overflow: "visible",
                  cursor: "pointer",
                  boxShadow: achieved
                    ? "0 0 28px rgba(34,197,94,0.45)"
                    : "0 10px 25px rgba(0,0,0,0.05)",
                  zIndex: 2,
                }}
                title={pickedKey === null ? "タップで選択→次をタップで入れ替え" : "タップで入れ替え"}
              >
                <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={progress} color={color} />
                <div style={{ zIndex: 2 }}>
                  <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>{title}</div>
                  <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(value)}円</div>
                  {sub && <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>{sub}</div>}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.7, textAlign: "center" }}>
          位置変更：リングを「1回目タップで選択」→「2回目タップで入れ替え」／ 表示：タップしたリングは中央ズーム
        </div>

        {/* 追加ボタン */}
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

        {/* 追加リング編集（ズーム中でも編集可能） */}
        {activeExtra && (
          <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff", marginTop: 14 }}>
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
                  onChange={(e) => updateExtraRing(activeExtra.id, { title: e.target.value.slice(0, 24) })}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 12, opacity: 0.75 }}>
                現在値（手入力）
                <input
                  value={String(activeExtra.current)}
                  inputMode="numeric"
                  onChange={(e) =>
                    updateExtraRing(activeExtra.id, { current: Number(e.target.value.replace(/,/g, "")) || 0 })
                  }
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 12, opacity: 0.75 }}>
                目標値
                <input
                  value={String(activeExtra.target)}
                  inputMode="numeric"
                  onChange={(e) =>
                    updateExtraRing(activeExtra.id, { target: Number(e.target.value.replace(/,/g, "")) || 0 })
                  }
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
                />
              </label>

              <label style={{ fontSize: 12, opacity: 0.75 }}>
                リング色（HEX）
                <input
                  value={activeExtra.color}
                  onChange={(e) => updateExtraRing(activeExtra.id, { color: e.target.value.slice(0, 16) })}
                  style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
                />
              </label>

              <div style={{ fontSize: 12, opacity: 0.75 }}>
                進捗：{" "}
                {activeExtra.target > 0
                  ? `${(clamp01(activeExtra.current / activeExtra.target) * 100).toFixed(1)}%`
                  : "—"}
                {activeExtra.target > 0 && activeExtra.current >= activeExtra.target ? " ✅ 目標達成！" : ""}
              </div>

              <button
                type="button"
                onClick={() => setFocused(null)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                ズーム解除（戻る）
              </button>
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
              dangerLevel === "danger" ? "#fff0f0" : dangerLevel === "warning" ? "#fff7ed" : "#f0fff4",
            color: dangerLevel === "danger" ? "#b42318" : dangerLevel === "warning" ? "#9a3412" : "#166534",
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