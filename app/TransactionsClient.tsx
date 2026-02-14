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
  return (n || 0).toLocaleString("ja-JP");
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
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

type CharaMode = "auto" | "mofu" | "hina" | "none";
type RingMode = "both" | "income_only" | "expense_only";

type ExtraRing = {
  id: string; // UI用
  ringKey: string; // ✅ データ識別（B案）
  title: string;
  mode: RingMode;
  color: string;
  charMode?: CharaMode;
};

function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

const MAX_EXTRA_RINGS = 8;

// =========================
// ✅ ringKey → category に入れる（B案）
// =========================
function ringCategory(ringKey: string) {
  return `ring:${ringKey}`;
}

const FIXED_DEBT_KEY = "debt";
const FIXED_SAVE_KEY = "save";

function pickCharaAuto(title: string): Exclude<CharaMode, "auto"> {
  const t = (title ?? "").toLowerCase();

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
  // ✅ 今は chibi を使う
  const src = kind === "mofu" ? "/icons/mofu-chibi.png" : "/icons/hina-chibi.png";
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

// ✅ 長押し（iOS優先で touch も拾う）
function useLongPress(onLongPress: () => void, ms = 650) {
  const timer = useRef<number | null>(null);
  const fired = useRef(false);

  const clear = () => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
  };

  const start = () => {
    fired.current = false;
    clear();
    timer.current = window.setTimeout(() => {
      fired.current = true;
      onLongPress();
    }, ms);
  };

  const end = () => clear();

  // クリック等の誤反応を抑える（長押し後のclickを無視したい時に使う）
  const shouldIgnoreClick = () => fired.current;

  return {
    onPointerDown: start,
    onPointerUp: end,
    onPointerCancel: end,
    onPointerLeave: end,
    onTouchStart: start,
    onTouchEnd: end,
    onTouchCancel: end,
    shouldIgnoreClick,
  };
}

// =========================
// ✅ 長押し入力モーダル
// =========================
type QuickAddTarget =
  | { kind: "debt" }
  | { kind: "save" }
  | { kind: "extra"; id: string }
  | null;

type TxType = "income" | "expense";

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

  // ✅ 全体サマリ（履歴表示や中央のサブ情報に使う）
  const monthSummary = useMemo(() => calcSummary(monthTransactions), [monthTransactions]);

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
  //    ※いまは「目標」は残す（中央の達成表示用）
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

  // =========================
  // ✅ 追加リング（タブ + 永続化）
  // =========================
  const extrasStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v4:${k}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);
  const [activeTab, setActiveTab] = useState<{ kind: "debt" | "save" | "extra"; id?: string }>({ kind: "debt" });

  useEffect(() => {
    if (!userKey) return;
    try {
      const raw = localStorage.getItem(extrasStorageKey);
      if (!raw) return;
      const arr = JSON.parse(raw) as ExtraRing[];
      if (!Array.isArray(arr)) return;

      const fixed = arr
        .filter((x) => x && typeof x.id === "string")
        .slice(0, MAX_EXTRA_RINGS)
        .map((x) => ({
          id: x.id,
          ringKey: typeof x.ringKey === "string" ? x.ringKey : x.id, // 旧データ救済
          title: String(x.title ?? "追加リング"),
          mode: (x.mode ?? "both") as RingMode,
          color: x.color || "#60a5fa",
          charMode: (x.charMode ?? "auto") as CharaMode,
        }));

      setExtraRings(fixed);

      // タブがextraを指してるのに消えてたら戻す
      setActiveTab((cur) => {
        if (cur.kind !== "extra") return cur;
        const exists = fixed.some((r) => r.id === cur.id);
        return exists ? cur : { kind: "debt" };
      });
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

  // =========================
  // ✅ 「リング別集計」(B案)
  // =========================
  const sumByCategory = useMemo(() => {
    // monthTransactions を category ごとに合算
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of monthTransactions) {
      const cat = (t.category ?? "").trim();
      if (!cat) continue;
      const cur = map.get(cat) ?? { income: 0, expense: 0 };
      if (t.type === "income") cur.income += t.amount;
      else cur.expense += t.amount;
      map.set(cat, cur);
    }
    return map;
  }, [monthTransactions]);

  const getRingSums = (ringKey: string) => {
    const cat = ringCategory(ringKey);
    const s = sumByCategory.get(cat) ?? { income: 0, expense: 0 };
    const balance = s.income - s.expense; // ✅ ①ルール
    return { ...s, balance };
  };

  // 固定リング
  const debtSums = getRingSums(FIXED_DEBT_KEY); // expense_only想定
  const saveSums = getRingSums(FIXED_SAVE_KEY); // income_only想定

  // 追加リング
  const extraSums = useMemo(() => {
    return extraRings.map((r) => {
      const s = getRingSums(r.ringKey);
      return { id: r.id, ringKey: r.ringKey, title: r.title, mode: r.mode, color: r.color, charMode: r.charMode, sums: s };
    });
  }, [extraRings, sumByCategory]); // eslint-disable-line react-hooks/exhaustive-deps

  // 総資産（中央）= 全リング残高の合計
  const totalAssetBalance = useMemo(() => {
    let total = 0;
    total += debtSums.balance;
    total += saveSums.balance;
    for (const r of extraSums) total += r.sums.balance;
    return total;
  }, [debtSums.balance, saveSums.balance, extraSums]);

  // 進捗（中央は目標に対して、返済は累計支出、貯蓄は累計収入）
  const progressToTarget = targetBalance > 0 ? clamp01(totalAssetBalance / targetBalance) : 0;
  const remainToTarget = Math.max(0, targetBalance - totalAssetBalance);
  const balanceAchieved = targetBalance > 0 ? totalAssetBalance >= targetBalance : false;

  const repaidTotal = debtSums.expense; // ✅ 返済は支出だけ見せる
  const remainingDebt = Math.max(0, debtTotal - repaidTotal);
  const debtRingProgress = debtTotal > 0 ? clamp01(remainingDebt / debtTotal) : 0;
  const debtAchieved = debtTotal > 0 ? repaidTotal >= debtTotal : false;

  const savedThisMonth = saveSums.income; // ✅ 貯蓄は収入だけ見せる
  const remainToMonthlySave = Math.max(0, monthlySaveTarget - savedThisMonth);
  const saveRingProgress = monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;
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
  // ✅ サイズ（あなたの最新版のまま）
  // =========================
  const baseBig = isMobile ? 180 : 360;
  const bigSize = baseBig;
  const smallSize = isMobile ? 150 : 190;

  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;

  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;

  // =========================
  // ✅ 三角配置（中央＋左右下）
  // =========================
  const tri = useMemo(() => {
    const dx = isMobile ? 125 : 210;
    const dy = isMobile ? 235 : 310;
    return { dx, dy };
  }, [isMobile]);

  // =========================
  // ✅ 長押し：金額入力（B案）
  // =========================
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<QuickAddTarget>(null);
  const [quickType, setQuickType] = useState<TxType>("expense");
  const [quickAmountStr, setQuickAmountStr] = useState("");
  const [quickDate, setQuickDate] = useState(todayYMD());

  const openQuickAdd = (target: QuickAddTarget, defaultType: TxType) => {
    setQuickTarget(target);
    setQuickType(defaultType);
    setQuickAmountStr("");
    setQuickDate(todayYMD());
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setQuickAddOpen(false);
    setQuickTarget(null);
  };

  const getQuickMeta = (): { ringKey: string; title: string; mode: RingMode } | null => {
    if (!quickTarget) return null;
    if (quickTarget.kind === "debt") return { ringKey: FIXED_DEBT_KEY, title: "返済", mode: "expense_only" };
    if (quickTarget.kind === "save") return { ringKey: FIXED_SAVE_KEY, title: "貯蓄", mode: "income_only" };
    const r = extraRings.find((x) => x.id === quickTarget.id);
    if (!r) return null;
    return { ringKey: r.ringKey, title: r.title, mode: r.mode };
  };

  const createTransaction = async (payload: {
    type: TxType;
    amount: number;
    occurredAt: string;
    category: string;
  }) => {
    const res = await fetch("/api/transactions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-user-key": userKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(JSON.stringify(data ?? { error: "POST failed" }));
    return data as Transaction;
  };

  const saveQuickAdd = async () => {
    const meta = getQuickMeta();
    if (!meta) {
      alert("リング情報が見つかりませんでした");
      return;
    }

    const amount = Number(String(quickAmountStr).replace(/,/g, "").trim()) || 0;
    if (amount <= 0) {
      alert("金額を入力してください");
      return;
    }

    // モード制限
    if (meta.mode === "income_only") setQuickType("income");
    if (meta.mode === "expense_only") setQuickType("expense");

    const type: TxType =
      meta.mode === "income_only" ? "income" : meta.mode === "expense_only" ? "expense" : quickType;

    try {
      const tx = await createTransaction({
        type,
        amount,
        occurredAt: quickDate,
        category: ringCategory(meta.ringKey), // ✅ B案：ringId を category に入れる
      });

      // 追加 → 即反映
      setTransactions((prev) => [tx, ...prev]);
      closeQuickAdd();
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました（ネットワーク or API）。Vercel Logsも確認してね。");
    }
  };

  // =========================
  // ✅ 追加リング作成（タブ）
  // =========================
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("生活費");
  const [createMode, setCreateMode] = useState<RingMode>("both");

  const openCreate = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }
    setCreateTitle("生活費");
    setCreateMode("both");
    setCreateOpen(true);
  };

  const saveCreate = () => {
    if (!canAddExtra) return;

    const title = String(createTitle).trim().slice(0, 24) || "追加リング";
    const id = makeId();
    const ringKey = makeId(); // ✅ データ識別用（表示名変更しても崩れない）

    const next: ExtraRing = {
      id,
      ringKey,
      title,
      mode: createMode,
      color: "#60a5fa",
      charMode: "auto",
    };

    setExtraRings((prev) => [...prev, next]);
    setActiveTab({ kind: "extra", id: next.id });
    setCreateOpen(false);
  };

  const removeExtraRing = (id: string) => {
    setExtraRings((prev) => prev.filter((x) => x.id !== id));
    setActiveTab((cur) => {
      if (cur.kind !== "extra") return cur;
      if (cur.id !== id) return cur;
      return { kind: "debt" };
    });
  };

  // =========================
  // ✅ 固定3つ：長押し割り当て
  // - 中央：目標編集（今は維持）
  // - 返済：支出入力
  // - 貯蓄：収入入力
  // =========================
  type FixedEditKind = "asset" | "save" | "debt" | null;
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

  const lpAsset = useLongPress(() => openFixedEdit("asset"));
  const lpDebt = useLongPress(() => openQuickAdd({ kind: "debt" }, "expense"));
  const lpSave = useLongPress(() => openQuickAdd({ kind: "save" }, "income"));

  // =========================
  // ✅ 中央カード（総資産）
  // =========================
  const centerCard = useMemo(() => {
    return {
      title: "総資産",
      value: totalAssetBalance,
      progress: progressToTarget,
      color: "#9ca3af",
      sub1: `収入 ${yen(monthSummary.income)} / 支出 ${yen(monthSummary.expense)}`,
      sub2: targetBalance > 0 ? `目標まであと ${yen(remainToTarget)}円` : "",
      achieved: balanceAchieved,
    };
  }, [totalAssetBalance, progressToTarget, monthSummary.income, monthSummary.expense, targetBalance, remainToTarget, balanceAchieved]);

  // =========================
  // ✅ タブ（固定2 + 追加）
  // =========================
  const tabs = useMemo(() => {
    const base: Array<{ key: string; label: string; kind: "debt" | "save" | "extra"; id?: string; badge?: "mofu" | "hina" | null }> =
      [
        { key: "debt", label: "返済", kind: "debt", badge: "mofu" },
        { key: "save", label: "貯蓄", kind: "save", badge: "hina" },
      ];

    for (const r of extraRings) {
      const resolved = resolveChara(r.title, r.charMode);
      const badge = resolved === "mofu" ? "mofu" : resolved === "hina" ? "hina" : null;
      base.push({ key: r.id, label: r.title, kind: "extra", id: r.id, badge });
    }
    return base;
  }, [extraRings]);

  const activeExtra = useMemo(() => {
    if (activeTab.kind !== "extra") return null;
    return extraRings.find((x) => x.id === activeTab.id) ?? null;
  }, [activeTab, extraRings]);

  const activeExtraComputed = useMemo(() => {
    if (!activeExtra) return null;
    return extraSums.find((x) => x.id === activeExtra.id) ?? null;
  }, [activeExtra, extraSums]);

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
          ✅ 三角配置（固定）
          - 左下：返済（長押しで支出入力）
          - 中央：総資産（長押しで目標編集）
          - 右下：貯蓄（長押しで収入入力）
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
          {/* 中央リング（総資産） */}
          <button
            type="button"
            {...lpAsset}
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
              top: "42%",
              transform: "translate(-50%, -50%)",
              overflow: "visible",
              boxShadow: centerCard.achieved ? "0 0 28px rgba(34,197,94,0.45)" : "0 10px 25px rgba(0,0,0,0.06)",
              zIndex: 2,
              cursor: "pointer",
              touchAction: "manipulation",
            }}
            title="長押し：目標編集"
            onClick={(e) => {
              if (lpAsset.shouldIgnoreClick()) e.preventDefault();
            }}
          >
            <Ring size={bigSize} stroke={strokeBig} outward={outwardBig} progress={centerCard.progress} color={centerCard.color} />
            <CharaBadge kind="mofu" />

            <div style={{ zIndex: 2, position: "relative" }}>
              <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 900 }}>{centerCard.title}</div>
              <div
                style={{
                  fontSize: isMobile ? 44 : 54,
                  fontWeight: 900,
                  color: totalAssetBalance < 0 ? "#ef4444" : "#111",
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

          {/* 左下：返済（expenseのみ入力） */}
          <button
            type="button"
            {...lpDebt}
            style={{
              position: "absolute",
              left: "50%",
              top: "42%",
              transform: `translate(calc(-50% - ${tri.dx}px), calc(-50% + ${tri.dy}px))`,
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
              boxShadow: debtAchieved ? "0 0 28px rgba(34,197,94,0.45)" : "0 10px 25px rgba(0,0,0,0.05)",
              zIndex: 2,
              touchAction: "manipulation",
            }}
            title="長押し：返済を入力（支出のみ）"
            onClick={(e) => {
              if (lpDebt.shouldIgnoreClick()) e.preventDefault();
            }}
          >
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={debtRingProgress} color="#d1d5db" />
            <CharaBadge kind="mofu" />
            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>返済</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(repaidTotal)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>(累計)</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>長押しで「返済（支出）」入力</div>
            </div>
          </button>

          {/* 右下：貯蓄（incomeのみ入力） */}
          <button
            type="button"
            {...lpSave}
            style={{
              position: "absolute",
              left: "50%",
              top: "42%",
              transform: `translate(calc(-50% + ${tri.dx}px), calc(-50% + ${tri.dy}px))`,
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
              boxShadow: saveAchieved ? "0 0 28px rgba(34,197,94,0.45)" : "0 10px 25px rgba(0,0,0,0.05)",
              zIndex: 2,
              touchAction: "manipulation",
            }}
            title="長押し：貯蓄を入力（収入のみ）"
            onClick={(e) => {
              if (lpSave.shouldIgnoreClick()) e.preventDefault();
            }}
          >
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={saveRingProgress} color="#22c55e" />
            <CharaBadge kind="hina" />
            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>貯蓄</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(savedThisMonth)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>今月</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>長押しで「貯蓄（収入）」入力</div>
            </div>
          </button>
        </div>

        {/* ✅ タブ + 追加リングボタン */}
        <div style={{ marginTop: 8 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            {tabs.map((t) => {
              const isActive =
                (t.kind === "debt" && activeTab.kind === "debt") ||
                (t.kind === "save" && activeTab.kind === "save") ||
                (t.kind === "extra" && activeTab.kind === "extra" && activeTab.id === t.id);

              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.kind === "extra" ? { kind: "extra", id: t.id } : { kind: t.kind })}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 999,
                    border: isActive ? "2px solid #111" : "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    fontSize: 13,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  {t.badge === "mofu" ? "🐾" : t.badge === "hina" ? "🌱" : "➕"}
                  {t.label}
                </button>
              );
            })}

            <div style={{ flex: 1 }} />

            <button
              type="button"
              onClick={openCreate}
              disabled={!canAddExtra}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ccc",
                background: canAddExtra ? "#fff" : "#f3f4f6",
                cursor: canAddExtra ? "pointer" : "not-allowed",
                fontWeight: 900,
                fontSize: 13,
              }}
            >
              ＋ 追加リング
            </button>
          </div>

          {/* ✅ タブ内容（追加リングのみ編集） */}
          {activeTab.kind === "extra" && activeExtra && activeExtraComputed && (
            <div style={{ marginTop: 12, border: "1px solid #eee", borderRadius: 12, padding: 12, background: "#fff" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontWeight: 900, flex: 1 }}>リング：{activeExtra.title}</div>
                <button
                  type="button"
                  onClick={() => openQuickAdd({ kind: "extra", id: activeExtra.id }, activeExtra.mode === "expense_only" ? "expense" : "income")}
                  style={{
                    padding: "8px 10px",
                    borderRadius: 10,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  長押し不要で入力
                </button>
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
                  表示名（後から変えてOK：データは ringId で保持）
                  <input
                    value={activeExtra.title}
                    onChange={(e) =>
                      setExtraRings((prev) => prev.map((x) => (x.id === activeExtra.id ? { ...x, title: e.target.value.slice(0, 24) } : x)))
                    }
                    style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #ccc", marginTop: 6 }}
                  />
                </label>

                <label style={{ fontSize: 12, opacity: 0.75 }}>
                  入力モード
                  <select
                    value={activeExtra.mode}
                    onChange={(e) =>
                      setExtraRings((prev) => prev.map((x) => (x.id === activeExtra.id ? { ...x, mode: e.target.value as RingMode } : x)))
                    }
                    style={{
                      width: "100%",
                      padding: 10,
                      borderRadius: 10,
                      border: "1px solid #ccc",
                      marginTop: 6,
                      background: "#fff",
                    }}
                  >
                    <option value="both">収入/支出（両方）</option>
                    <option value="income_only">収入のみ</option>
                    <option value="expense_only">支出のみ</option>
                  </select>
                </label>

                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  今月：収入 {yen(activeExtraComputed.sums.income)} / 支出 {yen(activeExtraComputed.sums.expense)} / 残高 {yen(activeExtraComputed.sums.balance)}
                </div>

                <div style={{ fontSize: 11, opacity: 0.6 }}>
                  ※このリングのデータは category = {ringCategory(activeExtra.ringKey)} に保存されます（B案）
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* =========================
          ✅ 長押し入力モーダル（返済/貯蓄/追加リング）
         ========================= */}
      {quickAddOpen && (
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
          onClick={closeQuickAdd}
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
            {(() => {
              const meta = getQuickMeta();
              if (!meta) return null;

              const mode = meta.mode;
              const showTabs = mode === "both";
              const forcedType: TxType = mode === "income_only" ? "income" : mode === "expense_only" ? "expense" : quickType;

              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
                    入力：{meta.title}
                  </div>

                  {showTabs && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                      <button
                        type="button"
                        onClick={() => setQuickType("expense")}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: quickType === "expense" ? "2px solid #111" : "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                          flex: 1,
                        }}
                      >
                        支出
                      </button>
                      <button
                        type="button"
                        onClick={() => setQuickType("income")}
                        style={{
                          padding: "10px 14px",
                          borderRadius: 12,
                          border: quickType === "income" ? "2px solid #111" : "1px solid #ddd",
                          background: "#fff",
                          cursor: "pointer",
                          fontWeight: 900,
                          flex: 1,
                        }}
                      >
                        収入
                      </button>
                    </div>
                  )}

                  {!showTabs && (
                    <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
                      {mode === "income_only" ? "このリングは「収入のみ」入力です" : "このリングは「支出のみ」入力です"}
                    </div>
                  )}

                  <div style={{ display: "grid", gap: 10 }}>
                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      発生日
                      <input
                        value={quickDate}
                        onChange={(e) => setQuickDate(e.target.value)}
                        type="date"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          fontSize: 14,
                          marginTop: 6,
                        }}
                      />
                    </label>

                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      金額（円）
                      <input
                        value={quickAmountStr}
                        onChange={(e) => setQuickAmountStr(e.target.value)}
                        inputMode="numeric"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          fontSize: 16,
                          marginTop: 6,
                        }}
                        placeholder="例) 1200"
                      />
                    </label>

                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      保存すると「{forcedType === "income" ? "収入" : "支出"}」として追加されます。
                      <br />
                      category は自動で {ringCategory(meta.ringKey)} になります（B案）
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={saveQuickAdd}
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
                      onClick={closeQuickAdd}
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
                </>
              );
            })()}
          </div>
        </div>
      )}

      {/* =========================
          ✅ 追加リング作成モーダル
         ========================= */}
      {createOpen && (
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
          onClick={() => setCreateOpen(false)}
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
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>追加リングを作る</div>

            <label style={{ fontSize: 12, opacity: 0.75 }}>
              リング名
              <input
                value={createTitle}
                onChange={(e) => setCreateTitle(e.target.value)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontSize: 16,
                  marginTop: 6,
                }}
                placeholder="例）生活費 / 第一銀行 / 投資"
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, marginTop: 10, display: "block" }}>
              入力モード
              <select
                value={createMode}
                onChange={(e) => setCreateMode(e.target.value as RingMode)}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontSize: 14,
                  marginTop: 6,
                  background: "#fff",
                }}
              >
                <option value="both">収入/支出（両方）</option>
                <option value="income_only">収入のみ</option>
                <option value="expense_only">支出のみ</option>
              </select>
            </label>

            <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
              <button
                type="button"
                onClick={saveCreate}
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
                作成
              </button>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
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

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
              ※作成すると tab に追加されます。データは ringId（ringKey）で保持します（B案）
            </div>
          </div>
        </div>
      )}

      {/* ✅ 固定3つの目標編集モーダル（中央長押し） */}
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
          </div>
        </div>
      )}

      {/* ✅ 目標入力（3つ）※今は残す（いらなければ後で消す） */}
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
              ※返済リング（ring:{FIXED_DEBT_KEY}）の支出合計
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
            <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>
              ※貯蓄リング（ring:{FIXED_SAVE_KEY}）の収入合計
            </div>
          </div>
        </div>
      </div>

      {/* ✅ 入力フォーム（残す：必要なら手入力も可能） */}
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