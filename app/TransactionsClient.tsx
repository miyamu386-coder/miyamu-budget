"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import TransactionForm from "./TransactionForm";
import TransactionList from "./TransactionList";
import type { Transaction } from "./types";
import {getOrCreateUserKey,clearUserKeyCache,getUserKeyName,setUserKeyName,maskKey,normalizeUserKeyInput,} from "../lib/userKey";
import styles from "./TransactionsClient.module.css";
import html2canvas from "html2canvas";
import ExtraRingButton from "./components/ExtraRingButton";
import PayoffModal from "./components/PayoffModal";
import SaveCharaOverlay from "./components/SaveCharaOverlay";
import Ring from "./components/Ring";
import CreateRingModal from "./components/CreateRingModal";
import EditRingModal from "./components/EditRingModal";
import QuickAddModal from "./components/QuickAddModal";
import UserIdModal from "./components/UserIdModal";
import KeyEditingPanel from "./components/KeyEditingPanel";
import {makeId,ringCategory,guessCarryOver,isRepayRingLike,type RingMode,type ExtraRing,} from "../lib/ringUtils";
import { yen } from "../lib/format";
import { clamp01 } from "../lib/math";
import {BACKUP_STORAGE_KEY,exportMiyamuBackup,importMiyamuBackup,} from "../lib/backup";
import { parseAmountLike } from "../lib/amount";
import GoalModal from "./components/GoalModal";
import { loadRingGoals, getTarget, type RingGoal } from "../lib/ringGoals";
import { calcRepayment } from "../lib/repayment";
import {ymdToMonthKey,fmtYM,addMonths,endOfMonthYMD,todayYMD,} from "../lib/dateUtils";
import { useLongPressHandlers } from "../lib/useLongPressHandlers";
import { useHoldings } from "./components/useHoldings";
import { calcSummary } from "../lib/transactions";

type Props = {
  initialTransactions: Transaction[];
};

// ✅ 本番(Vercel)では userKey UI を出さない（ローカル開発だけ表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV !== "production";
const STORAGE_KEY = "miyamu_budget_user_key";

/**
 * ✅ 「5万」「1.2万」「3千」「50,000」等を数値にする
 */


// ✅ 安全設計：固定3 + 追加10 = 合計13
const MAX_EXTRA_RINGS = 10;

const FIXED_LIFE_KEY = "life"; // ✅ 生活費（月次）
const FIXED_SAVE_KEY = "save"; // ✅ 貯蓄（月次）
const GOAL_ASSET_KEY = "ring:asset"; // ✅ 総資産 目標だけは「目標専用キー」

type TxType = "income" | "expense";

type RepayInfo = {
  enabled: boolean;
  progressPct: number;
  remaining: number;
  months: number | null;
  payoffDate: Date | null;
  message?: string;
};

export default function TransactionsClient({ initialTransactions }: Props) {

  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [formOpen, setFormOpen] = useState(true);
  const formRef = useRef<HTMLDivElement | null>(null);
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedRing, setSelectedRing] = useState<string | null>(null);
  const [orbitOffset, setOrbitOffset] = useState(0);
  const dragStartXRef = useRef<number | null>(null);
  const dragStartOffsetRef = useRef(0);
  const startEdit = (t: Transaction) => {
  setEditing(t);
  setFormOpen(true);

  setTimeout(() => {
    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, 50);
};

  useEffect(() => {
    setAsOf(new Date());
  }, []);
  useEffect(() => {
  setMounted(true);
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

const exportBackup = () => {
  exportMiyamuBackup({
    version: 1,
    exportedAt: "",
    userKey,
    transactions,
    ringGoals,
    selectedYm,
    extraRings,
    holdings: [],
  });
};

const importBackup = async (file: File) => {
  await importMiyamuBackup({
    file,
    userKey,
    nowYm,
    storageKey: BACKUP_STORAGE_KEY,
    setUserKey,
    setSelectedYm,
    setExtraRings,
    setRingGoals,
    setTransactions,
    hardReload,
  });
};

  useEffect(() => {
    if (!userIdOpen) return;
    setPasteKey("");
    setPasteName("");
    setCurrentName(getUserKeyName(userKey));
  }, [userIdOpen, userKey]);

  const isValidUserKey = (s: string) => {
    const v = s.trim();
    if (/^[0-9a-f]{32}$/i.test(v)) return true;
    if (v.length >= 8 && v.length <= 64) return true;
    return false;
  };

  const applyPastedKey = () => {
    const next = normalizeUserKeyInput(pasteKey);

    if (!isValidUserKey(next)) {
      alert("ユーザーIDの形式が違うみたい（32桁の英数字 or 8〜64文字）");
      return;
    }

    const nm = pasteName.trim();
    if (nm) setUserKeyName(next, nm);

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

  useEffect(() => {
    (async () => {
      const k = await getOrCreateUserKey();
      setUserKey(k);
    })();
  }, []);

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

  const nowYm = ymdToMonthKey(todayYMD());

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = localStorage.getItem(selectedYmKey);
      if (saved) setSelectedYm(saved);
      else setSelectedYm(nowYm);
    } catch {
      setSelectedYm(nowYm);
    }
  }, [selectedYmKey, nowYm]);

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
    return transactions.filter((t) => {
      const ymd = (t.occurredAt ?? "").slice(0, 10);
      if (!ymd) return false;
      return ymd <= selectedEnd;
    });
  }, [transactions, selectedEnd]);

  const monthSummary = useMemo(() => calcSummary(monthTransactions), [monthTransactions]);

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
  const {holdings,setHoldings,getHoldingValue,} = useHoldings(userKey);
  const canAddExtra = extraRings.length < MAX_EXTRA_RINGS;
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
            ringKey: typeof x.ringKey === "string" ? x.ringKey : x.id,
            title,
            mode,
            color: typeof x.color === "string" ? x.color : "#60a5fa",
            ringType: isRepayRingLike({ title, mode, carryOver })? "debt": (x.ringType ?? "asset"),
            carryOver,
            charMode: x.charMode ?? "auto",
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

  // =========================
  // ✅ 目標（ringGoals.ts）から取得
  // =========================
  const [ringGoals, setRingGoals] = useState<RingGoal[]>([]);

  useEffect(() => {
    if (!userKey) return;
    setRingGoals(loadRingGoals());
  }, [userKey]);

  const targetBalance = getTarget(ringGoals, GOAL_ASSET_KEY);

  const extraComputed = useMemo(() => {
  return extraRings.map((r) => {
    const s = getRingSums(r.ringKey, !!r.carryOver);

    const isSecuritiesRing =
      r.title.includes("証券") ||
      r.title.includes("株") ||
      r.title.includes("投資");

    const holdingsValue = getHoldingValue(r.ringKey);

    if (isSecuritiesRing) {
      return {
        ...r,
        sums: {
          ...s,
          income: holdingsValue,
          expense: 0,
          balance: holdingsValue,
        },
      };
    }

    return { ...r, sums: s };
  });
}, [extraRings, sumByCategoryMonthly, sumByCategoryCarry, getHoldingValue]);

  const totalAssetBalance = useMemo(() => {
  let total = 0;
  for (const r of extraComputed) {
    if (!r.carryOver) continue;
    if (r.ringType !== "asset") continue;
    total += r.sums.balance;
  }
  // total += holdingsTotal;
  return total;
}, [extraComputed]);

  const progressToTarget = targetBalance > 0 ? clamp01(totalAssetBalance / targetBalance) : 0;
  const remainToTarget = Math.max(0, targetBalance - totalAssetBalance);
  const balanceAchieved = targetBalance > 0 ? totalAssetBalance >= targetBalance : false;

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

useEffect(() => {
  setFormOpen(!isMobile);
}, [isMobile]);

  // =========================
  // ✅ コンテナ幅（配置計算に使う）
  // =========================
  const layoutRef = useRef<HTMLDivElement | null>(null);
  const [, setLayoutW] = useState(980);

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
  const [quickView, setQuickView] = useState<"form" | "history" | "holdings">("form");
  const [quickTarget, setQuickTarget] = useState<QuickAddTarget>(null);
  const [quickType, setQuickType] = useState<TxType>("expense");
  const [quickAmountStr, setQuickAmountStr] = useState("");
  const [quickDate, setQuickDate] = useState(todayYMD());
  const [quickDetail, setQuickDetail] = useState("");
  const [isSavingQuick, setIsSavingQuick] = useState(false);

  const openQuickAdd = (target: QuickAddTarget, defaultType: TxType) => {
    setQuickTarget(target);
    setQuickType(defaultType);
    setQuickAmountStr("");
    setQuickDetail("");
    setQuickDate(todayYMD());
    setIsSavingQuick(false);
    setQuickView("form");
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
    if (quickTarget.kind === "save") return { ringKey: FIXED_SAVE_KEY, title: "貯蓄（今月）", mode: "income_only" };
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
  // ✅ 保存演出（全身モフ/ひな ＋ 一言） + 見守りモフ吹き出し、完済エフェクト
  // =========================
  const [saveOverlay, setSaveOverlay] = useState<{ kind: "mofu" | "hina"; message: string; key: number } | null>(null);
  const overlayTimerRef = useRef<number | null>(null);

  const [payoffModal, setPayoffModal] = useState<{
    title: string;
    amount: number;
    date: string;
  } | null>(null);
  const [pendingGlowRingId, setPendingGlowRingId] = useState<string | null>(null);

  const [watchMofuSpeech, setWatchMofuSpeech] = useState<{ show: boolean; text: string; key: number }>({
    show: false,
    text: "",
    key: 0,
  });
  const watchShowTimerRef = useRef<number | null>(null);
  const watchHideTimerRef = useRef<number | null>(null);

  // ✅ 光らせる対象は「リングid」
  const [glowRingId, setGlowRingId] = useState<string | null>(null);
  const glowTimerRef = useRef<number | null>(null);

  const pickSaveMessage = (kind: "mofu" | "hina") => {
    const mofu: string[] = ["OK。保存した。", "やるじゃん。", "記録は強い。", "積み上げろ。", "無理すんなよ。"];
    const hina: string[] = ["できた！", "コツコツ大事！", "積み立て成功〜！", "明るい未来！", "いい感じ！"];
    const list = kind === "mofu" ? mofu : hina;
    return list[Math.floor(Math.random() * list.length)];
  };

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
  }, []);

  const pickWatchMofu = (tone: WatchTone) => {
    const list = watchQuotes[tone] ?? watchQuotes.neutral ?? defaultWatchQuotes.neutral;
    return list[Math.floor(Math.random() * list.length)];
  };

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

    setWatchMofuSpeech({ show: false, text: "", key: Date.now() });

    const message = pickSaveMessage(kind);
    const key = Date.now();
    setSaveOverlay({ kind, message, key });

    overlayTimerRef.current = window.setTimeout(() => {
      setSaveOverlay(null);
      overlayTimerRef.current = null;

      watchShowTimerRef.current = window.setTimeout(() => {
        const text = pickWatchMofu(tone);
        const k = Date.now();
        setWatchMofuSpeech({ show: true, text, key: k });
        watchShowTimerRef.current = null;

        watchHideTimerRef.current = window.setTimeout(() => {
          setWatchMofuSpeech((prev) => ({ ...prev, show: false }));
          watchHideTimerRef.current = null;
        }, 2000);
      }, 250);
    }, 2600);
  };

  const triggerRingGlow = (ringId: string) => {
    setGlowRingId(ringId);

    if (glowTimerRef.current !== null) {
      window.clearTimeout(glowTimerRef.current);
      glowTimerRef.current = null;
    }

    glowTimerRef.current = window.setTimeout(() => {
      setGlowRingId(null);
      glowTimerRef.current = null;
    }, 2200);
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
      if (glowTimerRef.current !== null) {
        window.clearTimeout(glowTimerRef.current);
        glowTimerRef.current = null;
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
        detailCategory: quickDetail.trim() ? quickDetail.trim().slice(0, 24) : undefined,
      });

      setTransactions((prev) => [tx, ...prev]);
      setSelectedRing(null);
      closeQuickAdd();

      // ✅ 保存演出は常に出す
      const reaction = decideSaveReaction(meta);
      triggerSaveOverlay(reaction.kind, reaction.tone);

            // ✅ 返済リングだけ：保存後に完済判定
      const targetRing = extraRings.find((r) => r.ringKey === meta.ringKey);

      if (targetRing && isRepayRingLike(targetRing) && type === "income") {
        const totalDebt = getTarget(ringGoals, ringCategory(targetRing.ringKey));
        const currentCarry = getRingSums(targetRing.ringKey, true).income;
        const nextRepaidTotal = currentCarry + amount;
        const remainingAfterSave = Math.max(0, totalDebt - nextRepaidTotal);

        if (totalDebt > 0 && remainingAfterSave === 0) {
          setPendingGlowRingId(targetRing.id);
          window.setTimeout(() => {
          confetti({
          particleCount: 80,
          spread: 70,
          origin: { x: 0.25, y: 0.9 },
          });

         confetti({
         particleCount: 80,
         spread: 70,
         origin: { x: 0.75, y: 0.9 },
       });
    }, 2850);
         window.setTimeout(() => {
         confetti({
         particleCount: 120,
         spread: 100,
         origin: { x: 0.5, y: 0.8 },
          });
    }, 3050);

          window.setTimeout(() => {
            setPayoffModal({
              title: targetRing.title,
              amount: nextRepaidTotal,
              date: quickDate,
            });
          }, 3200);
        }
      }
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
  const [createMode, setCreateMode] = useState<RingMode>("both");
  const [createCarryOver, setCreateCarryOver] = useState(true);

  const openCreate = () => {
    if (!canAddExtra) {
      alert(`追加リングは最大${MAX_EXTRA_RINGS}個までです`);
      return;
    }
    setCreateTitle("カードローン返済");
    setCreateMode("both");
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
      ringType: isRepayRingLike({ title, mode: createMode, carryOver }) ? "debt" : "asset",
      carryOver,
      charMode: "auto",
    };

    setExtraRings((prev) => [...prev, next]);
    setCreateOpen(false);
  };

  // =========================
  // ✅ 追加リング編集（長押し）
  // =========================
  const [extraEditId, setExtraEditId] = useState<string | null>(null);
  const [extraDraft, setExtraDraft] = useState<{
  title: string;
  mode: RingMode;
  carryOver: boolean;
  ringType: "asset" | "debt";
}>({
  title: "",
  mode: "both",
  carryOver: false,
  ringType: "asset",
});

  const openExtraEdit = (id: string) => {
    const r = extraRings.find((x) => x.id === id);
    if (!r) return;
    setExtraDraft({
  title: r.title,
  mode: r.mode,
  carryOver: !!r.carryOver,
  ringType: r.ringType ?? "asset",
});
    setExtraEditId(id);
  };

  const saveExtraEdit = () => {
    if (!extraEditId) return;
    const title = String(extraDraft.title).trim().slice(0, 24) || "追加リング";
    const mode = extraDraft.mode;
    const carryOver = !!extraDraft.carryOver;

    setExtraRings((prev) =>
      prev.map((x) =>
        x.id === extraEditId
          ? {
              ...x,
              title,
              mode,
              carryOver,
              ringType: isRepayRingLike({ title, mode, carryOver }) ? "debt" : "asset",
            }
          : x
      )
    );
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
      color: "#f59e0b",
      sub1: ``,
      sub2: targetBalance > 0 ? `目標まであと ${yen(remainToTarget)}円` : "",
      achieved: balanceAchieved,
    };
  }, [
    totalAssetBalance,
    progressToTarget,
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
    map.set(ringCategory(FIXED_SAVE_KEY), "貯蓄（今月）");
    for (const r of extraRings) {
      map.set(ringCategory(r.ringKey), r.title);
    }
    return map;
  }, [extraRings]);

  const resolveCategoryLabel = (cat: string) => {
    const c = (cat ?? "").trim();
    return categoryLabelMap.get(c) ?? c;
  };

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
// ✅ 追加リングの配置：オービットリング
// =========================
const extraPositions = useMemo(() => {
  const count = extraRings.length;
  const extraSize = isMobile ? 112 : 150;

  const orbitRadiusX = isMobile ? 125 : 240;
  const orbitRadiusY = isMobile ? 210 : 285;

  const selectedIndex = selectedRing
    ? extraRings.findIndex((r) => r.id === selectedRing)
    : 0;

  return extraRings.map((r, i) => {
    const step = (Math.PI * 2) / Math.max(count, 1);

    // 選択中リングを手前下に持ってくる
    const frontAngle = Math.PI / 2;
    const angle =frontAngle +(i - selectedIndex) * step +orbitOffset;

    const depth = Math.sin(angle);
    const x = Math.cos(angle) * orbitRadiusX;
    const y = Math.sin(angle) * orbitRadiusY;

    const scale = 1 + depth * 0.12;
    const opacity = 0.72 + depth * 0.28;

    return {
      id: r.id,
      x,
      y,
      size: extraSize * scale,
      opacity,
      zIndex: Math.round(20 + depth * 20),
    };
  });
}, [extraRings, isMobile, selectedRing, orbitOffset]);
const areaH = isMobile ? 820 : 860;

  // =========================
  // ✅ 固定リングの長押し
  // =========================
  const lpGoalAsset = useLongPressHandlers(() => openGoalEditor(GOAL_ASSET_KEY), 650);
  const { shouldIgnoreClick: shouldIgnoreAsset, ...lpGoalAssetProps } = lpGoalAsset;

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
  const exportMonthlyImage = async () => {
  try {
    const el = document.getElementById("miyamu-report");

    if (!el) {
      alert("レポートが見つかりません");
      return;
    }

    const canvas = await html2canvas(el, {
      backgroundColor: "#ffffff",
      scale: 2,
    });

    const link = document.createElement("a");
    link.download = `miyamu-report-${selectedYm}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (e) {
    console.error(e);
    alert("画像作成に失敗しました");
  }
};
  if (!mounted) return null;

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
  <button
    onClick={exportMonthlyImage}
    style={{
      padding: "10px 12px",
      borderRadius: 12,
      border: "1px solid #111",
      background: "#fff",
      cursor: "pointer",
      fontWeight: 900,
      fontSize: 12,
    }}
  >
    月レポート保存
  </button>
</div>
      {payoffModal && (
        <PayoffModal
  title={payoffModal.title}
  amount={payoffModal.amount}
  date={payoffModal.date}
  isMobile={isMobile}
  onClose={() => {
    setPayoffModal(null);

    if (pendingGlowRingId) {
      window.setTimeout(() => {
        triggerRingGlow(pendingGlowRingId);
        setPendingGlowRingId(null);
      }, 120);
    }
  }}
/>
      )}

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
      <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    flexWrap: "wrap",
  }}
>
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

        <button
        type="button"
        onClick={exportBackup}
        style={{
        padding: "10px 12px",
        borderRadius: 12,
        border: "1px solid #111",
        background: "#fff",
        color: "#111",
        cursor: "pointer",
        fontWeight: 900,
        fontSize: 12,
      }}
>
  バックアップ
</button>

<button
  type="button"
  onClick={() => importFileRef.current?.click()}
  style={{
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#fff",
    color: "#111",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  }}
>
  復元
</button>

<input
  ref={importFileRef}
  type="file"
  accept="application/json"
  style={{ display: "none" }}
  onChange={async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importBackup(file);
    e.currentTarget.value = "";
  }}
/>

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

        <div style={{ fontWeight: 900, fontSize: 18 }}>
  {fmtYM(selectedYm)}
</div>

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

      {userIdOpen && (
  <UserIdModal
    userKey={userKey}
    currentName={currentName}
    copied={copied}
    pasteKey={pasteKey}
    setPasteKey={setPasteKey}
    pasteName={pasteName}
    setPasteName={setPasteName}
    onCopy={copyText}
    onApply={applyPastedKey}
    onClose={() => setUserIdOpen(false)}
  />
)}

      {SHOW_USERKEY_UI && keyEditingOpen && (
  <KeyEditingPanel
    userKeyInput={userKeyInput}
    setUserKeyInput={setUserKeyInput}
    applyUserKey={applyUserKey}
    regenerateUserKey={regenerateUserKey}
    onClose={() => setKeyEditingOpen(false)}
  />
)}
   <div ref={formRef}>
      <details
        open={formOpen}
        onToggle={(e) => setFormOpen((e.currentTarget as HTMLDetailsElement).open)}
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

      </details>
    </div>

      <div
      id="miyamu-report"
      ref={layoutRef}
      style={{
     maxWidth: 980,
     margin: "0 auto",
     }}
  >

         <div
         onTouchStart={(e) => {
      dragStartXRef.current = e.touches[0].clientX;
      dragStartOffsetRef.current = orbitOffset;}}

     onTouchMove={(e) => {
     e.preventDefault();    
     if (dragStartXRef.current == null) return;
     const dx =
      e.touches[0].clientX -
      dragStartXRef.current;
     setOrbitOffset(
     dragStartOffsetRef.current - dx * 0.01
    );
  }}
   onTouchEnd={() => {
    dragStartXRef.current = null;
  }}
          style={{
            position: "relative",
            width: "100%",
            height: areaH,
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            touchAction: "none",
          }}
        >
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
           
 {watchMofuSpeech.show && (
  <>
    <img
      src="/mofu-watch.png"
      alt="watch mofu"
      style={{
        position: "absolute",
        left: "50%",
        top: isMobile ? "-10px" : "-40px",
        transform: "translateX(-50%)",
        width: isMobile ? 280 : 520,
        height: "auto",
        zIndex: 19,
        pointerEvents: "none",
        filter: "drop-shadow(0 20px 40px rgba(0,0,0,0.25))",
        animation: "watchMofuNutto 220ms ease-out both",
      }}
    />

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
    </div>
  </>
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

            @keyframes watchMofuNutto {
              from {
                opacity: 0;
                transform: translateX(-50%) translateY(12px) scale(0.96);
              }
              to {
                opacity: 1;
                transform: translateX(-50%) translateY(0) scale(1);
              }
            }
          `}</style>

          {/* 中央：総資産 */}
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
              {centerCard.achieved && <div style={{ marginTop: 6, fontWeight: 900 }}>✅ 目標達成！</div>}
            </div>
          </button>

          {/* ✅ 追加リング群 */}
          {extraPositions.map((p) => {
            const r = extraRings.find((x) => x.id === p.id);
            const rc = extraComputed.find((x) => x.id === p.id);
            if (!r || !rc) return null;

            const catKey = ringCategory(r.ringKey);
            const target = getTarget(ringGoals, catKey);
            const showRepay = isRepayRingLike(r);

            const repayInfo: RepayInfo | undefined = showRepay
              ? (() => {
                  const totalDebt = getTarget(ringGoals, ringCategory(r.ringKey));
                  const repaidTotal = getRingSums(r.ringKey, true).income;
                  const monthlyPayment = getRingSums(r.ringKey, false).income;

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
                title={r.title}
                color={r.color}
                mode={r.mode}
                charMode={r.charMode}
                sums={rc.sums}
                target={target}
                repayInfo={repayInfo}
                isGlowing={glowRingId === r.id}
                selected={selectedRing === r.id}
                isMobile={isMobile}
                pos={p}
                strokeSmall={strokeSmall}
                outwardSmall={outwardSmall}
                onTapAdd={(id, defaultType) => {
                setSelectedRing(id);

               if (r.title.includes("証券")) {
               setQuickTarget({ kind: "extra", id });
               setQuickView("holdings");
               setQuickAddOpen(true);
              return;
              }

  openQuickAdd({ kind: "extra", id }, defaultType);
}}
                onLongPressEditRing={(id) => openExtraEdit(id)}
              />
            );
          })}
        </div>

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
{createOpen && (
  <CreateRingModal
    createTitle={createTitle}
    setCreateTitle={setCreateTitle}
    createMode={createMode}
    setCreateMode={setCreateMode}
    createCarryOver={createCarryOver}
    setCreateCarryOver={setCreateCarryOver}
    onSave={saveCreate}
    onClose={() => setCreateOpen(false)}
  />
)}
      {goalModalOpen && (
  <GoalModal
    goalFocusCategory={goalFocusCategory}
    goalAssetKey={GOAL_ASSET_KEY}
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
    onClose={closeGoalEditor}
  />
)}
      {quickAddOpen && (
  <QuickAddModal
    meta={getQuickMeta()}
    quickView={quickView}
    setQuickView={setQuickView}
    quickType={quickType}
    setQuickType={setQuickType}
    quickDate={quickDate}
    setQuickDate={setQuickDate}
    quickAmountStr={quickAmountStr}
    setQuickAmountStr={setQuickAmountStr}
    quickDetail={quickDetail}
    setQuickDetail={setQuickDetail}
    isSavingQuick={isSavingQuick}
    selectedYm={selectedYm}
    transactions={transactions}
    holdings={holdings}
    setHoldings={setHoldings}
    closeQuickAdd={closeQuickAdd}
    saveQuickAdd={saveQuickAdd}
    startEdit={startEdit}
    parseAmountLike={parseAmountLike}
    makeId={makeId}
    ringCategory={ringCategory}
  />
)}
      {extraEditId && (
  <EditRingModal
    extraDraft={extraDraft}
    setExtraDraft={setExtraDraft}
    onSave={saveExtraEdit}
    onClose={() => setExtraEditId(null)}
    onRemove={removeExtraRing}
  />
)}

      <hr style={{ margin: "24px 0" }} />

      <TransactionList
        transactions={monthTransactions}
        onEdit={startEdit}
        onDeleted={(id) => {
          setTransactions((prev) => prev.filter((t) => t.id !== id));
          if (editing?.id === id) setEditing(null);
        }}
        resolveCategoryLabel={resolveCategoryLabel}
      />
    </div> 
  );
}