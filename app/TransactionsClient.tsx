"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
import type { Transaction } from "./types";
import { getOrCreateUserKey, clearUserKeyCache, getUserKeyName, setUserKeyName } from "../lib/userKey";
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

  const onPointerUp = () => clear();

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

function endOfMonthYMD(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
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

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function addMonthsDate(base: Date, monthsToAdd: number) {
  const d = new Date(base);
  const day = d.getDate();
  d.setMonth(d.getMonth() + monthsToAdd);
  // 月末吸収（例: 1/31 + 1ヶ月 がズレる対策）
  if (d.getDate() < day) d.setDate(0);
  return d;
}

function formatYMDDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${dd}`;
}

function calcRepayment(params: {
  totalDebt: number; // 借入総額（リング目標）
  repaidTotal: number; // 返済済み累計（リングのexpense累計）
  monthlyPayment: number; // 今月返済（または平均）
  asOf?: Date; // 基準日
}) {
  const asOf = params.asOf ?? new Date();
  const totalDebt = Math.max(0, params.totalDebt);
  const repaidTotal = Math.max(0, params.repaidTotal);
  const monthlyPayment = Math.max(0, params.monthlyPayment);

  const remaining = Math.max(0, totalDebt - repaidTotal);
  const progressPct = totalDebt > 0 ? clamp((repaidTotal / totalDebt) * 100, 0, 100) : 0;

  if (totalDebt <= 0) {
    return {
      progressPct,
      remaining,
      months: null as number | null,
      payoffDate: null as Date | null,
      message: "目標（借入総額）が未設定です",
    };
  }

  if (remaining === 0) {
    return {
      progressPct: 100,
      remaining: 0,
      months: 0,
      payoffDate: asOf,
      message: "完済済み",
    };
  }

  if (monthlyPayment <= 0) {
    return {
      progressPct,
      remaining,
      months: null,
      payoffDate: null,
      message: "今月の返済額が0のため予測できません",
    };
  }

  const months = Math.ceil(remaining / monthlyPayment);
  const payoffDate = addMonthsDate(asOf, months);

  return { progressPct, remaining, months, payoffDate, message: "OK" };
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
  const s = half.trim().replace(/[,，\s]/g, "").replace(/円/g, "");

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

  // ✅ A案：このリングは月またぎ（累計）にするか
  carryOver?: boolean;
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

const FIXED_LIFE_KEY = "life"; // ✅ 生活費（月次）
const FIXED_SAVE_KEY = "save"; // ✅ 貯蓄（累計）
const GOAL_ASSET_KEY = "ring:asset"; // ✅ 総資産 目標だけは「目標専用キー」

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

function guessCarryOver(title: string, mode: RingMode) {
  const t = title ?? "";
  const repayWords = ["返済", "ローン", "借入", "カード", "クレカ", "リボ", "分割"];
  if (repayWords.some((w) => t.includes(w))) return true; // 返済っぽい → 累計
  if (mode === "income_only") return true; // 投資/積立系は累計の方が自然
  if (mode === "expense_only") return true; // 固定費/返済は累計の方が自然
  return false;
}

// ✅ 返済リング判定（返済系だけ%表示を出す）
function isRepayRingLike(r: { title: string; mode: RingMode; carryOver?: boolean }) {
  const t = (r.title ?? "").toLowerCase();
  const words = ["返済", "ローン", "借入", "カードローン", "クレカ", "リボ", "分割"];

  const byMode = r.mode === "expense_only" && !!r.carryOver; // ←基本はこれ
  const byTitle = words.some((w) => t.includes(w));

  // 誤爆させたくないので「両方一致」で厳しめ
  return byMode && byTitle;
}

type TxType = "income" | "expense";

type RepayInfo = {
  enabled: boolean; // 目標（借入総額）が入っているか
  progressPct: number;
  remaining: number;
  months: number | null;
  payoffDate: Date | null;
  message?: string;
};

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
  repayInfo,
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
  repayInfo?: RepayInfo; // ✅ 返済リング用
}) {
  // charMode を決める（将来の演出用。今は表示には使わない）
  resolveChara(title, charMode);

  const valueForProgress =
    mode === "income_only" ? sums.income : mode === "expense_only" ? sums.expense : Math.max(0, sums.balance);

  const prog = target > 0 ? clamp01(valueForProgress / target) : 0;

  // ✅ shouldIgnoreClick はDOMへ渡さない！
  const lp = useLongPressHandlers(() => onLongPressEditRing(id), 650);
  const { shouldIgnoreClick, ...lpProps } = lp;

  const defaultType: TxType = mode === "income_only" ? "income" : "expense";

  const displayValue = mode === "income_only" ? sums.income : mode === "expense_only" ? sums.expense : sums.balance;

  const remain = target > 0 ? Math.max(0, target - displayValue) : 0;
  const achieved = target > 0 ? displayValue >= target : false;

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
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900 }}>{yen(displayValue)}円</div>

        {target > 0 && !achieved && (
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>目標まであと {yen(remain)}円</div>
        )}

        {target > 0 && achieved && <div style={{ fontSize: 11, marginTop: 2, color: "green" }}>🎉 達成！</div>}

        {/* ✅ 返済リングだけ：返済率/残額/完済予測 */}
        {repayInfo?.enabled && (
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, lineHeight: 1.25 }}>
            <div>返済率：{repayInfo.progressPct.toFixed(1)}%</div>
            <div>完済まであと {yen(repayInfo.remaining)}円</div>
            {repayInfo.months !== null && <div>完済まで：あと {repayInfo.months}ヶ月</div>}
            {repayInfo.payoffDate && <div>完済予定：{formatYMDDate(repayInfo.payoffDate)}</div>}
          </div>
        )}

        {repayInfo && !repayInfo.enabled && (
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>目標（借入総額）が未設定です（長押しで設定）</div>
        )}

        <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>タップで入力 / 長押しで編集</div>
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
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>{kind === "mofu" ? "保存" : "保存"}</div>
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
  // =========================
  // ✅ transactions は「APIの結果」を正にする（localStorageと競合させない）
  // =========================
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);

useEffect(() => {
  setAsOf(new Date());
}, []);

  // ✅ userKey
  const [userKey, setUserKey] = useState<string>("");

  // ✅ ユーザーID表示（Safari/ホーム画面でも確認できる）
  const [userIdOpen, setUserIdOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  // ✅ ユーザーID貼り付け切替＋命名
  const [pasteKey, setPasteKey] = useState("");
  const [pasteName, setPasteName] = useState("");
  const [currentName, setCurrentName] = useState("");

  const hardReload = () => {
  const url = new URL(window.location.href);
  url.searchParams.set("v", String(Date.now()));
  window.location.replace(url.toString());
};
  useEffect(() => {
    if (!userIdOpen) return;
    setPasteKey("");
    setPasteName("");
    setCurrentName(getUserKeyName(userKey));
  }, [userIdOpen, userKey]);

  const isValidUserKey = (s: string) => {
    const v = s.trim();
    // 既存は 32桁hex が多い（例: 3e15a0...）
    if (/^[0-9a-f]{32}$/i.test(v)) return true;
    // 一応 8〜64 の任意キーも許容（ローカル用切替との互換）
    if (v.length >= 8 && v.length <= 64) return true;
    return false;
  };

  const applyPastedKey = () => {
    const next = normalizeUserKeyInput(pasteKey);

    if (!isValidUserKey(next)) {
      alert("ユーザーIDの形式が違うみたい（32桁の英数字 or 8〜64文字）");
      return;
    }

    // ✅ 名前（ユーザーネーム）を保存
    const nm = pasteName.trim();
    if (nm) setUserKeyName(next, nm);

    // ✅ この端末の userKey を切替（Safari/ホーム画面で合わせる用）
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {}

    clearUserKeyCache();
    setUserKey(next);
    setUserIdOpen(false);
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // fallback（iOS古め対策）
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  // 初回：userKey決定（getOrCreateUserKeyが内部でlocalStorageを見る想定）
 useEffect(() => {
  (async () => {
    const k = await getOrCreateUserKey();
    setUserKey(k);
  })();
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
    clearUserKeyCache();
    setUserKey(next);
    setKeyEditingOpen(false);
  };

  const regenerateUserKey = async () => {
    // ✅ 既存の保存キーを消して「新規作成させる」
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}

    try {
      clearUserKeyCache();
      const k = await getOrCreateUserKey();
      setUserKey(k);
      setKeyEditingOpen(false);
    } catch (e) {
      console.error("regenerateUserKey failed:", e);
      alert("再生成に失敗しました。コンソールを確認してね。");
    }
  };

  // --- 月切替（UTCズレ対策でローカル日付を使う）
  const nowYm = ymdToMonthKey(todayYMD());

  // ✅ 月状態はlocalStorageに保存して「次回も同じ月」を開ける
  const selectedYmKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_selected_ym:${k}`;
  }, [userKey]);

  const [selectedYm, setSelectedYm] = useState<string>(() => {
    if (typeof window === "undefined") return nowYm;
    try {
      const saved = localStorage.getItem(`miyamu_selected_ym:anonymous`);
      return saved || nowYm;
    } catch {
      return nowYm;
    }
  });

  // userKeyが確定したら、ユーザー別キーで読み直す
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(selectedYmKey);
      if (saved) setSelectedYm(saved);
      else setSelectedYm(nowYm);
    } catch {
      setSelectedYm(nowYm);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYmKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(selectedYmKey, selectedYm);
    } catch {}
  }, [selectedYmKey, selectedYm]);

  // =========================
  // ✅ A案：月次（生活費） vs 累計（貯蓄/返済）
  // =========================
  const selectedEnd = useMemo(() => endOfMonthYMD(selectedYm), [selectedYm]);

  const monthTransactions = useMemo(() => {
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  const carryOverTransactions = useMemo(() => {
    // selectedYmの月末までの全データ（未来分は入れない）
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymd <= selectedEnd;
    });
  }, [transactions, selectedEnd]);

  const monthSummary = useMemo(() => calcSummary(monthTransactions), [monthTransactions]);

  // =========================
  // ✅ 月PDF用：月次データをlocalStorageへ保存
  // =========================
  const monthStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_month:${k}:${selectedYm}`;
  }, [userKey, selectedYm]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(monthStorageKey, JSON.stringify(monthTransactions));
    } catch {}
  }, [monthStorageKey, monthTransactions]);

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
    return `miyamu_maker_extra_rings_v6:${k}`;
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
        .map((x) => {
          const title = String(x.title ?? "追加リング");
          const mode = (x.mode ?? "both") as RingMode;
          const carryOver = typeof x.carryOver === "boolean" ? x.carryOver : guessCarryOver(title, mode);

          return {
            id: x.id,
            ringKey: typeof x.ringKey === "string" ? x.ringKey : x.id, // 旧データ救済
            title,
            mode,
            color: x.color || "#60a5fa",
            charMode: (x.charMode ?? "auto") as CharaMode,
            carryOver,
          };
        });

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
  // ✅ 「リング別集計」：月次 or 累計を使い分ける
  // =========================
  const sumByCategoryMonthly = useMemo(() => {
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

  const sumByCategoryCarry = useMemo(() => {
    const map = new Map<string, { income: number; expense: number }>();
    for (const t of carryOverTransactions) {
      const cat = (t.category ?? "").trim();
      if (!cat) continue;
      const cur = map.get(cat) ?? { income: 0, expense: 0 };
      if (t.type === "income") cur.income += t.amount;
      else cur.expense += t.amount;
      map.set(cat, cur);
    }
    return map;
  }, [carryOverTransactions]);

  const getRingSums = (ringKey: string, useCarry: boolean) => {
    const cat = ringCategory(ringKey);
    const map = useCarry ? sumByCategoryCarry : sumByCategoryMonthly;
    const s = map.get(cat) ?? { income: 0, expense: 0 };
    const balance = s.income - s.expense;
    return { ...s, balance };
  };

  // 固定リング
  const lifeSums = getRingSums(FIXED_LIFE_KEY, false); // ✅ 生活費は月次
  const saveSums = getRingSums(FIXED_SAVE_KEY, true); // ✅ 貯蓄は累計

  // =========================
  // ✅ 目標（ringGoals.ts）から取得
  // =========================
  const [ringGoals, setRingGoals] = useState<RingGoal[]>([]);

  useEffect(() => {
    if (!userKey) return;
    setRingGoals(loadRingGoals());
  }, [userKey]);

  const targetBalance = getTarget(ringGoals, GOAL_ASSET_KEY);
  const lifeTarget = getTarget(ringGoals, ringCategory(FIXED_LIFE_KEY));
  const saveTarget = getTarget(ringGoals, ringCategory(FIXED_SAVE_KEY));

  // 追加リング（carryOver に従う）
  const extraComputed = useMemo(() => {
    return extraRings.map((r) => {
      const s = getRingSums(r.ringKey, !!r.carryOver);
      return { ...r, sums: s };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraRings, sumByCategoryMonthly, sumByCategoryCarry]);

  // 総資産（中央）= 全リング残高の合計（各リングのスコープで計算）
  const totalAssetBalance = useMemo(() => {
    let total = 0;
    total += lifeSums.balance; // 月次
    total += saveSums.balance; // 累計
    for (const r of extraComputed) total += r.sums.balance;
    return total;
  }, [lifeSums.balance, saveSums.balance, extraComputed]);

  const progressToTarget = targetBalance > 0 ? clamp01(totalAssetBalance / targetBalance) : 0;
  const remainToTarget = Math.max(0, targetBalance - totalAssetBalance);
  const balanceAchieved = targetBalance > 0 ? totalAssetBalance >= targetBalance : false;

  // 生活費：月次（支出のみ想定）
  const lifeSpent = lifeSums.expense;
  const lifeRingProgress = lifeTarget > 0 ? clamp01(lifeSpent / lifeTarget) : 0;
  const lifeAchieved = lifeTarget > 0 ? lifeSpent >= lifeTarget : false;

  // 貯蓄：累計（収入のみ想定でもOK）
  const savedTotal = saveSums.income;
  const saveRingProgress = saveTarget > 0 ? clamp01(savedTotal / saveTarget) : 0;
  const saveAchieved = saveTarget > 0 ? savedTotal >= saveTarget : false;

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
    setRingGoals(loadRingGoals());
  };

  // =========================
  // ✅ タップ入力（クイック入力モーダル）
  // =========================
  type QuickAddTarget = { kind: "life" } | { kind: "save" } | { kind: "extra"; id: string } | null;

  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickTarget, setQuickTarget] = useState<QuickAddTarget>(null);
  const [quickType, setQuickType] = useState<TxType>("expense");
  const [quickAmountStr, setQuickAmountStr] = useState("");
  const [quickDate, setQuickDate] = useState(todayYMD());
  const [quickDetail, setQuickDetail] = useState(""); // ✅ 内訳
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const openQuickAdd = (target: QuickAddTarget, defaultType: TxType) => {
    setQuickTarget(target);
    setQuickType(defaultType);
    setQuickAmountStr("");
    setQuickDetail("");
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
    if (quickTarget.kind === "life") return { ringKey: FIXED_LIFE_KEY, title: "生活費", mode: "expense_only" };
    if (quickTarget.kind === "save") return { ringKey: FIXED_SAVE_KEY, title: "貯蓄（累計）", mode: "income_only" };
    const r = extraRings.find((x) => x.id === quickTarget.id);
    if (!r) return null;
    return { ringKey: r.ringKey, title: r.title, mode: r.mode };
  };

  const createTransaction = async (payload: {
    type: TxType;
    amount: number;
    occurredAt: string;
    category: string;
    detailCategory?: string;
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

  // =========================
  // ✅ 保存演出（全身モフ/ひな ＋ 一言） + 見守りモフ吹き出し
  // =========================
  const [saveOverlay, setSaveOverlay] = useState<{ kind: "mofu" | "hina"; message: string; key: number } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  // ✅ 見守りモフ吹き出し（保存演出が消えた後に出す）
  const [watchMofuSpeech, setWatchMofuSpeech] = useState<{ show: boolean; text: string; key: number }>({
    show: false,
    text: "",
    key: 0,
  });
  const watchShowTimerRef = useRef<number | null>(null);
  const watchHideTimerRef = useRef<number | null>(null);

  const pickSaveMessage = (kind: "mofu" | "hina") => {
    const mofu: string[] = ["OK。保存した。", "やるじゃん。", "記録は強い。", "積み上げろ。", "無理すんなよ。"];
    const hina: string[] = ["できた！", "コツコツ大事！", "積み立て成功〜！", "明るい未来！", "いい感じ！"];
    const list = kind === "mofu" ? mofu : hina;
    return list[Math.floor(Math.random() * list.length)];
  };

  // ✅ 見守り吹き出し：トーン
  type WatchTone = "repay" | "invest" | "save" | "neutral";

  const WATCH_QUOTES_KEY = "miyamu_watch_quotes_v1";
  type WatchQuotes = Record<WatchTone, string[]>;

  const defaultWatchQuotes: WatchQuotes = {
    repay: ["偉い。返済は正義。", "ちゃんと減ってる。強い。", "その調子。完済は近いぞ。", "やるじゃん（煽り）", "逃げずに向き合ったな。"],
    invest: ["焦るな。積み上げは裏切らない。", "長期目線でいこう。", "いいね。淡々といこう。", "相場に振り回されるなよ。", "見守ってる。"],
    save: ["コツコツ、えらい。", "貯める力は武器だ。", "いい流れ。", "守りが固い。", "その調子。"],
    neutral: ["見てるぞ。", "その調子。", "記録は裏切らない。", "OK。続けろ。", "無理はするな。"],
  };

  function loadWatchQuotes(): WatchQuotes {
    if (typeof window === "undefined") return defaultWatchQuotes;
    try {
      const raw = localStorage.getItem(WATCH_QUOTES_KEY);
      if (!raw) return defaultWatchQuotes;
      const parsed = JSON.parse(raw);
      return {
        repay: Array.isArray(parsed?.repay) ? parsed.repay : defaultWatchQuotes.repay,
        invest: Array.isArray(parsed?.invest) ? parsed.invest : defaultWatchQuotes.invest,
        save: Array.isArray(parsed?.save) ? parsed.save : defaultWatchQuotes.save,
        neutral: Array.isArray(parsed?.neutral) ? parsed.neutral : defaultWatchQuotes.neutral,
      };
    } catch {
      return defaultWatchQuotes;
    }
  }

  const [watchQuotes, setWatchQuotes] = useState<WatchQuotes>(defaultWatchQuotes);

  useEffect(() => {
    setWatchQuotes(loadWatchQuotes());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickWatchMofu = (tone: WatchTone) => {
    const list = watchQuotes[tone] ?? watchQuotes.neutral ?? defaultWatchQuotes.neutral;
    return list[Math.floor(Math.random() * list.length)];
  };

  // ✅ 保存したリング（meta）から「ヌッのキャラ」と「見守りトーン」を決める
  const decideSaveReaction = (meta: { title: string; ringKey: string }) => {
    const t = (meta.title ?? "").toLowerCase();

    const repayWords = ["返済", "ローン", "借入", "カードローン", "クレカ", "リボ", "分割"];
    const investWords = ["投資", "nisa", "ニーサ", "株", "積立", "つみたて", "資産", "運用", "配当"];
    const saveWords = ["貯蓄", "貯金", "積立", "積み立て", "資産形成"];

    if (repayWords.some((w) => t.includes(w))) return { kind: "mofu" as const, tone: "repay" as const };
    if (investWords.some((w) => t.includes(w))) return { kind: "hina" as const, tone: "invest" as const };
    if (saveWords.some((w) => t.includes(w))) return { kind: "hina" as const, tone: "save" as const };

    if (meta.ringKey === FIXED_LIFE_KEY) return { kind: "mofu" as const, tone: "neutral" as const };
    if (meta.ringKey === FIXED_SAVE_KEY) return { kind: "hina" as const, tone: "save" as const };

    return { kind: "mofu" as const, tone: "neutral" as const };
  };

  const triggerSaveOverlay = (kind: "mofu" | "hina", tone: WatchTone = "neutral") => {
    // 既存タイマー掃除
    if (overlayTimerRef.current !== null) {
      window.clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = null;
    }
    if (watchShowTimerRef.current !== null) {
      window.clearTimeout(watchShowTimerRef.current);
      watchShowTimerRef.current = null;
    }
    if (watchHideTimerRef.current !== null) {
      window.clearTimeout(watchHideTimerRef.current);
      watchHideTimerRef.current = null;
    }

    // 吹き出しをいったん消す（連打対策）
    setWatchMofuSpeech({ show: false, text: "", key: Date.now() });

    const message = pickSaveMessage(kind);
    const key = Date.now();
    setSaveOverlay({ kind, message, key });

    overlayTimerRef.current = window.setTimeout(() => {
      // ✅ ヌッ演出を消す
      setSaveOverlay(null);
      overlayTimerRef.current = null;

      // ✅ ヌッの後に見守り吹き出しを出す
      watchShowTimerRef.current = window.setTimeout(() => {
        const text = pickWatchMofu(tone);
        const k = Date.now();
        setWatchMofuSpeech({ show: true, text, key: k });
        watchShowTimerRef.current = null;

        // 出てから2秒で消える
        watchHideTimerRef.current = window.setTimeout(() => {
          setWatchMofuSpeech((prev) => ({ ...prev, show: false }));
          watchHideTimerRef.current = null;
        }, 2000);
      }, 250);
    }, 2600);
  };

  useEffect(() => {
    return () => {
      if (overlayTimerRef.current !== null) {
        window.clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
      if (watchShowTimerRef.current !== null) {
        window.clearTimeout(watchShowTimerRef.current);
        watchShowTimerRef.current = null;
      }
      if (watchHideTimerRef.current !== null) {
        window.clearTimeout(watchHideTimerRef.current);
        watchHideTimerRef.current = null;
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

    const type: TxType = meta.mode === "income_only" ? "income" : meta.mode === "expense_only" ? "expense" : quickType;

    setIsSavingQuick(true);
    try {
      const tx = await createTransaction({
        type,
        amount,
        occurredAt: quickDate,
        category: ringCategory(meta.ringKey),
        detailCategory: quickDetail.trim() ? quickDetail.trim().slice(0, 24) : undefined,
      });

      setTransactions((prev) => [tx, ...prev]);
      closeQuickAdd();

      // ✅ 全リング：保存 → ヌッ（mofu/hina）→ 見守り吹き出し
      const reaction = decideSaveReaction(meta);
      triggerSaveOverlay(reaction.kind, reaction.tone);
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
  const [createTitle, setCreateTitle] = useState("カードローン返済");
  const [createMode, setCreateMode] = useState<RingMode>("expense_only");
  const [createCarryOver, setCreateCarryOver] = useState(true);

  const openCreate = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }
    setCreateTitle("カードローン返済");
    setCreateMode("expense_only");
    setCreateCarryOver(true);
    setCreateOpen(true);
  };

  const saveCreate = () => {
    if (!canAddExtra) return;

    const title = String(createTitle).trim().slice(0, 24) || "追加リング";
    const id = makeId();
    const ringKey = makeId();
    const carryOver = !!createCarryOver;

    const next: ExtraRing = {
      id,
      ringKey,
      title,
      mode: createMode,
      color: "#60a5fa",
      charMode: "auto",
      carryOver,
    };

    setExtraRings((prev) => [...prev, next]);
    setCreateOpen(false);
  };

  // =========================
  // ✅ 追加リング編集（長押し）
  // =========================
  const [extraEditId, setExtraEditId] = useState<string | null>(null);
  const [extraDraft, setExtraDraft] = useState<{ title: string; mode: RingMode; carryOver: boolean }>({
    title: "",
    mode: "both",
    carryOver: false,
  });

  const openExtraEdit = (id: string) => {
    const r = extraRings.find((x) => x.id === id);
    if (!r) return;
    setExtraDraft({
      title: r.title,
      mode: r.mode,
      carryOver: !!r.carryOver,
    });
    setExtraEditId(id);
  };

  const saveExtraEdit = () => {
    if (!extraEditId) return;
    const title = String(extraDraft.title).trim().slice(0, 24) || "追加リング";
    const mode = extraDraft.mode;
    const carryOver = !!extraDraft.carryOver;

    setExtraRings((prev) => prev.map((x) => (x.id === extraEditId ? { ...x, title, mode, carryOver } : x)));
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
    map.set(ringCategory(FIXED_LIFE_KEY), "生活費");
    map.set(ringCategory(FIXED_SAVE_KEY), "貯蓄（累計）");
    for (const r of extraRings) {
      map.set(ringCategory(r.ringKey), r.title);
    }
    return map;
  }, [extraRings]);

  const resolveCategoryLabel = (cat: string) => {
    const c = (cat ?? "").trim();
    return categoryLabelMap.get(c) ?? c;
  };

  // Form側で「生活費」「貯蓄」「追加リング名」を打った時に ring:* に変換するため
  const ringTitleResolver = useMemo(() => {
    const pairs: Array<{ title: string; category: string }> = [];
    pairs.push({ title: "生活費", category: ringCategory(FIXED_LIFE_KEY) });
    pairs.push({ title: "貯蓄", category: ringCategory(FIXED_SAVE_KEY) });
    pairs.push({ title: "貯蓄（累計）", category: ringCategory(FIXED_SAVE_KEY) });
    for (const r of extraRings) {
      pairs.push({ title: r.title, category: ringCategory(r.ringKey) });
    }
    return pairs;
  }, [extraRings]);

  // =========================
  // ✅ 追加リングの配置
  // =========================
  const extraPositions = useMemo(() => {
    const n = extraRings.length;
    if (n === 0) return [];

    const padding = isMobile ? 10 : 16;
    const available = Math.max(320, layoutW - padding * 2);

    const baseSize = smallSize;
    const size = Math.max(isMobile ? 120 : 160, Math.min(baseSize, Math.floor(available / 3)));

    const radiusX = isMobile ? 95 : 210;
    const radiusY = isMobile ? 165 : 300;

    // 下 → 左下 → 右下 → 左上 → 右上
    const angles = [-90, -140, -40, 180, 0];

    return extraRings.slice(0, angles.length).map((r, i) => {
      const rad = (angles[i] * Math.PI) / 180;
      const x = Math.cos(rad) * radiusX;
      const y = Math.sin(rad) * radiusY;
      return { id: r.id, x, y, size };
    });
  }, [extraRings, isMobile, layoutW, smallSize]);

  const areaH = isMobile ? 820 : 860;

  // =========================
  // ✅ 固定リングの長押し
  // =========================
  const lpGoalAsset = useLongPressHandlers(() => openGoalEditor(GOAL_ASSET_KEY), 650);
  const { shouldIgnoreClick: shouldIgnoreAsset, ...lpGoalAssetProps } = lpGoalAsset;

  const lpGoalLife = useLongPressHandlers(() => openGoalEditor(ringCategory(FIXED_LIFE_KEY)), 650);
  const { shouldIgnoreClick: shouldIgnoreLife, ...lpGoalLifeProps } = lpGoalLife;

  const lpGoalSave = useLongPressHandlers(() => openGoalEditor(ringCategory(FIXED_SAVE_KEY)), 650);
  const { shouldIgnoreClick: shouldIgnoreSave, ...lpGoalSaveProps } = lpGoalSave;

  // =========================
  // ✅ 印刷 / PDF（新規タブ方式）
  // =========================
  const openPrintView = () => {
    const ua = navigator.userAgent;
    const isIOS = /iP(hone|od|ad)/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    const isIOSSafari = isIOS && isSafari;

    const esc = (s: string) =>
      (s ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const title = `月次レポート（${fmtYM(selectedYm)}）`;

    const rows = monthTransactions
      .slice()
      .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)))
      .map((t) => {
        const ymd = (t.occurredAt ?? "").slice(0, 10);
        const type = t.type === "income" ? "収入" : "支出";
        const amount = yen(t.amount);
        const cat = esc(resolveCategoryLabel(t.category ?? ""));
        const detail = esc(t.detailCategory ?? "");
        return `<tr>
          <td>${esc(ymd)}</td>
          <td>${type}</td>
          <td style="text-align:right;">${esc(amount)}</td>
          <td>${cat}</td>
          <td>${detail}</td>
        </tr>`;
      })
      .join("");

    const expenseOnly = monthTransactions.filter((t) => t.type === "expense");
    const breakdown = new Map<string, number>();
    for (const t of expenseOnly) {
      const key = (t.detailCategory ?? "").trim() || "（未分類）";
      breakdown.set(key, (breakdown.get(key) ?? 0) + t.amount);
    }
    const breakdownRows = Array.from(breakdown.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right;">${esc(yen(v))}</td></tr>`)
      .join("");

    const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>
    body { font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Noto Sans JP",sans-serif; padding: 18px; }
    h1 { font-size: 18px; margin: 0 0 10px; }
    .meta { color:#555; font-size: 12px; margin-bottom: 14px; }
    .box { border:1px solid #ddd; border-radius: 10px; padding: 12px; margin-bottom: 14px; }
    table { width:100%; border-collapse: collapse; }
    th, td { border-bottom: 1px solid #eee; padding: 8px; font-size: 12px; vertical-align: top; }
    th { text-align:left; background:#fafafa; }
    .right { text-align:right; }
    @media print {
      body { padding: 0; }
      .no-print { display:none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="display:flex; gap:10px; margin-bottom: 12px;">
    <button onclick="window.print()" style="padding:10px 12px; border-radius:10px; border:1px solid #111; background:#111; color:#fff; font-weight:700;">印刷 / PDF</button>
    <button onclick="window.close()" style="padding:10px 12px; border-radius:10px; border:1px solid #ccc; background:#fff; font-weight:700;">閉じる</button>
  </div>

  <h1>${esc(title)}</h1>
  <div class="meta">収入 ${esc(yen(monthSummary.income))} / 支出 ${esc(yen(monthSummary.expense))} / 収支 ${esc(
      yen(monthSummary.balance)
    )}</div>

  <div class="box">
    <div style="font-weight:900; margin-bottom:8px;">支出内訳（detailCategory）</div>
    <table>
      <thead><tr><th>内訳</th><th class="right">金額</th></tr></thead>
      <tbody>${breakdownRows || "<tr><td colspan='2'>（支出がありません）</td></tr>"}</tbody>
    </table>
  </div>

  <div class="box">
    <div style="font-weight:900; margin-bottom:8px;">明細（収入・支出ログ）</div>
    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>種別</th>
          <th class="right">金額</th>
          <th>リング</th>
          <th>detailCategory</th>
        </tr>
      </thead>
      <tbody>${rows || "<tr><td colspan='5'>（データがありません）</td></tr>"}</tbody>
    </table>
  </div>
</body>
</html>`;

    const w = window.open("", "_blank");
    if (!w) {
      alert("ポップアップがブロックされました。iPhoneは Safari の設定（ポップアップ）を確認してね。");
      return;
    }

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();

    if (!isIOSSafari) {
      setTimeout(() => {
        try {
          w.print();
        } catch {}
      }, 250);
    }
  };

   // =========================
  // ✅ ここが “returnでJSXを包む”
  // =========================
  return (
    <div style={{ padding: 14 }}>
      {/* ✅ 保存演出（ヌッと出る） */}
      {saveOverlay && (
        <SaveCharaOverlay
          key={saveOverlay.key}
          kind={saveOverlay.kind}
          message={saveOverlay.message}
          isMobile={isMobile}
          onClose={() => setSaveOverlay(null)}
        />
      )}

      {/* ✅ 保存後だけ：見守りモフ＋吹き出し（下に張り付け固定） */}
{watchMofuSpeech.show && (
  <div
    key={watchMofuSpeech.key}
    style={{
      position: "fixed",
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 99999,
      pointerEvents: "none",
      display: "flex",
      justifyContent: "center",
      paddingBottom: isMobile ? 18 : 24, // 下余白
    }}
  >
    <div style={{ position: "relative" }}>
      {/* 吹き出し */}
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: isMobile ? -62 : -74,
          transform: "translateX(-50%)",
          background: "rgba(255,255,255,0.96)",
          borderRadius: 16,
          padding: isMobile ? "9px 12px" : "10px 14px",
          fontSize: isMobile ? 12 : 14,
          fontWeight: 900,
          boxShadow: "0 14px 32px rgba(0,0,0,0.12)",
          whiteSpace: "nowrap",
        }}
      >
        {watchMofuSpeech.text}
      </div>

      {/* モフ本体 */}
      <img
        src="/mofu-watch.png"
        alt="watch mofu"
        style={{
          width: isMobile ? 260 : 340,
          height: "auto",
          display: "block",
          filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.25))",
        }}
      />
    </div>
  </div>
)}

      {/* 月切替 */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {SHOW_USERKEY_UI && (
          <>
            <div style={{ fontSize: 12, opacity: 0.75 }}>
              userKey: {maskKey(userKey)} {getUserKeyName(userKey) ? `（${getUserKeyName(userKey)}）` : ""}
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

            <button
              type="button"
              onClick={hardReload}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              最新版読み直し
            </button>
          </>
        )}

        {/* ✅ 本番でも使える：ユーザーID確認ボタン */}
        <button
          type="button"
          onClick={() => setUserIdOpen(true)}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ddd",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
          title="この端末のユーザーID（userKey）を表示"
        >
          ユーザーID
        </button>

        <div style={{ flex: 1 }} />

        <button
          onClick={openPrintView}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          印刷 / PDF
        </button>

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

      {/* ✅ userKey表示モーダル（本番OK） */}
      {userIdOpen && (
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
            zIndex: 10000,
          }}
          onClick={() => setUserIdOpen(false)}
        >
          <div
            style={{
              width: "min(560px, 96vw)",
              background: "#fff",
              borderRadius: 16,
              padding: 16,
              boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>この端末のユーザーID（userKey）</div>

            <div
              style={{
                border: "1px solid #eee",
                borderRadius: 12,
                padding: 12,
                fontSize: 12,
                wordBreak: "break-all",
                background: "#fafafa",
                fontWeight: 800,
              }}
            >
              {userKey || "（取得中…）"}
            </div>

            {currentName && (
              <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
                ユーザーネーム：<b>{currentName}</b>
              </div>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => copyText(userKey)}
                disabled={!userKey}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: userKey ? "pointer" : "not-allowed",
                  opacity: userKey ? 1 : 0.6,
                }}
              >
                {copied ? "コピーした！" : "コピー"}
              </button>

              <button
                type="button"
                onClick={() => setUserIdOpen(false)}
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

            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
              ※ Safari と ホーム画面でデータがズレる時は、このIDが同じか確認してね
            </div>

            {/* ✅ 追加：貼り付けで userKey を揃える */}
            <hr style={{ margin: "12px 0" }} />

            <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900, marginBottom: 6 }}>
              別のユーザーIDを貼り付けて、この端末のIDを揃える
            </div>
            <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 8 }}>※ このユーザーIDは第三者に送らないでください</div>

            <input
              value={pasteKey}
              onChange={(e) => setPasteKey(e.target.value)}
              placeholder="32桁のユーザーID を貼り付け（例：3e15a0...）"
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                fontSize: 12,
              }}
            />

            {pasteKey.trim() && pasteKey.trim() !== userKey && (
              <>
                <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7, fontWeight: 900 }}>このIDのユーザーネーム（任意）</div>
                <input
                  value={pasteName}
                  onChange={(e) => setPasteName(e.target.value)}
                  placeholder="例）任意の名前 / "
                  style={{
                    width: "100%",
                    padding: 10,
                    borderRadius: 10,
                    border: "1px solid #ccc",
                    fontSize: 12,
                    marginTop: 6,
                  }}
                />
              </>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={applyPastedKey}
                disabled={!pasteKey.trim()}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  cursor: pasteKey.trim() ? "pointer" : "not-allowed",
                  opacity: pasteKey.trim() ? 1 : 0.6,
                }}
              >
                このIDに切り替える
              </button>

              <button
                type="button"
                onClick={() => {
                  setPasteKey("");
                  setPasteName("");
                }}
                style={{
                  padding: "10px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                クリア
              </button>
            </div>
          </div>
        </div>
      )}

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

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>※リング目標は「各リングを長押し」で編集（モーダルで開きます）</div>
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
         {/* ✅ 見守りモフ：円グラフ背景に透かし常駐（ただし前面演出中は消す） */}
{!watchMofuSpeech.show && (
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
)}
          /

          {/* ✅ 見守りモフ吹き出し（頭の上） */}
          {watchMofuSpeech.show && (
            <div
              key={watchMofuSpeech.key}
              style={{
                position: "absolute",
                left: "50%",
                top: isMobile ? "78px" : "112px",
                transform: "translateX(-50%)",
                background: "rgba(255,255,255,0.92)",
                border: "1px solid rgba(0,0,0,0.10)",
                borderRadius: 16,
                padding: isMobile ? "9px 12px" : "10px 14px",
                fontSize: isMobile ? 12 : 13,
                fontWeight: 900,
                boxShadow: "0 14px 32px rgba(0,0,0,0.12)",
                zIndex: 20,
                pointerEvents: "none",
                animation: "watchMofuPop 220ms ease-out both",
                maxWidth: "min(420px, 92vw)",
                textAlign: "center",
              }}
            >
              {watchMofuSpeech.text}
              {/* しっぽ */}
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: -8,
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "8px solid transparent",
                  borderRight: "8px solid transparent",
                  borderTop: "8px solid rgba(255,255,255,0.92)",
                  filter: "drop-shadow(0 6px 8px rgba(0,0,0,0.10))",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: -9,
                  transform: "translateX(-50%)",
                  width: 0,
                  height: 0,
                  borderLeft: "9px solid transparent",
                  borderRight: "9px solid transparent",
                  borderTop: "9px solid rgba(0,0,0,0.08)",
                  zIndex: -1,
                }}
              />
            </div>
          )}

          <style jsx>{`
            @keyframes watchMofuPop {
              from {
                opacity: 0;
                transform: translateX(-50%) translateY(10px) scale(0.98);
              }
              to {
                opacity: 1;
                transform: translateX(-50%) translateY(0) scale(1);
              }
            }
          `}</style>

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
              boxShadow: centerCard.achieved ? "0 0 28px rgba(34,197,94,0.45)" : "0 10px 25px rgba(0,0,0,0.06)",
              zIndex: 3,
              touchAction: "manipulation",
              cursor: "pointer",
            }}
            title="長押し：総資産の目標を編集"
          >
            <Ring size={bigSize} stroke={strokeBig} outward={outwardBig} progress={centerCard.progress} color={centerCard.color} />

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
            </div>
          </button>

          {/* 左下：生活費（月次） */}
          <button
            type="button"
            {...lpGoalLifeProps}
            onClick={(e) => {
              if (shouldIgnoreLife()) {
                e.preventDefault();
                return;
              }
              openQuickAdd({ kind: "life" }, "expense");
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
              boxShadow: lifeAchieved ? "0 0 28px rgba(34,197,94,0.45)" : "0 10px 25px rgba(0,0,0,0.05)",
              zIndex: 3,
              touchAction: "manipulation",
            }}
            title="タップ：生活費を入力 / 長押し：生活費目標を編集"
          >
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={lifeRingProgress} color="#d1d5db" />

            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>生活費</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(lifeSpent)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>今月</div>

              {lifeTarget > 0 && lifeTarget - lifeSpent > 0 && (
                <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>目標まであと {(lifeTarget - lifeSpent).toLocaleString()}円</div>
              )}

              {lifeTarget > 0 && lifeTarget - lifeSpent <= 0 && <div style={{ fontSize: 11, marginTop: 2, color: "green" }}>🎉 達成！</div>}

              <div style={{ marginTop: 6, fontSize: 11, opacity: 0.55 }}>タップで入力 / 長押しで目標編集</div>
            </div>
          </button>

          {/* 右下：貯蓄（累計） */}
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
            <Ring size={smallSize} stroke={strokeSmall} outward={outwardSmall} progress={saveRingProgress} color="#22c55e" />

            <div style={{ zIndex: 2 }}>
              <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 800 }}>貯蓄</div>
              <div style={{ fontSize: isMobile ? 26 : 30, fontWeight: 900 }}>{yen(savedTotal)}円</div>
              <div style={{ marginTop: 4, fontSize: 11, opacity: 0.6 }}>累計</div>
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

            // ✅ 返済リングだけ追加情報
            const showRepay = isRepayRingLike(r);

            const repayInfo: RepayInfo | undefined = showRepay
              ? (() => {
                  const totalDebt = getTarget(ringGoals, ringCategory(r.ringKey)); // 目標=借入総額
                  const repaidTotal = getRingSums(r.ringKey, true).expense; // 累計支出=返済累計
                  const monthlyPayment = getRingSums(r.ringKey, false).expense; // 月次支出=今月返済

                  const result = calcRepayment({
                    totalDebt,
                    repaidTotal,
                    monthlyPayment,
                    asOf: asOf ?? new Date(0),
                  });

                  return {
                    enabled: totalDebt > 0,
                    progressPct: result.progressPct,
                    remaining: result.remaining,
                    months: result.months,
                    payoffDate: result.payoffDate,
                    message: result.message,
                  };
                })()
              : undefined;

            return (
              <ExtraRingButton
                key={r.id}
                id={r.id}
                title={r.title + (r.carryOver ? "（累計）" : "")}
                color={r.color}
                mode={r.mode}
                charMode={r.charMode}
                sums={rc.sums}
                target={target}
                repayInfo={repayInfo}
                isMobile={isMobile}
                pos={p}
                strokeSmall={strokeSmall}
                outwardSmall={outwardSmall}
                onTapAdd={(id, defaultType) => openQuickAdd({ kind: "extra", id }, defaultType)}
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
          ✅ 目標編集モーダル
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
              {goalFocusCategory ? `：${goalFocusCategory === GOAL_ASSET_KEY ? "総資産" : resolveCategoryLabel(goalFocusCategory)}` : ""}
            </div>

            <RingGoalEditor
              ringCategories={[
                GOAL_ASSET_KEY,
                ringCategory(FIXED_LIFE_KEY),
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

            <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>※この画面は「長押し」で開きます</div>
          </div>
        </div>
      )}

      {/* =========================
          ✅ クイック入力モーダル
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
              const forcedType: TxType = meta.mode === "income_only" ? "income" : meta.mode === "expense_only" ? "expense" : quickType;

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

                    <label style={{ fontSize: 12, opacity: 0.75 }}>
                      detailCategory（内訳）
                      <input
                        value={quickDetail}
                        onChange={(e) => setQuickDetail(e.target.value)}
                        inputMode="text"
                        style={{
                          width: "100%",
                          padding: 12,
                          borderRadius: 12,
                          border: "1px solid #ddd",
                          fontSize: 16,
                          marginTop: 6,
                        }}
                        placeholder={forcedType === "income" ? "例）報酬 / 給与 / その他" : "例）コンビニ / 外食 / スーパー"}
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
                placeholder="例）カードローン返済 / 第一銀行 / 投資"
              />
            </label>

            <label style={{ fontSize: 12, opacity: 0.75, marginTop: 10, display: "block" }}>
              入力モード
              <select
                value={createMode}
                onChange={(e) => {
                  const m = e.target.value as RingMode;
                  setCreateMode(m);
                  setCreateCarryOver(m === "income_only" || m === "expense_only");
                }}
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

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, fontSize: 12 }}>
              <input type="checkbox" checked={createCarryOver} onChange={(e) => setCreateCarryOver(e.target.checked)} />
              月またぎ（累計）で計算する
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

            <label style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 10, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={extraDraft.carryOver}
                onChange={(e) => setExtraDraft((d) => ({ ...d, carryOver: e.target.checked }))}
              />
              月またぎ（累計）で計算する
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