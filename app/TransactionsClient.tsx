"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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

function toNum(str: string) {
  return Number(String(str ?? "").replace(/,/g, "").trim()) || 0;
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
 * charMode: 手動上書き（auto/mofu/hina/none）
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

// ✅ 自動判定 + 手動上書き
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

type EditTarget =
  | { kind: "asset" }
  | { kind: "debt" }
  | { kind: "save" }
  | { kind: "extra"; id: string; isNew?: boolean }
  | null;

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

  const targetBalance = toNum(targetBalanceStr);
  const monthlySaveTarget = toNum(monthlySaveTargetStr);
  const debtTotal = toNum(debtTotalStr);

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

  // 画面幅（切れ防止）
  const [vw, setVw] = useState<number>(0);
  useEffect(() => {
    const apply = () => setVw(window.innerWidth || 0);
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
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

  // ✅ 周囲2つ（返済/貯蓄）も入れ替えOKにするため pos を持たせる
  const [debtPos, setDebtPos] = useState<number>(0);
  const [savePos, setSavePos] = useState<number>(1);

  // ✅ 2回タップ入れ替え
  const [pickedKey, setPickedKey] = useState<string | null>(null);

  // ✅ 中央ズーム
  const [focused, setFocused] = useState<Focused>(null);

  // ✅ 編集モーダル（長押しで開く）
  const [editTarget, setEditTarget] = useState<EditTarget>(null);

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
    setPickedKey(null);
    setFocused(null);
    setEditTarget(null);
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
      charMode: "auto",
    };

    setDebtPos(nd);
    setSavePos(ns);
    setExtraRings([...normalizedExtras, next]);

    // ✅ 追加直後に「編集モーダル」を開く（保存/キャンセルが明確）
    setFocused({ kind: "extra", id: next.id });
    setEditTarget({ kind: "extra", id: next.id, isNew: true });
  };

  const removeExtraRing = (id: string) => {
    setExtraRings((prev) => prev.filter((x) => x.id !== id));
    setPickedKey(null);
    if (focused?.kind === "extra" && focused.id === id) setFocused(null);
  };

  // ✅ 周囲リングリスト（空きは出さない）
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
  // ✅ サイズ（増えたら中央を少し小さく）+ 周囲半径調整（切れ防止）
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

  // まず「理想の半径」
  const orbitRadiusIdeal = useMemo(() => {
    const base = isMobile ? 180 : 300;
    return base + Math.max(0, orbitCount - 4) * (isMobile ? 10 : 12);
  }, [isMobile, orbitCount]);

  // 切れないように上限を作る（画面幅から逆算）
  const orbitRadius = useMemo(() => {
    const containerW = Math.min(980, vw || 980);
    const maxR = Math.max(120, containerW / 2 - smallSize / 2 - 14); // 14=余白
    return Math.min(orbitRadiusIdeal, maxR);
  }, [orbitRadiusIdeal, vw, smallSize]);

  // 高さも半径に合わせて可変
  const stageH = useMemo(() => {
    const base = isMobile ? 720 : 840;
    const needed = bigSize / 2 + orbitRadius + smallSize / 2 + 40;
    return Math.max(base, Math.ceil(needed));
  }, [isMobile, bigSize, orbitRadius, smallSize]);

  // =========================
  // ✅ 中央表示（focusedがあれば差し替え）
  // =========================
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

  // =========================
  // ✅ 長押し(0.8s) 判定（短押しと排他）
  // =========================
  function useLongPress() {
    const timerRef = useRef<number | null>(null);
    const longPressedRef = useRef(false);

    const clear = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };

    const start = (onLong: () => void) => {
      clear();
      longPressedRef.current = false;
      timerRef.current = window.setTimeout(() => {
        longPressedRef.current = true;
        onLong();
      }, 800);
    };

    const end = (onShort: () => void) => {
      const wasLong = longPressedRef.current;
      clear();
      if (!wasLong) onShort();
      longPressedRef.current = false;
    };

    const cancel = () => {
      clear();
      longPressedRef.current = false;
    };

    return { start, end, cancel };
  }

  const lp = useLongPress();

  // =========================
  // ✅ 編集モーダル：draft
  // =========================
  const [draftGoal, setDraftGoal] = useState<{ targetBalanceStr: string; debtTotalStr: string; monthlySaveTargetStr: string }>(
    { targetBalanceStr, debtTotalStr, monthlySaveTargetStr }
  );

  const [draftExtra, setDraftExtra] = useState<{
    title: string;
    currentStr: string;
    targetStr: string;
    color: string;
    charMode: CharaMode;
  } | null>(null);

  // editTargetが変わったらdraftを作る
  useEffect(() => {
    if (!editTarget) {
      setDraftExtra(null);
      setDraftGoal({ targetBalanceStr, debtTotalStr, monthlySaveTargetStr });
      return;
    }

    if (editTarget.kind === "asset" || editTarget.kind === "debt" || editTarget.kind === "save") {
      setDraftGoal({ targetBalanceStr, debtTotalStr, monthlySaveTargetStr });
      setDraftExtra(null);
      return;
    }

    const r = extraRings.find((x) => x.id === editTarget.id);
    setDraftExtra({
      title: r?.title ?? "追加リング",
      currentStr: String(r?.current ?? 0),
      targetStr: String(r?.target ?? 0),
      color: r?.color ?? "#60a5fa",
      charMode: (r?.charMode ?? "auto") as CharaMode,
    });
  }, [editTarget, extraRings, targetBalanceStr, debtTotalStr, monthlySaveTargetStr]);

  const closeEdit = (opts?: { cancelNew?: boolean }) => {
    // 追加直後のキャンセルなら消す
    if (opts?.cancelNew && editTarget?.kind === "extra" && editTarget.isNew) {
      removeExtraRing(editTarget.id);
    }
    setEditTarget(null);
  };

  const saveEdit = () => {
    if (!editTarget) return;

    if (editTarget.kind === "asset") {
      setTargetBalanceStr(draftGoal.targetBalanceStr);
      setEditTarget(null);
      return;
    }
    if (editTarget.kind === "debt") {
      setDebtTotalStr(draftGoal.debtTotalStr);
      setEditTarget(null);
      return;
    }
    if (editTarget.kind === "save") {
      setMonthlySaveTargetStr(draftGoal.monthlySaveTargetStr);
      setEditTarget(null);
      return;
    }

    // extra
    if (editTarget.kind === "extra" && draftExtra) {
      const nextTitle = (draftExtra.title ?? "").slice(0, 24);
      setExtraRings((prev) =>
        prev.map((x) =>
          x.id === editTarget.id
            ? {
                ...x,
                title: nextTitle || x.title,
                current: toNum(draftExtra.currentStr),
                target: toNum(draftExtra.targetStr),
                color: (draftExtra.color || "#60a5fa").slice(0, 16),
                charMode: (draftExtra.charMode ?? "auto") as CharaMode,
              }
            : x
        )
      );
      setEditTarget(null);
    }
  };

  // =========================
  // ✅ UI
  // =========================
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
          ✅ 中央：総資産（or ズーム内容） / 周囲：返済・貯蓄・追加リング
          ✅ タップ入れ替え：2回タップでswap
          ✅ 長押し(0.8秒)：編集モーダル（保存/キャンセル）
         ========================= */}
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: stageH,
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

          {/* 中央リング（短押し: 総資産へ / 長押し: 総資産目標を編集） */}
          <button
            type="button"
            onPointerDown={() => lp.start(() => setEditTarget({ kind: "asset" }))}
            onPointerUp={() =>
              lp.end(() => {
                setFocused({ kind: "asset" });
              })
            }
            onPointerCancel={lp.cancel}
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
              touchAction: "manipulation",
            }}
            title="短押し：総資産へ / 長押し：編集"
          >
            <Ring
              size={bigSize}
              stroke={strokeBig}
              outward={outwardBig}
              progress={centerCard.progress}
              color={centerCard.color}
            />

            {/* ✅ 総資産はモフ固定（アイコンは後ででOK） */}
            {/* <CharaBadge kind="mofu" /> */}

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

          {/* 周囲リング */}
          {orbitItems.map((item, idx) => {
            const count = orbitItems.length;

            // ✅ 常に上スタート（横並びに見えにくくする）
            const deg = -90 + (360 / count) * idx;
            const rad = (deg * Math.PI) / 180;

            const x = Math.cos(rad) * orbitRadius;
            const y = Math.sin(rad) * orbitRadius;

            let title = "";
            let value = 0;
            let progress = 0;
            let color = "#f3f4f6";
            let sub = "";
            let achieved = false;

            // ✅ キャラ種別（今は後回しOK）
            let chara: "mofu" | "hina" | null = null;

            if (item.kind === "debt") {
              title = "返済";
              value = repaidTotal;
              progress = debtRingProgress;
              color = "#d1d5db";
              sub = "(累計)";
              achieved = debtAchieved;
              chara = "mofu";
            } else if (item.kind === "save") {
              title = "貯蓄";
              value = savedThisMonth;
              progress = saveRingProgress;
              color = "#22c55e";
              sub = "今月";
              achieved = saveAchieved;
              chara = "hina";
            } else {
              const r = extraRings.find((x) => x.id === item.id);
              title = r?.title ?? "追加";
              value = r?.current ?? 0;
              progress = r && r.target > 0 ? clamp01(r.current / r.target) : 0;
              color = r?.color ?? "#60a5fa";
              achieved = r && r.target > 0 ? r.current >= r.target : false;

              const resolved = resolveChara(title, r?.charMode);
              chara = resolved === "mofu" ? "mofu" : resolved === "hina" ? "hina" : null;
            }

            const isPicked = pickedKey === item.key;

            const openEditForItem = () => {
              if (item.kind === "debt") setEditTarget({ kind: "debt" });
              else if (item.kind === "save") setEditTarget({ kind: "save" });
              else setEditTarget({ kind: "extra", id: item.id });
            };

            const shortPressForItem = () => {
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
            };

            return (
              <button
                key={item.key}
                type="button"
                onPointerDown={() => lp.start(openEditForItem)}
                onPointerUp={() => lp.end(shortPressForItem)}
                onPointerCancel={lp.cancel}
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
                  touchAction: "manipulation",
                }}
                title="短押し：ズーム/入れ替え  長押し：編集"
              >
                <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={progress} color={color} />

                {/* ✅ キャラバッジ（後でONにしてOK）
                    {chara && <CharaBadge kind={chara} />} */}

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
          位置変更：リングを「1回目タップで選択」→「2回目タップで入れ替え」／ 編集：リングを長押し（0.8秒）
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
      </div>

      {/* ✅ 編集モーダル（常駐表示しない） */}
      {editTarget && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 14,
          }}
          onClick={() => closeEdit({ cancelNew: true })}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              background: "#fff",
              borderRadius: 14,
              border: "1px solid rgba(0,0,0,0.08)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              padding: 14,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ fontWeight: 900, fontSize: 16, flex: 1 }}>
                {editTarget.kind === "asset"
                  ? "編集：総資産"
                  : editTarget.kind === "debt"
                  ? "編集：返済"
                  : editTarget.kind === "save"
                  ? "編集：貯蓄"
                  : "編集：追加リング"}
              </div>
              <button
                type="button"
                onClick={() => closeEdit({ cancelNew: true })}
                style={{
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                閉じる
              </button>
            </div>

            <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
              {/* 固定リング */}
              {(editTarget.kind === "asset" || editTarget.kind === "debt" || editTarget.kind === "save") && (
                <>
                  {editTarget.kind === "asset" && (
                    <label style={{ fontSize: 12, opacity: 0.8 }}>
                      総資産 目標
                      <input
                        value={draftGoal.targetBalanceStr}
                        onChange={(e) => setDraftGoal((p) => ({ ...p, targetBalanceStr: e.target.value }))}
                        inputMode="numeric"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
                        目標まであと：{yen(Math.max(0, toNum(draftGoal.targetBalanceStr) - summary.balance))}円
                      </div>
                    </label>
                  )}

                  {editTarget.kind === "debt" && (
                    <label style={{ fontSize: 12, opacity: 0.8 }}>
                      返済総額（目標）
                      <input
                        value={draftGoal.debtTotalStr}
                        onChange={(e) => setDraftGoal((p) => ({ ...p, debtTotalStr: e.target.value }))}
                        inputMode="numeric"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
                        返済累計：{yen(repaidTotal)}円 / 残り：{yen(Math.max(0, toNum(draftGoal.debtTotalStr) - repaidTotal))}円
                      </div>
                    </label>
                  )}

                  {editTarget.kind === "save" && (
                    <label style={{ fontSize: 12, opacity: 0.8 }}>
                      今月の貯金目標
                      <input
                        value={draftGoal.monthlySaveTargetStr}
                        onChange={(e) => setDraftGoal((p) => ({ ...p, monthlySaveTargetStr: e.target.value }))}
                        inputMode="numeric"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #ccc",
                          marginTop: 6,
                        }}
                      />
                      <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
                        目標差：{yen(Math.max(0, toNum(draftGoal.monthlySaveTargetStr) - summary.balance))}円
                      </div>
                    </label>
                  )}
                </>
              )}

              {/* 追加リング */}
              {editTarget.kind === "extra" && draftExtra && (
                <>
                  <label style={{ fontSize: 12, opacity: 0.8 }}>
                    タイトル
                    <input
                      value={draftExtra.title}
                      onChange={(e) => setDraftExtra((p) => (p ? { ...p, title: e.target.value } : p))}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        marginTop: 6,
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 12, opacity: 0.8 }}>
                    現在値（手入力）
                    <input
                      value={draftExtra.currentStr}
                      onChange={(e) => setDraftExtra((p) => (p ? { ...p, currentStr: e.target.value } : p))}
                      inputMode="numeric"
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        marginTop: 6,
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 12, opacity: 0.8 }}>
                    目標値
                    <input
                      value={draftExtra.targetStr}
                      onChange={(e) => setDraftExtra((p) => (p ? { ...p, targetStr: e.target.value } : p))}
                      inputMode="numeric"
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        marginTop: 6,
                      }}
                    />
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
                      目標まであと：{yen(Math.max(0, toNum(draftExtra.targetStr) - toNum(draftExtra.currentStr)))}円
                    </div>
                  </label>

                  <label style={{ fontSize: 12, opacity: 0.8 }}>
                    リング色（HEX）
                    <input
                      value={draftExtra.color}
                      onChange={(e) => setDraftExtra((p) => (p ? { ...p, color: e.target.value } : p))}
                      style={{
                        width: "100%",
                        padding: 12,
                        borderRadius: 10,
                        border: "1px solid #ccc",
                        marginTop: 6,
                      }}
                    />
                  </label>

                  <label style={{ fontSize: 12, opacity: 0.8 }}>
                    キャラ（後で反映でもOK）
                    <select
                      value={(draftExtra.charMode ?? "auto") as CharaMode}
                      onChange={(e) => setDraftExtra((p) => (p ? { ...p, charMode: e.target.value as CharaMode } : p))}
                      style={{
                        width: "100%",
                        padding: 12,
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
                    <div style={{ marginTop: 6, fontSize: 11, opacity: 0.65 }}>
                      自動判定：銀行/返済系→モフ、投資/積立系→ひな（タイトルに含まれる単語で判定）
                    </div>
                  </label>

                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => {
                        if (editTarget.kind === "extra") {
                          const ok = confirm("この追加リングを削除しますか？");
                          if (ok) {
                            removeExtraRing(editTarget.id);
                            setEditTarget(null);
                          }
                        }
                      }}
                      style={{
                        padding: "10px 12px",
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
                </>
              )}

              {/* footer */}
              <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => closeEdit({ cancelNew: true })}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ccc",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={saveEdit}
                  style={{
                    flex: 1,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  保存
                </button>
              </div>

              <div style={{ fontSize: 11, opacity: 0.6 }}>
                ※保存すると、この端末の localStorage に反映されます（リロードしても保持）
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ✅ 年間予測（ざっくり） */}
      <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, marginBottom: 14, marginTop: 16 }}>
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
            background: dangerLevel === "danger" ? "#fff0f0" : dangerLevel === "warning" ? "#fff7ed" : "#f0fff4",
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