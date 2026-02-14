"use client";

import { useEffect, useMemo, useState, useRef } from "react";
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
 * charMode: ② 手動上書き（auto/mofu/hina/none）
 * ========================= */
type CharaMode = "auto" | "mofu" | "hina" | "none";

type ExtraRing = {
  id: string;
  title: string;
  current: number;
  target: number;
  color: string;
  offsetDeg?: number;
  pos?: number;
  charMode?: CharaMode;
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

// ✅ ②：自動判定 + 手動上書き
function pickCharaAuto(title: string): Exclude<CharaMode, "auto"> {
  const t = (title ?? "").toLowerCase();

  // モフ（守る/支払い/銀行）
  const mofuWords = [
    "銀行",
    "口座",
    "振込",
    "引落",
    "引き落とし",
    "返済",
    "ローン",
    "クレカ",
    "カード",
    "支出",
    "固定費",
    "家賃",
    "保険",
    "税",
    "年金",
  ];

  // ひな（増やす/育てる）
  const hinaWords = ["投資", "nisa", "ニーサ", "株", "積立", "つみたて", "資産", "運用", "配当"];

  if (mofuWords.some((w) => t.includes(w))) return "mofu";
  if (hinaWords.some((w) => t.includes(w))) return "hina";
  return "none";
}

function resolveChara(title: string, mode?: CharaMode): Exclude<CharaMode, "auto"> {
  if (mode === "mofu" || mode === "hina" || mode === "none") return mode;
  return pickCharaAuto(title);
}

function CharaBadge({ kind }: { kind: "mofu" | "hina" }) {
  const src = kind === "mofu" ? "/icons/mofu-mini.png" : "/icons/hina-mini.png";
  return (
    <img
      src={src}
      alt={kind}
      style={{
        position: "absolute",
        right: -6,
        top: -6,
        width: 42,
        height: 42,
        borderRadius: 999,
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(0,0,0,0.06)",
        boxShadow: "0 8px 18px rgba(0,0,0,0.08)",
        pointerEvents: "none",
      }}
    />
  );
}

// ✅ 長押し（スマホ対応）
function useLongPress(onLongPress: () => void, ms = 650) {
  const timer = useRef<number | null>(null);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const onPointerDown = () => {
    clear();
    timer.current = window.setTimeout(() => {
      onLongPress();
    }, ms);
  };

  const onPointerUp = () => clear();
  const onPointerCancel = () => clear();
  const onPointerLeave = () => clear();

  return { onPointerDown, onPointerUp, onPointerCancel, onPointerLeave };
}

type FixedEditKind = "asset" | "save" | "debt" | null;

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
  // ✅ 追加リング + レイアウト永続化
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

  // ✅ 中央ズーム（今回は触らない：長押し編集を優先）
  const [focused, setFocused] = useState<Focused>(null);

  // ✅ 固定リング長押し編集モーダル
  const [fixedEdit, setFixedEdit] = useState<FixedEditKind>(null);
  const [fixedDraft, setFixedDraft] = useState<{ value: string }>({ value: "" });

  const openFixedEdit = (kind: Exclude<FixedEditKind, null>) => {
    if (kind === "asset") setFixedDraft({ value: targetBalanceStr });
    if (kind === "save") setFixedDraft({ value: monthlySaveTargetStr });
    if (kind === "debt") setFixedDraft({ value: debtTotalStr });
    setFixedEdit(kind);
  };

  const saveFixedEdit = () => {
    if (!fixedEdit) return;
    const v = fixedDraft.value;
    if (fixedEdit === "asset") setTargetBalanceStr(v);
    if (fixedEdit === "save") setMonthlySaveTargetStr(v);
    if (fixedEdit === "debt") setDebtTotalStr(v);
    setFixedEdit(null);
  };

  const closeFixedEdit = () => setFixedEdit(null);

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
              charMode: (x.charMode ?? "auto") as CharaMode,
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
    if (ld === ls) ls = norm(ls + 1);

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

  useEffect(() => {
    if (!userKey) return;
    try {
      localStorage.setItem(extrasStorageKey, JSON.stringify(extraRings));
    } catch (e) {
      console.warn("extra rings save failed", e);
    }
  }, [userKey, extrasStorageKey, extraRings]);

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

    const nextCount = 2 + (extraRings.length + 1);
    const norm = (p: number) => ((Math.round(p) % nextCount) + nextCount) % nextCount;

    const nd = norm(debtPos);
    const ns = norm(savePos);

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
      charMode: "auto",
    };

    setDebtPos(nd);
    setSavePos(ns);
    setExtraRings([...normalizedExtras, next]);
    setActiveExtraId(next.id);

    // 追加リングは「後で」長押し編集に寄せるので、いまはズーム維持でOK
    setFocused(null);
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
    items.sort((a, b) => a.pos - b.pos);
    return items;
  }, [debtPos, savePos, extraRings]);

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

    if (aKey === "debt") setDebtPos(pb);
    else if (aKey === "save") setSavePos(pb);
    else setExtraRings((prev) => prev.map((r) => (r.id === aKey ? { ...r, pos: pb } : r)));

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
    // ちょい広め（狭い問題の対策）
    const base = isMobile ? 205 : 315;
    return base + Math.max(0, orbitCount - 4) * (isMobile ? 12 : 14);
  }, [isMobile, orbitCount]);

  // ✅ 中央カード（総資産固定表示：三角配置優先）
  const centerCard = useMemo(() => {
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
  }, [
    summary.balance,
    summary.income,
    summary.expense,
    balanceRingProgress,
    targetBalance,
    remainToTarget,
    balanceAchieved,
  ]);

  // ✅ 長押しハンドラ（固定3つ）
  const lpAsset = useLongPress(() => openFixedEdit("asset"));
  const lpDebt = useLongPress(() => openFixedEdit("debt"));
  const lpSave = useLongPress(() => openFixedEdit("save"));

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
          ✅ 三角配置固定：
          - 中央：総資産（長押しで目標編集）
          - 上：返済（長押しで返済総額編集）
          - 下：貯蓄（長押しで今月目標編集）
          追加リングは周囲に並ぶ（必要なら後で）
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
          {/* 中央リング（総資産） */}
          <button
            type="button"
            {...lpAsset}
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
              zIndex: 2,
              cursor: "pointer",
            }}
            title="タップ：中央表示 / 長押し：目標編集"
          >
            <Ring size={bigSize} stroke={strokeBig} outward={outwardBig} progress={centerCard.progress} color={centerCard.color} />

            {/* ここはあとでイラスト。今は維持 */}
            <CharaBadge kind="mofu" />

            <div style={{ zIndex: 2, position: "relative" }}>
              <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 900 }}>{centerCard.title}</div>
              <div
                style={{
                  fontSize: isMobile ? 44 : 54,
                  fontWeight: 900,
                  color: summary.balance < 0 ? "#ef4444" : "#111",
                  lineHeight: 1.05,
                }}
              >
                {yen(centerCard.value)}円
              </div>

              {centerCard.sub1 && <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>{centerCard.sub1}</div>}
              {centerCard.sub2 && <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{centerCard.sub2}</div>}

              {centerCard.achieved && <div style={{ marginTop: 10, fontWeight: 900 }}>✅ 目標達成！</div>}

              <div style={{ marginTop: 8, fontSize: 11, opacity: 0.55 }}>長押しで「総資産 目標」を編集</div>
            </div>
          </button>

          {/* 上：返済（固定位置） */}
          <button
            type="button"
            {...lpDebt}
            onClick={() => setFocused({ kind: "debt" })}
            style={{
              position: "absolute",
              left: "50%",
              top: isMobile ? 70 : 90,
              transform: "translateX(-50%)",
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
              overflow: "visible",
              cursor: "pointer",
              boxShadow: debtAchieved
                ? "0 0 28px rgba(34,197,94,0.45)"
                : "0 10px 25px rgba(0,0,0,0.05)",
              zIndex: 2,
            }}
            title="タップ：表示 / 長押し：返済総額編集"
          >
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={debtRingProgress} color="#d1d5db" />
            <CharaBadge kind="mofu" />
            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>返済</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(repaidTotal)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>(累計)</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>長押しで「返済総額」編集</div>
            </div>
          </button>

          {/* 下：貯蓄（固定位置） */}
          <button
            type="button"
            {...lpSave}
            onClick={() => setFocused({ kind: "save" })}
            style={{
              position: "absolute",
              left: "50%",
              bottom: isMobile ? 55 : 85,
              transform: "translateX(-50%)",
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
              overflow: "visible",
              cursor: "pointer",
              boxShadow: saveAchieved
                ? "0 0 28px rgba(34,197,94,0.45)"
                : "0 10px 25px rgba(0,0,0,0.05)",
              zIndex: 2,
            }}
            title="タップ：表示 / 長押し：今月貯金目標編集"
          >
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={saveRingProgress} color="#22c55e" />
            <CharaBadge kind="hina" />
            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>貯蓄</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(savedThisMonth)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>今月</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>長押しで「今月目標」編集</div>
            </div>
          </button>

          {/* 追加リング（周囲）…今回は“優先度低”なので表示だけ維持 */}
          {orbitItems
            .filter((x) => x.kind === "extra")
            .map((item, idx) => {
              const count = Math.max(1, orbitItems.filter((x) => x.kind === "extra").length);
              const deg = -90 + (360 / count) * idx;
              const rad = (deg * Math.PI) / 180;

              const x = Math.cos(rad) * orbitRadius;
              const y = Math.sin(rad) * orbitRadius;

              const r = extraRings.find((z) => z.id === (item as any).id);
              const title = r?.title ?? "追加";
              const value = r?.current ?? 0;
              const progress = r && r.target > 0 ? clamp01(r.current / r.target) : 0;
              const color = r?.color ?? "#60a5fa";

              const resolved = resolveChara(title, r?.charMode);
              const chara = resolved === "mofu" ? "mofu" : resolved === "hina" ? "hina" : null;

              const isPicked = pickedKey === item.key;

              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    if (pickedKey === null) setPickedKey(item.key);
                    else {
                      swapByKey(pickedKey, item.key);
                      setPickedKey(null);
                    }
                    setActiveExtraId((item as any).id);
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
                    boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
                    zIndex: 1,
                  }}
                >
                  <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={progress} color={color} />
                  {chara && <CharaBadge kind={chara} />}
                  <div style={{ zIndex: 2 }}>
                    <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>{title}</div>
                    <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(value)}円</div>
                  </div>
                </button>
              );
            })}
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

        {/* 追加リング編集（既存のまま：今回は触らない） */}
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
                キャラ（追加リング）
                <select
                  value={(activeExtra.charMode ?? "auto") as CharaMode}
                  onChange={(e) => updateExtraRing(activeExtra.id, { charMode: e.target.value as CharaMode })}
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    marginTop: 6,
                    background: "#fff",
                  }}
                >
                  <option value="auto">自動（タイトルで判定）</option>
                  <option value="mofu">モフ（固定）</option>
                  <option value="hina">ひな（固定）</option>
                  <option value="none">表示しない</option>
                </select>
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
            </div>
          </div>
        )}
      </div>

      {/* ✅ 固定3つの長押し編集モーダル */}
      {fixedEdit && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
            zIndex: 9999,
          }}
          onClick={closeFixedEdit}
        >
          <div
            style={{
              width: "min(520px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
              {fixedEdit === "asset" ? "総資産 目標" : fixedEdit === "save" ? "今月の貯金目標" : "返済総額"}
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>円（数字）</div>
            <input
              value={fixedDraft.value}
              onChange={(e) => setFixedDraft({ value: e.target.value })}
              inputMode="numeric"
              style={{
                width: "100%",
                padding: 12,
                borderRadius: 12,
                border: "1px solid #ddd",
                fontSize: 16,
              }}
              placeholder="例) 200000"
            />

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={saveFixedEdit}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  width: 140,
                  cursor: "pointer",
                }}
              >
                保存
              </button>
              <button
                type="button"
                onClick={closeFixedEdit}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#333",
                  fontWeight: 900,
                  width: 140,
                  cursor: "pointer",
                }}
              >
                キャンセル
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>
              ※保存すると下部の「目標設定」と同じ値が更新され、リング表示も即反映されます
            </div>
          </div>
        </div>
      )}

      {/* ✅ 目標入力（3つ） ※いまは残す。後で“この枠いらない”なら削除してOK */}
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