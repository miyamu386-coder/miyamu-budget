"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
import type { Transaction } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";
import styles from "./TransactionsClient.module.css";
// ✅ リング目標（localStorage）
import RingGoalEditor from "./components/RingGoalEditor";
import { loadRingGoals, getTarget, type RingGoal } from "../lib/ringGoals";

/**
 * ✅ 長押しハンドラ（Pointer Events）
 * - onClick側で shouldIgnoreClick() を見て短押し/長押しを分岐
 */
function useLongPressHandlers(onLongPress: () => void, delay = 650) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = () => {
    clear();
    longPressedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, delay);
  };

  const onPointerUp = () => {
    clear();
  };

  const onPointerCancel = () => {
    clear();
    longPressedRef.current = false;
  };

  const shouldIgnoreClick = () => longPressedRef.current;

  return { onPointerDown, onPointerUp, onPointerCancel, shouldIgnoreClick };
}

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

/**
 * ✅ 「5万」「1.2万」「3千」「50,000」等を数値にする
 */
function parseAmountLike(input: string): number {
  if (!input) return 0;

  // 全角数字→半角
  const half = input.replace(/[０-９．]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (ch === "．") return ".";
    return String(code - 0xfee0);
  });

  // よくある単位・余計な文字を軽く掃除
  let s = half.trim().replace(/[,，\s]/g, "").replace(/円/g, "");

  // 「万」「千」対応（例: 1.2万, 5万, 3千）
  const manMatch = s.match(/^(-?\d+(?:\.\d+)?)万$/);
  if (manMatch) return Math.round(Number(manMatch[1]) * 10000);

  const senMatch = s.match(/^(-?\d+(?:\.\d+)?)千$/);
  if (senMatch) return Math.round(Number(senMatch[1]) * 1000);

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

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
  ringKey: string; // データ識別
  title: string;
  mode: RingMode;
  color: string;
  charMode?: CharaMode;
};

function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

// ✅ 安全設計：固定3 + 追加5 = 合計8
const MAX_EXTRA_RINGS = 5;

// ✅ ringKey → category に入れる
function ringCategory(ringKey: string) {
  return `ring:${ringKey}`;
}

const FIXED_DEBT_KEY = "debt";
const FIXED_SAVE_KEY = "save";
// ✅ 総資産 目標だけは「目標専用キー」
const GOAL_ASSET_KEY = "ring:asset";

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

type TxType = "income" | "expense";

// ✅ 追加リング1つ分（目標に対する割合で外周を描く）
function ExtraRingButton({
  id,
  title,
  color,
  mode,
  charMode,
  sums,
  target,
  isMobile,
  pos,
  strokeSmall,
  outwardSmall,
  onTapAdd,
  onLongPressEditRing,
}: {
  id: string;
  title: string;
  color: string;
  mode: RingMode;
  charMode?: CharaMode;
  sums: { income: number; expense: number; balance: number };
  target: number; // 目標
  isMobile: boolean;
  pos: { x: number; y: number; size: number };
  strokeSmall: number;
  outwardSmall: number;
  onTapAdd: (id: string, defaultType: TxType) => void; // ✅ タップ = 入力
  onLongPressEditRing: (id: string) => void; // ✅ 長押し = 編集
}) {
  // ※バッジ（常駐モフ/ひな）は消す仕様に変更（スッキリ優先）
  resolveChara(title, charMode);

  const valueForProgress =
    mode === "income_only" ? sums.income : mode === "expense_only" ? sums.expense : Math.max(0, sums.balance);

  const prog = target > 0 ? clamp01(valueForProgress / target) : 0;

  // ✅ shouldIgnoreClick はDOMへ渡さない！
  const lp = useLongPressHandlers(() => onLongPressEditRing(id), 650);
  const { shouldIgnoreClick, ...lpProps } = lp;

  const defaultType: TxType = mode === "income_only" ? "income" : "expense";

  return (
    <button
      type="button"
      {...lpProps}
      onClick={(e) => {
        if (shouldIgnoreClick()) {
          e.preventDefault();
          return;
        }
        onTapAdd(id, defaultType);
      }}
      style={{
        position: "absolute",
        left: "50%",
        top: "40%",
        transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
        width: pos.size,
        height: pos.size,
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
        boxShadow: "0 10px 25px rgba(0,0,0,0.05)",
        zIndex: 2,
        touchAction: "manipulation",
      }}
      title="タップ：入力 / 長押し：リング編集"
    >
      <Ring size={pos.size} stroke={strokeSmall} outward={outwardSmall} progress={prog} color={color} />

      <div style={{ zIndex: 2 }}>
        <div style={{ zIndex: 2 }}>
  <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>
    {title}
  </div>

 {(() => {
  const displayValue =
    mode === "income_only" ? sums.income :
    mode === "expense_only" ? sums.expense :
    sums.balance;

 const remain =
  target > 0
    ? Math.max(
        0,
        target -
          (mode === "expense_only"
            ? sums.expense
            : mode === "income_only"
            ? sums.income
            : sums.balance)
      )
    : 0;

const achieved =
  target > 0
    ? (mode === "expense_only"
        ? sums.expense
        : mode === "income_only"
        ? sums.income
        : sums.balance) >= target
    : false;

  return (
    <>
      <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900 }}>
        {yen(displayValue)}円
      </div>

      {target > 0 && !achieved && (
        <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
          目標まであと {yen(remain)}円
        </div>
      )}

      {target > 0 && achieved && (
        <div style={{ fontSize: 11, marginTop: 2, color: "green" }}>
          🎉 達成！
        </div>
      )}
    </>
  );
})()}

  <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>
    タップで入力 / 長押しで編集
  </div>
</div>
      </div>
    </button>
  );
}

// ✅ 保存後に「ヌッ」と出す演出（全身モフ / 全身ひな）
function SaveCharaOverlay({
  kind,
  message,
  onClose,
  isMobile,
}: {
  kind: "mofu" | "hina";
  message: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const src = kind === "mofu" ? "/mofu-main.png" : "/hina.png";

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: isMobile ? 14 : 18,
        background: "rgba(0,0,0,0.12)",
      }}
      title="タップで閉じる"
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          position: "relative",
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? 12 : 14,
          borderRadius: 18,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
          animation: "miyamuPopIn 240ms ease-out both",
          transformOrigin: "50% 100%",
        }}
      >
        <img
          src={src}
          alt={kind}
          style={{
            width: isMobile ? 140 : 180,
            height: "auto",
            filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.25))",
            animation: "miyamuNutto 520ms cubic-bezier(.2,.9,.2,1) both",
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>
            {kind === "mofu" ? "返済 保存" : "貯蓄 保存"}
          </div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, marginTop: 6, lineHeight: 1.2 }}>
            {message}
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>※タップで閉じる</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes miyamuPopIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes miyamuNutto {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

export default function TransactionsClient({ initialTransactions }: Props) {
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions ?? []);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // ✅ userKey
  const [userKey, setUserKey] = useState<string>("");

  useEffect(() => {
    try {
      const k = getOrCreateUserKey();
      setUserKey(k);
    } catch (e) {
      console.error("getOrCreateUserKey failed:", e);
      setUserKey(`fallback_${Date.now()}`);
    }
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

  // --- 月切替（UTCズレ対策でローカル日付を使う）
  const nowYm = ymdToMonthKey(todayYMD());
  const [selectedYm, setSelectedYm] = useState<string>(nowYm);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  const monthSummary = useMemo(() => calcSummary(monthTransactions), [monthTransactions]);

  // ✅ カテゴリ候補（ring:* はUI汚れるので候補からは外す）
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const t of transactions) {
      const c = (t.category ?? "").trim();
      if (!c) continue;
      if (c.startsWith("ring:")) continue;
      set.add(c);
    }
    return Array.from(set);
  }, [transactions]);

  // =========================
  // ✅ 追加リング（永続化）
  // =========================
  const extrasStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_maker_extra_rings_v5:${k}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);

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
  // ✅ 「リング別集計」
  // =========================
  const sumByCategory = useMemo(() => {
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
    const balance = s.income - s.expense;
    return { ...s, balance };
  };

  // 固定リング
  const debtSums = getRingSums(FIXED_DEBT_KEY);
  const saveSums = getRingSums(FIXED_SAVE_KEY);

  // 追加リング
  const extraComputed = useMemo(() => {
    return extraRings.map((r) => {
      const s = getRingSums(r.ringKey);
      return { ...r, sums: s };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraRings, sumByCategory]);

  // 総資産（中央）= 全リング残高の合計
  const totalAssetBalance = useMemo(() => {
    let total = 0;
    total += debtSums.balance;
    total += saveSums.balance;
    for (const r of extraComputed) total += r.sums.balance;
    return total;
  }, [debtSums.balance, saveSums.balance, extraComputed]);

  // =========================
  // ✅ 目標（ringGoals.ts）から取得
  // =========================
  const [ringGoals, setRingGoals] = useState<RingGoal[]>([]);

  useEffect(() => {
    if (!userKey) return;
    setRingGoals(loadRingGoals());
  }, [userKey]);

  const targetBalance = getTarget(ringGoals, GOAL_ASSET_KEY);
  const debtTarget = getTarget(ringGoals, ringCategory(FIXED_DEBT_KEY));
  const monthlySaveTarget = getTarget(ringGoals, ringCategory(FIXED_SAVE_KEY));

  const progressToTarget = targetBalance > 0 ? clamp01(totalAssetBalance / targetBalance) : 0;
  const remainToTarget = Math.max(0, targetBalance - totalAssetBalance);
  const balanceAchieved = targetBalance > 0 ? totalAssetBalance >= targetBalance : false;

  // 返済/貯蓄
  const repaidTotal = debtSums.expense; // 返済は支出として積まれる想定
  const debtRingProgress = debtTarget > 0 ? clamp01(repaidTotal / debtTarget) : 0;
  const debtAchieved = debtTarget > 0 ? repaidTotal >= debtTarget : false;

  const savedThisMonth = saveSums.income; // 貯蓄は収入として積まれる想定
  const saveRingProgress = monthlySaveTarget > 0 ? clamp01(savedThisMonth / monthlySaveTarget) : 0;
  const saveAchieved = monthlySaveTarget > 0 ? savedThisMonth >= monthlySaveTarget : false;

  // ✅ 返済リング表示用の「目標値」変数（← 赤線対策）
  const debtGoal = debtTarget;

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
  // ✅ コンテナ幅（配置計算に使う）
  // =========================
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [layoutW, setLayoutW] = useState(980);

  useEffect(() => {
    const el = layoutRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const w = el.getBoundingClientRect().width;
      setLayoutW(Math.max(320, Math.floor(w)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // =========================
  // ✅ サイズ
  // =========================
  const bigSize = isMobile ? 170 : 320;
  const smallSize = isMobile ? 145 : 190;

  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;

  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;

  // =========================
  // ✅ 三角配置（固定3）
  // =========================
  const tri = useMemo(() => {
    const dx = isMobile ? 120 : 210;
    const dy = isMobile ? 220 : 300;
    return { dx, dy };
  }, [isMobile]);

  // =========================
  // ✅ 目標編集モーダル（A案）
  // =========================
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalFocusCategory, setGoalFocusCategory] = useState<string | null>(null);

  const openGoalEditor = (cat: string) => {
    setGoalFocusCategory(cat);
    setGoalModalOpen(true);
  };
  const closeGoalEditor = () => {
    setGoalModalOpen(false);
    setGoalFocusCategory(null);
    // ✅ 目標を保存したあと反映（RingGoalEditorがlocalStorage更新する前提）
    setRingGoals(loadRingGoals());
  };

  // =========================
  // ✅ タップ入力（クイック入力モーダル）
  // =========================
  type QuickAddTarget =
    | { kind: "debt" }
    | { kind: "save" }
    | { kind: "extra"; id: string }
    | null;

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<QuickAddTarget>(null);
  const [quickType, setQuickType] = useState<TxType>("expense");
  const [quickAmountStr, setQuickAmountStr] = useState("");
  const [quickDate, setQuickDate] = useState(todayYMD());
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const openQuickAdd = (target: QuickAddTarget, defaultType: TxType) => {
    setQuickTarget(target);
    setQuickType(defaultType);
    setQuickAmountStr("");
    setQuickDate(todayYMD());
    setIsSavingQuick(false);
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setQuickAddOpen(false);
    setQuickTarget(null);
    setIsSavingQuick(false);
  };

  const getQuickMeta = (): { ringKey: string; title: string; mode: RingMode } | null => {
    if (!quickTarget) return null;
    if (quickTarget.kind === "debt") return { ringKey: FIXED_DEBT_KEY, title: "返済", mode: "expense_only" };
    if (quickTarget.kind === "save") return { ringKey: FIXED_SAVE_KEY, title: "貯蓄", mode: "income_only" };
    const r = extraRings.find((x) => x.id === quickTarget.id);
    if (!r) return null;
    return { ringKey: r.ringKey, title: r.title, mode: r.mode };
  };

  const createTransaction = async (payload: { type: TxType; amount: number; occurredAt: string; category: string }) => {
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

  // =========================
  // ✅ 保存演出（全身モフ/ひな ＋ 一言）
  // =========================
  const [saveOverlay, setSaveOverlay] = useState<{ kind: "mofu" | "hina"; message: string; key: number } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const pickSaveMessage = (kind: "mofu" | "hina") => {
    const mofu: string[] = ["返済OK。次いこう", "次はどうする？", "今日も前進だ。", "その調子だ。", "無理すんなよ。"];

    const hina: string[] = ["できた！", "コツコツ大事！", "積み立て成功〜！", "明るい未来！", "いい感じ！"];

    const list = kind === "mofu" ? mofu : hina;
    return list[Math.floor(Math.random() * list.length)];
  };

  const triggerSaveOverlay = (kind: "mofu" | "hina") => {
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }

    const message = pickSaveMessage(kind);
    const key = Date.now();
    setSaveOverlay({ kind, message, key });

    overlayTimerRef.current = window.setTimeout(() => {
      setSaveOverlay(null);
      overlayTimerRef.current = null;
    }, 3000);
  };

  // unmount時にタイマー掃除
  useEffect(() => {
    return () => {
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    };
  }, []);

  const saveQuickAdd = async () => {
    if (isSavingQuick) return;
    const meta = getQuickMeta();
    if (!meta) {
      alert("リング情報が見つかりませんでした");
      return;
    }

    const amount = parseAmountLike(quickAmountStr);
    if (amount <= 0) {
      alert("金額を入力してください（例: 50000 / 5万 / 1.2万）");
      return;
    }

    const type: TxType =
      meta.mode === "income_only" ? "income" : meta.mode === "expense_only" ? "expense" : quickType;

    setIsSavingQuick(true);
    try {
      const tx = await createTransaction({
        type,
        amount,
        occurredAt: quickDate,
        category: ringCategory(meta.ringKey),
      });

      setTransactions((prev) => [tx, ...prev]);
      closeQuickAdd();

      // ✅ 返済→保存＝全身モフ / 貯蓄→保存＝全身ひな
      if (meta.ringKey === FIXED_DEBT_KEY) triggerSaveOverlay("mofu");
      if (meta.ringKey === FIXED_SAVE_KEY) triggerSaveOverlay("hina");
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました（ネットワーク or API）。Vercel Logsも確認してね。");
      setIsSavingQuick(false);
    }
  };

  // =========================
  // ✅ 追加リング作成モーダル
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
    const ringKey = makeId();

    const next: ExtraRing = {
      id,
      ringKey,
      title,
      mode: createMode,
      color: "#60a5fa",
      charMode: "auto",
    };

    setExtraRings((prev) => [...prev, next]);
    setCreateOpen(false);
  };

  // =========================
  // ✅ 追加リング編集（長押し）
  // =========================
  const [extraEditId, setExtraEditId] = useState<string | null>(null);
  const [extraDraft, setExtraDraft] = useState<{ title: string; mode: RingMode }>({ title: "", mode: "both" });

  const openExtraEdit = (id: string) => {
    const r = extraRings.find((x) => x.id === id);
    if (!r) return;
    setExtraDraft({ title: r.title, mode: r.mode });
    setExtraEditId(id);
  };

  const saveExtraEdit = () => {
    if (!extraEditId) return;
    const title = String(extraDraft.title).trim().slice(0, 24) || "追加リング";
    const mode = extraDraft.mode;

    setExtraRings((prev) => prev.map((x) => (x.id === extraEditId ? { ...x, title, mode } : x)));
    setExtraEditId(null);
  };

  const removeExtraRing = () => {
    if (!extraEditId) return;
    const id = extraEditId;
    setExtraRings((prev) => prev.filter((x) => x.id !== id));
    setExtraEditId(null);
  };

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
  }, [
    totalAssetBalance,
    progressToTarget,
    monthSummary.income,
    monthSummary.expense,
    targetBalance,
    remainToTarget,
    balanceAchieved,
  ]);

  // =========================
  // ✅ List表示用：categoryを人間向けラベルにする
  // =========================
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    map.set(ringCategory(FIXED_DEBT_KEY), "返済");
    map.set(ringCategory(FIXED_SAVE_KEY), "貯蓄");
    for (const r of extraRings) {
      map.set(ringCategory(r.ringKey), r.title);
    }
    return map;
  }, [extraRings]);

  const resolveCategoryLabel = (cat: string) => {
    const c = (cat ?? "").trim();
    return categoryLabelMap.get(c) ?? c;
  };

  // Form側で「返済」「貯蓄」「追加リング名」を打った時に ring:* に変換するため
  const ringTitleResolver = useMemo(() => {
    const pairs: Array<{ title: string; category: string }> = [];
    pairs.push({ title: "返済", category: ringCategory(FIXED_DEBT_KEY) });
    pairs.push({ title: "貯蓄", category: ringCategory(FIXED_SAVE_KEY) });
    for (const r of extraRings) {
      pairs.push({ title: r.title, category: ringCategory(r.ringKey) });
    }
    return pairs;
  }, [extraRings]);

  // =========================
  // ✅ 追加リングの配置（中心周り・被りにくい角度）
  // =========================
  const extraPositions = useMemo(() => {
    const n = extraRings.length;
    if (n === 0) return [];

    const padding = isMobile ? 10 : 16;
    const available = Math.max(320, layoutW - padding * 2);

    const baseSize = smallSize;
    const size = Math.max(isMobile ? 120 : 160, Math.min(baseSize, Math.floor(available / 3)));

    // 中心からの距離
    const radiusX = isMobile ? 120 : 210;
    const radiusY = isMobile ? 210 : 300;

    // 角度（度）: 下 → 左下 → 右下 → 左上 → 右上
    const angles = [-90, -140, -40, 180, 0];

    return extraRings.slice(0, angles.length).map((r, i) => {
      const rad = (angles[i] * Math.PI) / 180;
      const x = Math.cos(rad) * radiusX;
      const y = Math.sin(rad) * radiusY;
      return { id: r.id, x, y, size };
    });
  }, [extraRings, isMobile, layoutW, smallSize]);

  // ✅ エリア高さ（スマホは少し余裕）
  const areaH = isMobile ? 820 : 860;

  // =========================
  // ✅ 固定リングの長押し
  // - 長押し：目標編集
  // - タップ：入力（返済/貯蓄のみ）
  // =========================
  const lpGoalAsset = useLongPressHandlers(() => openGoalEditor(GOAL_ASSET_KEY), 650);
  const { shouldIgnoreClick: shouldIgnoreAsset, ...lpGoalAssetProps } = lpGoalAsset;

  const lpGoalDebt = useLongPressHandlers(() => openGoalEditor(ringCategory(FIXED_DEBT_KEY)), 650);
  const { shouldIgnoreClick: shouldIgnoreDebt, ...lpGoalDebtProps } = lpGoalDebt;

  const lpGoalSave = useLongPressHandlers(() => openGoalEditor(ringCategory(FIXED_SAVE_KEY)), 650);
  const { shouldIgnoreClick: shouldIgnoreSave, ...lpGoalSaveProps } = lpGoalSave;

  return (
    <div style={{ paddingBottom: isMobile ? 24 : 0 }}>
      {/* ✅ 保存演出（全身キャラ） */}
      {saveOverlay && (
        <SaveCharaOverlay
          key={saveOverlay.key}
          kind={saveOverlay.kind}
          message={saveOverlay.message}
          isMobile={isMobile}
          onClose={() => setSaveOverlay(null)}
        />
      )}

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
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>※切替すると、その場で一覧を再取得します</div>
        </div>
      )}

      {/* ✅ 手入力フォーム（スマホは折りたたみ / PCは開く） */}
      <details
        open={!isMobile}
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
          background: "#fff",
        }}
      >
        <summary style={{ fontWeight: 900, cursor: "pointer" }}>手入力で追加（ここをタップで開く）</summary>

        <div style={{ marginTop: 12 }}>
          <TransactionForm
            editing={editing}
            categorySuggestions={categorySuggestions}
            ringTitleResolver={ringTitleResolver}
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
        </div>

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
          ※リング目標は「各リングを長押し」で編集（モーダルで開きます）
        </div>
      </details>

      {/* =========================
          ✅ 円グラフエリア（固定3＋追加）
         ========================= */}
      <div ref={layoutRef} style={{ maxWidth: 980, margin: "0 auto" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            height: areaH,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          {/* ✅ 見守りモフ：円グラフ背景に透かし常駐（サイズ/配置はここを触る） */}
          <img
            src="/mofu-watch.png"
            alt="watch mofu"
            style={{
              position: "absolute",
              left: "50%",
              top: isMobile ? "-10px" : "-40px",
              transform: "translateX(-50%)",
              width: isMobile ? 280 : 520,
              opacity: 0.5,
              pointerEvents: "none",
              zIndex: 1,
            }}
          />

          {/* 中央：総資産（長押しで目標編集） */}
          <button
            type="button"
            {...lpGoalAssetProps}
            onClick={(e) => {
              if (shouldIgnoreAsset()) {
                e.preventDefault();
                return;
              }
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
              top: "40%",
              transform: "translate(-50%, -50%)",
              overflow: "visible",
              boxShadow: centerCard.achieved
                ? "0 0 28px rgba(34,197,94,0.45)"
                : "0 10px 25px rgba(0,0,0,0.06)",
              zIndex: 3,
              touchAction: "manipulation",
              cursor: "pointer",
            }}
            title="長押し：総資産の目標を編集"
          >
            <Ring
              size={bigSize}
              stroke={strokeBig}
              outward={outwardBig}
              progress={centerCard.progress}
              color={centerCard.color}
            />

            {/* ✅ 総資産の中に「右下モフ」を置くため、ここをCSSモジュールで包む */}
            <div className={styles.assetBox} style={{ zIndex: 2, position: "relative" }}>
              <div style={{ fontSize: 16, opacity: 0.75, fontWeight: 900 }}>{centerCard.title}</div>
              <div
                style={{
                  fontSize: isMobile ? 42 : 52,
                  fontWeight: 900,
                  color: totalAssetBalance < 0 ? "#ef4444" : "#111",
                  lineHeight: 1.05,
                }}
              >
                {yen(centerCard.value)}円
              </div>

              {centerCard.sub1 && <div style={{ marginTop: 10, fontSize: 13, opacity: 0.75 }}>{centerCard.sub1}</div>}
              {centerCard.sub2 && <div style={{ marginTop: 8, fontSize: 13, opacity: 0.75 }}>{centerCard.sub2}</div>}

              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>長押しで「目標」編集</div>
              {centerCard.achieved && <div style={{ marginTop: 6, fontWeight: 900 }}>✅ 目標達成！</div>}

              {/* ✅ 総資産の右下にモフ */}
            </div>
          </button>

          {/* 左下：返済（タップで入力 / 長押しで目標編集） */}
          <button
            type="button"
            {...lpGoalDebtProps}
            onClick={(e) => {
              if (shouldIgnoreDebt()) {
                e.preventDefault();
                return;
              }
              openQuickAdd({ kind: "debt" }, "expense");
            }}
            style={{
              position: "absolute",
              left: "50%",
              top: "40%",
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
              zIndex: 3,
              touchAction: "manipulation",
            }}
            title="タップ：返済を入力 / 長押し：返済目標を編集"
          >
            <Ring
              size={smallSize}
              stroke={strokeSmall}
              outward={outwardSmall}
              progress={debtRingProgress}
              color="#d1d5db"
            />

            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>返済</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(repaidTotal)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>(累計)</div>

              {/* ✅ ここが追加箇所（赤線消える） */}
              {debtGoal > 0 && debtGoal - repaidTotal > 0 && (
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>
                  目標まであと {(debtGoal - repaidTotal).toLocaleString()}円
                </div>
              )}

              {debtGoal > 0 && debtGoal - repaidTotal <= 0 && (
                <div style={{ fontSize: 11, marginTop: 2, color: "green" }}>
                  🎉 達成！
                </div>
              )}

              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>タップで入力 / 長押しで目標編集</div>
            </div>
          </button>

          {/* 右下：貯蓄（タップで入力 / 長押しで目標編集） */}
          <button
            type="button"
            {...lpGoalSaveProps}
            onClick={(e) => {
              if (shouldIgnoreSave()) {
                e.preventDefault();
                return;
              }
              openQuickAdd({ kind: "save" }, "income");
            }}
            style={{
              position: "absolute",
              left: "50%",
              top: "40%",
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
              zIndex: 3,
              touchAction: "manipulation",
            }}
            title="タップ：貯蓄を入力 / 長押し：貯蓄目標を編集"
          >
            <Ring
              size={smallSize}
              stroke={strokeSmall}
              outward={outwardSmall}
              progress={saveRingProgress}
              color="#22c55e"
            />

            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>貯蓄</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(savedThisMonth)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>今月</div>
              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>タップで入力 / 長押しで目標編集</div>
            </div>
          </button>

          {/* ✅ 追加リング群 */}
          {extraPositions.map((p) => {
            const r = extraRings.find((x) => x.id === p.id);
            const rc = extraComputed.find((x) => x.id === p.id);
            if (!r || !rc) return null;

            const catKey = ringCategory(r.ringKey);
            const target = getTarget(ringGoals, catKey);

            return (
              <ExtraRingButton
                key={r.id}
                id={r.id}
                title={r.title}
                color={r.color}
                mode={r.mode}
                charMode={r.charMode}
                sums={rc.sums}
                target={target}
                isMobile={isMobile}
                pos={p}
                strokeSmall={strokeSmall}
                outwardSmall={outwardSmall}
                // ✅ タップ：入力（クイック入力）
                onTapAdd={(id, defaultType) => openQuickAdd({ kind: "extra", id }, defaultType)}
                // ✅ 長押し：編集
                onLongPressEditRing={(id) => openExtraEdit(id)}
              />
            );
          })}
        </div>

        {/* ✅ 追加リングボタン */}
        <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
          <button
            type="button"
            onClick={openCreate}
            disabled={!canAddExtra}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ccc",
              background: canAddExtra ? "#fff" : "#f3f4f6",
              cursor: canAddExtra ? "pointer" : "not-allowed",
              fontWeight: 900,
              fontSize: 14,
              width: "min(360px, 96vw)",
            }}
          >
            ＋ 追加リング（残り {Math.max(0, MAX_EXTRA_RINGS - extraRings.length)}）
          </button>
        </div>
      </div>

      {/* =========================
          ✅ 目標編集モーダル（A案）
         ========================= */}
      {goalModalOpen && (
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
          onClick={closeGoalEditor}
        >
          <div
            style={{
              width: "min(640px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
              リング目標を編集
              {goalFocusCategory
                ? `：${goalFocusCategory === GOAL_ASSET_KEY ? "総資産" : resolveCategoryLabel(goalFocusCategory)}`
                : ""}
            </div>

            <RingGoalEditor
              ringCategories={[
                GOAL_ASSET_KEY,
                ringCategory(FIXED_DEBT_KEY),
                ringCategory(FIXED_SAVE_KEY),
                ...extraRings.map((r) => ringCategory(r.ringKey)),
              ]}
              resolveLabel={(cat) => {
                if (cat === GOAL_ASSET_KEY) return "総資産 目標";
                return resolveCategoryLabel(cat);
              }}
            />

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
              <button
                type="button"
                onClick={closeGoalEditor}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                閉じる
              </button>
            </div>

            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
              ※この画面は「長押し」で開きます。スマホでも画面外に出ません。
            </div>
          </div>
        </div>
      )}

      {/* =========================
          ✅ クイック入力モーダル（返済/貯蓄/追加リング）
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
              const forcedType: TxType =
                mode === "income_only" ? "income" : mode === "expense_only" ? "expense" : quickType;

              return (
                <>
                  <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>入力：{meta.title}</div>

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
                        inputMode="text"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          fontSize: 16,
                          marginTop: 6,
                        }}
                        placeholder="例) 50000 / 5万 / 1.2万"
                      />
                    </label>

                    <div style={{ fontSize: 11, opacity: 0.6 }}>
                      保存すると「{forcedType === "income" ? "収入" : "支出"}」として追加されます。<br />
                      category は自動で {ringCategory(meta.ringKey)} になります
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                    <button
                      type="button"
                      onClick={saveQuickAdd}
                      disabled={isSavingQuick}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #111",
                        background: "#111",
                        color: "#fff",
                        fontWeight: 900,
                        width: 140,
                        cursor: isSavingQuick ? "not-allowed" : "pointer",
                        opacity: isSavingQuick ? 0.6 : 1,
                      }}
                    >
                      {isSavingQuick ? "保存中…" : "保存"}
                    </button>
                    <button
                      type="button"
                      onClick={closeQuickAdd}
                      disabled={isSavingQuick}
                      style={{
                        padding: "12px 14px",
                        borderRadius: 12,
                        border: "1px solid #ddd",
                        background: "#fff",
                        color: "#333",
                        fontWeight: 900,
                        width: 140,
                        cursor: isSavingQuick ? "not-allowed" : "pointer",
                        opacity: isSavingQuick ? 0.6 : 1,
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

      {/* ✅ 追加リング作成モーダル */}
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
              ※作成すると「中心の周り」に追加されます（最大 {MAX_EXTRA_RINGS} 個）
            </div>
          </div>
        </div>
      )}

      {/* ✅ 追加リング編集モーダル */}
      {extraEditId && (
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
          onClick={() => setExtraEditId(null)}
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
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>リング編集</div>

            <label style={{ fontSize: 12, opacity: 0.75 }}>
              表示名
              <input
                value={extraDraft.title}
                onChange={(e) => setExtraDraft((d) => ({ ...d, title: e.target.value }))}
                style={{
                  width: "100%",
                  padding: 12,
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  fontSize: 16,
                  marginTop: 6,
                }}
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, marginTop: 10, display: "block" }}>
              入力モード
              <select
                value={extraDraft.mode}
                onChange={(e) => setExtraDraft((d) => ({ ...d, mode: e.target.value as RingMode }))}
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

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={saveExtraEdit}
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
                onClick={() => setExtraEditId(null)}
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

              <div style={{ flex: 1 }} />

              <button
                type="button"
                onClick={removeExtraRing}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #f2b3b3",
                  color: "#b42318",
                  background: "#fff0f0",
                  fontWeight: 900,
                  width: 160,
                  cursor: "pointer",
                }}
              >
                このリングを削除
              </button>
            </div>

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>※タップは入力、長押しは編集（この画面）</div>
          </div>
        </div>
      )}

      <hr style={{ margin: "24px 0" }} />

      <TransactionList
        transactions={monthTransactions}
        onEdit={(t) => setEditing(t)}
        onDeleted={(id) => {
          setTransactions((prev) => prev.filter((t) => t.id !== id));
          if (editing?.id === id) setEditing(null);
        }}
        resolveCategoryLabel={resolveCategoryLabel}
      />
    </div>
  );
}

