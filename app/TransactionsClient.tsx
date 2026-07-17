"use client";

import { useRef, useState } from "react";
import type { Transaction } from "./types";
import {makeId,ringCategory,} from "../lib/ringUtils";
import { parseAmountLike } from "../lib/amount";
import { useLongPressHandlers } from "../lib/useLongPressHandlers";
import { useHoldings } from "./components/useHoldings";
import { useExtraRings } from "./components/useExtraRings";
import TransactionHistoryView from "./components/TransactionHistoryView";
import { useUserKeyManager } from "./components/useUserKeyManager";
import { useMonthlyTransactions } from "./components/useMonthlyTransactions";
import {useSaveEffects,} from "./components/useSaveEffects";
import { useRingEditor } from "./components/useRingEditor";
import { useQuickAdd } from "./components/useQuickAdd";
import { useRingSummary } from "./components/useRingSummary";
import { useRingGoals } from "./components/useRingGoals";
import WatchMofuDisplay from "./components/WatchMofuDisplay";
import CenterAssetRing from "./components/CenterAssetRing";
import ExtraRingLayer from "./components/ExtraRingLayer";
import AddRingButton from "./components/AddRingButton";
import HeaderBar from "./components/HeaderBar";
import ActionBar from "./components/ActionBar";
import { useQuickAddSave } from "./components/useQuickAddSave";
import { useBackupManager } from "./components/useBackupManager";
import { useCenterAssetCard } from "./components/useCenterAssetCard";
import { useResponsiveLayout } from "./components/useResponsiveLayout";
import { useCategoryLabels } from "./components/useCategoryLabels";
import { useOrbitPositions } from "./components/useOrbitPositions";
import { useOrbitDrag } from "./components/useOrbitDrag";
import { useReportActions } from "./components/useReportActions";
import { useClientReady } from "./components/useClientReady";
import TransactionsModals from "./components/TransactionsModals";

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
  const { mounted, asOf } = useClientReady();
  const [selectedRing, setSelectedRing] = useState<string | null>(null);
  const [orbitOffset, setOrbitOffset] = useState(0);
  const {
  onTouchStart,
  onTouchMove,
  onTouchEnd,
} = useOrbitDrag({
  orbitOffset,
  setOrbitOffset,
});
  const [mainView, setMainView] = useState<"input" | "history">("input");
  const {userKey,setUserKey,userIdOpen,setUserIdOpen,copied,pasteKey,setPasteKey,pasteName,
setPasteName,currentName,keyEditingOpen,setKeyEditingOpen,userKeyInput,setUserKeyInput,hardReload,
copyText,applyPastedKey,applyUserKey,regenerateUserKey,} = useUserKeyManager();

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
const { exportBackup, importBackup } = useBackupManager({
  userKey,
  nowYm,
  selectedYm,
  transactions,
  ringGoals,
  extraRings,
  holdings,
  setUserKey,
  setSelectedYm,
  setExtraRings,
  setRingGoals,
  setTransactions,
  setHoldings,
  hardReload,
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
const { centerCard } = useCenterAssetCard({
  totalAssetBalance,
  targetBalance,
});
const {
  isMobile,
  bigSize,
  strokeBig,
  strokeSmall,
  outwardBig,
  outwardSmall,
  areaH,
} = useResponsiveLayout();
const layoutRef = useRef<HTMLDivElement | null>(null);

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
  // ✅ List表示用：categoryを人間向けラベルにする
  // =========================
  const { resolveCategoryLabel } = useCategoryLabels({
  extraRings,
  fixedLifeKey: FIXED_LIFE_KEY,
  fixedSaveKey: FIXED_SAVE_KEY,
});

const { extraPositions } = useOrbitPositions({
  extraRings,
  isMobile,
  selectedRing,
  orbitOffset,
});

  // =========================
  // ✅ 固定リングの長押し
  // =========================
  const lpGoalAsset = useLongPressHandlers(() => openGoalEditor(GOAL_ASSET_KEY), 650);
  const { shouldIgnoreClick: shouldIgnoreAsset, ...lpGoalAssetProps } = lpGoalAsset;

const {
  openPrintView,
  exportMonthlyImage,
} = useReportActions({
  selectedYm,
  monthTransactions,
  monthSummary,
  resolveCategoryLabel,
});

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
      startEdit={setEditing}
      onBack={() => setMainView("input")}
    />
  );
}

  return (
    <div style={{ padding: 14 }}>
<TransactionsModals
  payoffModal={payoffModal}
  pendingGlowRingId={pendingGlowRingId}
  setPayoffModal={setPayoffModal}
  triggerRingGlow={triggerRingGlow}
  setPendingGlowRingId={setPendingGlowRingId}
  saveOverlay={saveOverlay}
  setSaveOverlay={setSaveOverlay}
  isMobile={isMobile}

  userIdOpen={userIdOpen}
  userKey={userKey}
  currentName={currentName}
  copied={copied}
  pasteKey={pasteKey}
  setPasteKey={setPasteKey}
  pasteName={pasteName}
  setPasteName={setPasteName}
  copyText={copyText}
  applyPastedKey={applyPastedKey}
  setUserIdOpen={setUserIdOpen}

  showUserKeyUi={SHOW_USERKEY_UI}
  keyEditingOpen={keyEditingOpen}
  userKeyInput={userKeyInput}
  setUserKeyInput={setUserKeyInput}
  applyUserKey={applyUserKey}
  regenerateUserKey={regenerateUserKey}
  setKeyEditingOpen={setKeyEditingOpen}
  createOpen={createOpen}
createTitle={createTitle}
setCreateTitle={setCreateTitle}
createMode={createMode}
setCreateMode={setCreateMode}
createCarryOver={createCarryOver}
setCreateCarryOver={setCreateCarryOver}
saveCreate={saveCreate}
setCreateOpen={setCreateOpen}

extraEditId={extraEditId}
extraDraft={extraDraft}
setExtraDraft={setExtraDraft}
saveExtraEdit={saveExtraEdit}
setExtraEditId={setExtraEditId}
removeExtraRing={removeExtraRing}
goalModalOpen={goalModalOpen}
goalFocusCategory={goalFocusCategory}
goalAssetKey={GOAL_ASSET_KEY}
ringCategories={[
  GOAL_ASSET_KEY,
  ringCategory(FIXED_LIFE_KEY),
  ringCategory(FIXED_SAVE_KEY),
  ...extraRings.map((ring) =>
    ringCategory(ring.ringKey)
  ),
]}
resolveCategoryLabel={resolveCategoryLabel}
closeGoalEditor={closeGoalEditor}
quickAddOpen={quickAddOpen}
quickMeta={getQuickMeta()}
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
startEdit={setEditing}
parseAmountLike={parseAmountLike}
makeId={makeId}
ringCategory={ringCategory}

/>
<h1
  style={{
    margin: "0 0 12px",
    fontSize: 32,
    fontWeight: 900,
  }}
>
  みやむMaker TEST
</h1>

      <HeaderBar
  selectedYm={selectedYm}
  setSelectedYm={setSelectedYm}
/>

      <div
      id="miyamu-report"
      ref={layoutRef}
      style={{
     maxWidth: 980,
     margin: "0 auto",
     }}
  >
         <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
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
<ActionBar
  exportMonthlyImage={exportMonthlyImage}
  openPrintView={openPrintView}
  exportBackup={exportBackup}
  importFileRef={importFileRef}
  importBackup={importBackup}
  setMainView={setMainView}
/>
      </div>
    </div>
  );
}