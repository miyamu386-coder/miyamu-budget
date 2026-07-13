"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Transaction } from "./types";
import PayoffModal from "./components/PayoffModal";
import SaveCharaOverlay from "./components/SaveCharaOverlay";
import CreateRingModal from "./components/CreateRingModal";
import EditRingModal from "./components/EditRingModal";
import QuickAddModal from "./components/QuickAddModal";
import UserIdModal from "./components/UserIdModal";
import KeyEditingPanel from "./components/KeyEditingPanel";
import {makeId,ringCategory,} from "../lib/ringUtils";
import { yen } from "../lib/format";
import { clamp01 } from "../lib/math";
import {BACKUP_STORAGE_KEY,exportMiyamuBackup,importMiyamuBackup,} from "../lib/backup";
import { parseAmountLike } from "../lib/amount";
import GoalModal from "./components/GoalModal";
import { useLongPressHandlers } from "../lib/useLongPressHandlers";
import { useHoldings } from "./components/useHoldings";
import { useExtraRings } from "./components/useExtraRings";
import { exportElementImage } from "../lib/exportImage";
import TransactionHistoryView from "./components/TransactionHistoryView";
import { useUserKeyManager } from "./components/useUserKeyManager";
import { useMonthlyTransactions } from "./components/useMonthlyTransactions";
import { openMonthlyPrintView } from "../lib/monthlyReport";
import {useSaveEffects,} from "./components/useSaveEffects";
import { useRingEditor } from "./components/useRingEditor";
import { useQuickAdd } from "./components/useQuickAdd";
import { buildOrbitPositions } from "../lib/orbitLayout";
import { useRingSummary } from "./components/useRingSummary";
import { useRingGoals } from "./components/useRingGoals";
import WatchMofuDisplay from "./components/WatchMofuDisplay";
import CenterAssetRing from "./components/CenterAssetRing";
import ExtraRingLayer from "./components/ExtraRingLayer";
import AddRingButton from "./components/AddRingButton";
import HeaderBar from "./components/HeaderBar";
import { useQuickAddSave } from "./components/useQuickAddSave";
type Props = {
  initialTransactions: Transaction[];
};

// ✅ 本番(Vercel)では userKey UI を出さない（ローカル開発だけ表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV !== "production";


// ✅ 安全設計：固定3 + 追加10 = 合計13

const FIXED_LIFE_KEY = "life"; // ✅ 生活費（月次）
const FIXED_SAVE_KEY = "save"; // ✅ 貯蓄（月次）
const GOAL_ASSET_KEY = "ring:asset"; // ✅ 総資産 目標だけは「目標専用キー」


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

// ✅ 目標編集モーダル（A案）

// =========================

const {

  ringGoals,

  setRingGoals,

  targetBalance,

  goalModalOpen,

  goalFocusCategory,

  openGoalEditor,

  closeGoalEditor,

} = useRingGoals({

  userKey,

  goalAssetKey: GOAL_ASSET_KEY,

});


// =========================
// ✅ リング別集計
// =========================
const {
  getRingSums,
  extraComputed,
  totalAssetBalance,
} = useRingSummary({
  extraRings,
  monthTransactions,
  carryOverTransactions,
  getHoldingValue,
});

const progressToTarget =
  targetBalance > 0
    ? clamp01(totalAssetBalance / targetBalance)
    : 0;

const remainToTarget = Math.max(
  0,
  targetBalance - totalAssetBalance
);

const balanceAchieved =
  targetBalance > 0 &&
  totalAssetBalance >= targetBalance;

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

  const { saveQuickAdd } = useQuickAddSave({
  saveQuickTransaction,
  extraRings,
  ringGoals,
  quickDate,
  fixedLifeKey: FIXED_LIFE_KEY,
  fixedSaveKey: FIXED_SAVE_KEY,
  getRingSums,
  triggerSaveOverlay,
  setPendingGlowRingId,
  setPayoffModal,
});

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
  return buildOrbitPositions({
    extraRings,
    isMobile,
    selectedRing,
    orbitOffset,
  });
}, [
  extraRings,
  isMobile,
  selectedRing,
  orbitOffset,
]);
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

      <HeaderBar
  exportMonthlyImage={exportMonthlyImage}
  openPrintView={openPrintView}
  exportBackup={exportBackup}
  importFileRef={importFileRef}
  importBackup={importBackup}
  selectedYm={selectedYm}
  setSelectedYm={setSelectedYm}
  setMainView={setMainView}
  showUserKeyUi={SHOW_USERKEY_UI}
  userKey={userKey}
  setKeyEditingOpen={setKeyEditingOpen}
  hardReload={hardReload}
/>

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
<WatchMofuDisplay
  isMobile={isMobile}
  speech={watchMofuSpeech}
/>

          {/* 中央：総資産 */}
          <CenterAssetRing
  centerCard={centerCard}
  totalAssetBalance={totalAssetBalance}
  isMobile={isMobile}
  bigSize={bigSize}
  strokeBig={strokeBig}
  outwardBig={outwardBig}
  longPressProps={lpGoalAssetProps}
  shouldIgnoreClick={shouldIgnoreAsset}
/>
 <ExtraRingLayer
  extraPositions={extraPositions}
  extraRings={extraRings}
  extraComputed={extraComputed}
  ringGoals={ringGoals}
  glowRingId={glowRingId}
  selectedRing={selectedRing}
  isMobile={isMobile}
  strokeSmall={strokeSmall}
  outwardSmall={outwardSmall}
  asOf={asOf}
  getRingSums={getRingSums}
  openHoldingsView={openHoldingsView}
  openQuickAdd={openQuickAdd}
  openExtraEdit={openExtraEdit}
  setSelectedRing={setSelectedRing}
/>
        </div>
        <AddRingButton
  canAddExtra={canAddExtra}
  maxExtraRings={maxExtraRings}
  extraRingCount={extraRings.length}
  onOpenCreate={openCreate}
/>
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