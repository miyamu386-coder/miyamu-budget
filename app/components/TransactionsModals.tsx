"use client";

import type {
  ComponentProps,
  Dispatch,
  SetStateAction,
} from "react";
import PayoffModal from "./PayoffModal";
import SaveCharaOverlay from "./SaveCharaOverlay";
import UserIdModal from "./UserIdModal";
import KeyEditingPanel from "./KeyEditingPanel";
import CreateRingModal from "./CreateRingModal";
import EditRingModal from "./EditRingModal";
import type { RingMode } from "../../lib/ringUtils";
import GoalModal from "./GoalModal";
import QuickAddModal from "./QuickAddModal";

type Props = {
  payoffModal: any;
  pendingGlowRingId: string | null;
  setPayoffModal: (value: any) => void;
  triggerRingGlow: (id: string) => void;
  setPendingGlowRingId: Dispatch<
    SetStateAction<string | null>
  >;

  saveOverlay: any;
  setSaveOverlay: (value: any) => void;
  isMobile: boolean;

  userIdOpen: boolean;
  userKey: string;
  currentName: string;
  copied: boolean;
  pasteKey: string;
  setPasteKey: Dispatch<SetStateAction<string>>;
  pasteName: string;
  setPasteName: Dispatch<SetStateAction<string>>;
  copyText: ComponentProps<
    typeof UserIdModal
  >["onCopy"];
  applyPastedKey: () => void;
  setUserIdOpen: Dispatch<
    SetStateAction<boolean>
  >;

  createOpen: boolean;
  createTitle: string;
  setCreateTitle: Dispatch<
    SetStateAction<string>
  >;
  createMode: RingMode;
  setCreateMode: Dispatch<SetStateAction<RingMode>>;
  createCarryOver: boolean;
  setCreateCarryOver: Dispatch<
    SetStateAction<boolean>
  >;
  saveCreate: () => void;
  setCreateOpen: Dispatch<
    SetStateAction<boolean>
  >;

  extraEditId: string | null;
  extraDraft: any;
  setExtraDraft: Dispatch<
    SetStateAction<any>
  >;
  saveExtraEdit: () => void;
  setExtraEditId: Dispatch<
    SetStateAction<string | null>
  >;
  removeExtraRing: () => void;
  quickAddOpen: boolean;
  quickMeta: any;
  quickView: ComponentProps<
    typeof QuickAddModal
  >["quickView"];

  setQuickView: ComponentProps<
    typeof QuickAddModal
  >["setQuickView"];

  quickType: ComponentProps<
    typeof QuickAddModal
  >["quickType"];

  setQuickType: ComponentProps<
    typeof QuickAddModal
  >["setQuickType"];
  quickDate: string;
  setQuickDate: Dispatch<SetStateAction<string>>;
  quickAmountStr: string;
  setQuickAmountStr: Dispatch<SetStateAction<string>>;
  quickDetail: string;
  setQuickDetail: Dispatch<SetStateAction<string>>;
  isSavingQuick: boolean;
  selectedYm: string;
  transactions: any[];
  holdings: any[];
  setHoldings: Dispatch<SetStateAction<any[]>>;
  closeQuickAdd: () => void;
  saveQuickAdd: () => void;
  startEdit: (value: any) => void;
  updateTransactionAmount: (
    id: number,
    amount: number
  ) => void;
  parseAmountLike: typeof import("../../lib/amount").parseAmountLike;
  makeId: typeof import("../../lib/ringUtils").makeId;
  ringCategory: typeof import("../../lib/ringUtils").ringCategory;

  showUserKeyUi: boolean;
  keyEditingOpen: boolean;
  userKeyInput: string;
  setUserKeyInput: Dispatch<
    SetStateAction<string>
  >;
  applyUserKey: () => void;
  regenerateUserKey: () => void;
  setKeyEditingOpen: Dispatch<
    SetStateAction<boolean>
  >;
  goalModalOpen: boolean;
  goalFocusCategory: string | null;
  goalAssetKey: string;
  ringCategories: string[];
  resolveCategoryLabel: (category: string) => string;
  closeGoalEditor: () => void;
};

export default function TransactionsModals({
  payoffModal,
  pendingGlowRingId,
  setPayoffModal,
  triggerRingGlow,
  setPendingGlowRingId,

  saveOverlay,
  setSaveOverlay,
  isMobile,

  userIdOpen,
  userKey,
  currentName,
  copied,
  pasteKey,
  setPasteKey,
  pasteName,
  setPasteName,
  copyText,
  applyPastedKey,
  setUserIdOpen,

  createOpen,
  createTitle,
  setCreateTitle,
  createMode,
  setCreateMode,
  createCarryOver,
  setCreateCarryOver,
  saveCreate,
  setCreateOpen,

  extraEditId,
  extraDraft,
  setExtraDraft,
  saveExtraEdit,
  setExtraEditId,
  removeExtraRing,
  quickAddOpen,
  quickMeta,
  quickView,
  setQuickView,
  quickType,
  setQuickType,
  quickDate,
  setQuickDate,
  quickAmountStr,
  setQuickAmountStr,
  quickDetail,
  setQuickDetail,
  isSavingQuick,
  selectedYm,
  transactions,
  holdings,
  setHoldings,
  closeQuickAdd,
  saveQuickAdd,
  startEdit,
  updateTransactionAmount,
  parseAmountLike,
  makeId,
  ringCategory,

  showUserKeyUi,
  keyEditingOpen,
  userKeyInput,
  setUserKeyInput,
  applyUserKey,
  regenerateUserKey,
  setKeyEditingOpen,
  goalModalOpen,
  goalFocusCategory,
  goalAssetKey,
  ringCategories,
  resolveCategoryLabel,
  closeGoalEditor,

}: Props) {
  return (
    <>
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
                triggerRingGlow(
                  pendingGlowRingId
                );
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
          onClose={() =>
            setSaveOverlay(null)
          }
        />
      )}

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
          onClose={() =>
            setUserIdOpen(false)
          }
        />
      )}

      {showUserKeyUi &&
        keyEditingOpen && (
          <KeyEditingPanel
            userKeyInput={userKeyInput}
            setUserKeyInput={
              setUserKeyInput
            }
            applyUserKey={applyUserKey}
            regenerateUserKey={
              regenerateUserKey
            }
            onClose={() =>
              setKeyEditingOpen(false)
            }
          />
        )}

      {createOpen && (
        <CreateRingModal
          createTitle={createTitle}
          setCreateTitle={
            setCreateTitle
          }
          createMode={createMode}
          setCreateMode={setCreateMode}
          createCarryOver={
            createCarryOver
          }
          setCreateCarryOver={
            setCreateCarryOver
          }
          onSave={saveCreate}
          onClose={() =>
            setCreateOpen(false)
          }
        />
      )}

      {extraEditId && (
        <EditRingModal
          extraDraft={extraDraft}
          setExtraDraft={setExtraDraft}
          onSave={saveExtraEdit}
          onClose={() =>
            setExtraEditId(null)
          }
          onRemove={removeExtraRing}
        />
      )}
      {goalModalOpen && (
        <GoalModal
          userKey={userKey}
          goalFocusCategory={goalFocusCategory}
          goalAssetKey={goalAssetKey}
          ringCategories={ringCategories}
          resolveLabel={(cat) => {
            if (cat === goalAssetKey) {
              return "総資産 目標";
            }

            return resolveCategoryLabel(cat);
          }}
          onClose={closeGoalEditor}
        />
      )}
      {quickAddOpen && (
        <QuickAddModal
          meta={quickMeta}
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
          updateTransactionAmount={updateTransactionAmount}
          parseAmountLike={parseAmountLike}
          makeId={makeId}
          ringCategory={ringCategory}
        />
      )}
    </>
  );
}