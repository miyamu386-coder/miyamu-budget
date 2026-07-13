"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import confetti from "canvas-confetti";
import type { Transaction } from "./types";
import {getUserKeyName,maskKey,} from "../lib/userKey";
import styles from "./TransactionsClient.module.css";
import ExtraRingButton from "./components/ExtraRingButton";
import PayoffModal from "./components/PayoffModal";
import SaveCharaOverlay from "./components/SaveCharaOverlay";
import Ring from "./components/Ring";
import CreateRingModal from "./components/CreateRingModal";
import EditRingModal from "./components/EditRingModal";
import QuickAddModal from "./components/QuickAddModal";
import UserIdModal from "./components/UserIdModal";
import KeyEditingPanel from "./components/KeyEditingPanel";
import {makeId,ringCategory,isRepayRingLike,type RingMode,type ExtraRing,} from "../lib/ringUtils";
import { yen } from "../lib/format";
import { clamp01 } from "../lib/math";
import {BACKUP_STORAGE_KEY,exportMiyamuBackup,importMiyamuBackup,} from "../lib/backup";
import { parseAmountLike } from "../lib/amount";
import GoalModal from "./components/GoalModal";
import { loadRingGoals, getTarget, type RingGoal } from "../lib/ringGoals";
import { calcRepayment } from "../lib/repayment";
import {fmtYM,addMonths,todayYMD,} from "../lib/dateUtils";
import { useLongPressHandlers } from "../lib/useLongPressHandlers";
import { useHoldings } from "./components/useHoldings";
import {buildCategorySums,getRingSumsFromMap,} from "../lib/ringCalculator";
import { useExtraRings } from "./components/useExtraRings";
import { exportElementImage } from "../lib/exportImage";
import TransactionHistoryView from "./components/TransactionHistoryView";
import { useUserKeyManager } from "./components/useUserKeyManager";
import { useMonthlyTransactions } from "./components/useMonthlyTransactions";
import { openMonthlyPrintView } from "../lib/monthlyReport";
import {decideSaveReaction,useSaveEffects,} from "./components/useSaveEffects";
import { createTransactionApi } from "../lib/transactionApi";
import { useRingEditor } from "./components/useRingEditor";
import { useQuickAdd } from "./components/useQuickAdd";

type Props = {
  initialTransactions: Transaction[];
};

// ✅ 本番(Vercel)では userKey UI を出さない（ローカル開発だけ表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV !== "production";


// ✅ 安全設計：固定3 + 追加10 = 合計13

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
  const importFileRef = useRef<HTMLInputElement | null>(null);
  const [asOf, setAsOf] = useState<Date | null>(null);
  const [mounted, setMounted] = useState(false);
  const [selectedRing, setSelectedRing] = useState<string | null>(null);
  const [orbitOffset, setOrbitOffset] = useState(0);
  const [mainView, setMainView] = useState<"input" | "history">("input");
  const dragStartXRef = useRef<number | null>(null);
  const dragStartOffsetRef = useRef(0);
  const {userKey,setUserKey,userIdOpen,setUserIdOpen,copied,pasteKey,setPasteKey,pasteName,
setPasteName,currentName,keyEditingOpen,setKeyEditingOpen,userKeyInput,setUserKeyInput,hardReload,
copyText,applyPastedKey,applyUserKey,regenerateUserKey,} = useUserKeyManager();
  const startEdit = (t: Transaction) => {
  setEditing(t);
};

  useEffect(() => {
    setAsOf(new Date());
  }, []);
  useEffect(() => {
  setMounted(true);
  }, []);
const exportBackup = () => {
  exportMiyamuBackup({
    version: 1,
    exportedAt: "",
    userKey,
    transactions,
    ringGoals,
    selectedYm,
    extraRings,
    holdings,
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
    setHoldings,
    hardReload,
  });
};

  // =========================
  // ✅ A案：月次（生活費） vs 累計（貯蓄/返済）
  // =========================
  const {
  nowYm,
  selectedYm,
  setSelectedYm,
  monthTransactions,
  carryOverTransactions,
  monthSummary,
} = useMonthlyTransactions(transactions, userKey);

// =========================
// ✅ 追加リング（永続化）
// =========================
const {
  extraRings,
  setExtraRings,
  maxExtraRings,
  canAddExtra,
} = useExtraRings(userKey);

const {
  holdings,
  setHoldings,
  getHoldingValue,
} = useHoldings(userKey);

// =========================
// ✅ 「リング別集計」
// =========================
const sumByCategoryMonthly = useMemo(() => {
  return buildCategorySums(monthTransactions);
}, [monthTransactions]);

const sumByCategoryCarry = useMemo(() => {
  return buildCategorySums(carryOverTransactions);
}, [carryOverTransactions]);

const getRingSums = (ringKey: string, useCarry: boolean) => {
  const map = useCarry
    ? sumByCategoryCarry
    : sumByCategoryMonthly;

  return getRingSumsFromMap(map, ringKey);
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

const layoutRef = useRef<HTMLDivElement | null>(null);
  // =========================
  // ✅ サイズ
  // =========================
  const bigSize = isMobile ? 170 : 320;

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

const {
  quickAddOpen,
  quickView,
  setQuickView,
  quickType,
  setQuickType,
  quickAmountStr,
  setQuickAmountStr,
  quickDate,
  setQuickDate,
  quickDetail,
  setQuickDetail,
  isSavingQuick,
  openQuickAdd,
  openHoldingsView,
  closeQuickAdd,
  getQuickMeta,
  saveQuickTransaction,
} = useQuickAdd({
  userKey,
  extraRings,
  fixedLifeKey: FIXED_LIFE_KEY,
  fixedSaveKey: FIXED_SAVE_KEY,
  setTransactions,
  setSelectedRing,
});

const {
  saveOverlay,
  setSaveOverlay,
  payoffModal,
  setPayoffModal,
  pendingGlowRingId,
  setPendingGlowRingId,
  watchMofuSpeech,
  glowRingId,
  triggerSaveOverlay,
  triggerRingGlow,
} = useSaveEffects();

  const saveQuickAdd = async () => {
  try {
    const { meta, type, amount } =
      await saveQuickTransaction();

    const reaction = decideSaveReaction({
      ...meta,
      fixedLifeKey: FIXED_LIFE_KEY,
      fixedSaveKey: FIXED_SAVE_KEY,
    });

    triggerSaveOverlay(
      reaction.kind,
      reaction.tone
    );

    const targetRing = extraRings.find(
      (ring) => ring.ringKey === meta.ringKey
    );

    if (
      targetRing &&
      isRepayRingLike(targetRing) &&
      type === "income"
    ) {
      const totalDebt = getTarget(
        ringGoals,
        ringCategory(targetRing.ringKey)
      );

      const currentCarry = getRingSums(
        targetRing.ringKey,
        true
      ).income;

      const nextRepaidTotal =
        currentCarry + amount;

      const remainingAfterSave = Math.max(
        0,
        totalDebt - nextRepaidTotal
      );

      if (
        totalDebt > 0 &&
        remainingAfterSave === 0
      ) {
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
  } catch (error) {
    console.error(error);

    const message =
      error instanceof Error
        ? error.message
        : "保存に失敗しました";

    window.alert(message);
  }
};

const {
  createOpen,
  setCreateOpen,
  createTitle,
  setCreateTitle,
  createMode,
  setCreateMode,
  createCarryOver,
  setCreateCarryOver,
  openCreate,
  saveCreate,

  extraEditId,
  setExtraEditId,
  extraDraft,
  setExtraDraft,
  openExtraEdit,
  saveExtraEdit,
  removeExtraRing,
} = useRingEditor({
  extraRings,
  setExtraRings,
  canAddExtra,
  maxExtraRings,
});

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
// ✅ 印刷 / PDF
// =========================
const openPrintView = () => {
  openMonthlyPrintView({
    selectedYm,
    monthTransactions,
    monthSummary,
    resolveCategoryLabel,
  });
};

const exportMonthlyImage = () => {
  return exportElementImage(
    "miyamu-report",
    `miyamu-report-${selectedYm}.png`,
    "レポートが見つかりません",
    "画像作成に失敗しました"
  );
};
  if (!mounted) return null;
  if (mainView === "history") {
  return (
    <TransactionHistoryView
      selectedYm={selectedYm}
      setSelectedYm={setSelectedYm}
      transactions={monthTransactions}
      editing={editing}
      setEditing={setEditing}
      setTransactions={setTransactions}
      resolveCategoryLabel={resolveCategoryLabel}
      startEdit={startEdit}
      onBack={() => setMainView("input")}
    />
  );
}

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

  <button
  type="button"
  onClick={() => setMainView("history")}
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
  明細一覧
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
    openHoldingsView(id);
    return;
  }

  openQuickAdd(
    { kind: "extra", id },
    defaultType
  );
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
            ＋ 追加リング（残り {Math.max(0, maxExtraRings - extraRings.length)}）
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
    </div>
  );
}