"use client";

import { useRef, useState } from "react";
import type { Transaction } from "./types";
import {
  makeId,
  ringCategory,
} from "../lib/ringUtils";
import { parseAmountLike } from "../lib/amount";
import { useLongPressHandlers } from "../lib/useLongPressHandlers";
import MakerBottomNavigation, {
  type MakerTab,
} from "./components/MakerBottomNavigation";
import MakerReportView from "./components/MakerReportView";
import MakerMyPageView from "./components/MakerMyPageView";
import { useHoldings } from "./components/useHoldings";
import { useExtraRings } from "./components/useExtraRings";
import { useTransactions } from "./components/useTransactions";
import TransactionHistoryView from "./components/TransactionHistoryView";
import { useUserKeyManager } from "./components/useUserKeyManager";
import { useMonthlyTransactions } from "./components/useMonthlyTransactions";
import { useSaveEffects } from "./components/useSaveEffects";
import { useRingEditor } from "./components/useRingEditor";
import { useQuickAdd } from "./components/useQuickAdd";
import { useRingSummary } from "./components/useRingSummary";
import { useRingGoals } from "./components/useRingGoals";
import WatchMofuDisplay from "./components/WatchMofuDisplay";
import CenterAssetRing from "./components/CenterAssetRing";
import ExtraRingLayer from "./components/ExtraRingLayer";
import RingManagementView from "./components/RingManagementView";
import HeaderBar from "./components/HeaderBar";
import { useQuickAddSave } from "./components/useQuickAddSave";
import { useBackupManager } from "./components/useBackupManager";
import { useCenterAssetCard } from "./components/useCenterAssetCard";
import { useResponsiveLayout } from "./components/useResponsiveLayout";
import { useCategoryLabels } from "./components/useCategoryLabels";
import { useOrbitDrag } from "./components/useOrbitDrag";
import { useOrbitPositions } from "./components/useOrbitPositions";
import { useReportActions } from "./components/useReportActions";
import { useClientReady } from "./components/useClientReady";
import TransactionsModals from "./components/TransactionsModals";


type Props = {
  initialTransactions: Transaction[];
};

// ✅ 本番(Vercel)では userKey UI を出さない
// ローカル開発だけ表示
const SHOW_USERKEY_UI =
  process.env.NODE_ENV !== "production";

// ✅ 安全設計：固定3 + 追加10 = 合計13
const FIXED_LIFE_KEY = "life";
const FIXED_SAVE_KEY = "save";
const GOAL_ASSET_KEY = "ring:asset";

export default function TransactionsClient({
  initialTransactions,
}: Props) {
  const [editing, setEditing] =
    useState<Transaction | null>(null);

  const importFileRef =
    useRef<HTMLInputElement | null>(null);

  const { mounted, asOf } =
    useClientReady();

  const [selectedRing, setSelectedRing] =
    useState<string | null>(null);
  const [orbitOffset, setOrbitOffset] =
    useState(0);

  const {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  } = useOrbitDrag({
    orbitOffset,
    setOrbitOffset,
  });


  const [mainView, setMainView] =
    useState<"input" | "history">("input");
  const [makerTab, setMakerTab] =
    useState<MakerTab>("home");
  const [isExportingReport, setIsExportingReport] =
    useState(false);
  const [homeView, setHomeView] =
    useState<"rings" | "manage">("manage");
  const [detectiveMofuOpen, setDetectiveMofuOpen] =
    useState(false);

  // =========================
  // ユーザーキー
  // =========================
  const {
    userKey,
    setUserKey,
    userIdOpen,
    setUserIdOpen,
    copied,
    pasteKey,
    setPasteKey,
    pasteName,
    setPasteName,
    currentName,
    keyEditingOpen,
    setKeyEditingOpen,
    userKeyInput,
    setUserKeyInput,
    hardReload,
    copyText,
    applyPastedKey,
    applyUserKey,
    regenerateUserKey,
  } = useUserKeyManager();

  // =========================
  // ✅ 取引データ永続化
  // Web → localStorage
  // iOS → Preferences
  // =========================
  const {
    transactions,
    setTransactions,
  } = useTransactions(
    userKey,
    initialTransactions
  );
  const updateTransactionAmount = (
    id: number,
    amount: number
  ) => {
    setTransactions((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, amount }
          : t
      )
    );
  };

  // =========================
  // ✅ A案：
  // 月次（生活費） vs 累計（貯蓄/返済）
  // =========================
  const {
    nowYm,
    selectedYm,
    setSelectedYm,
    monthTransactions,
    carryOverTransactions,
    monthSummary,
  } = useMonthlyTransactions(
    transactions,
    userKey
  );

  // =========================
  // ✅ 追加リング（永続化）
  // =========================
  const {
    extraRings,
    setExtraRings,
    maxExtraRings,
    canAddExtra,
  } = useExtraRings(userKey);

  // =========================
  // ✅ 保有資産（永続化）
  // =========================
  const {
    holdings,
    setHoldings,
    getHoldingValue,
  } = useHoldings(userKey);

  // =========================
  // ✅ 目標編集モーダル
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
  // ✅ バックアップ
  // =========================
  const {
    exportBackup,
    importBackup,
  } = useBackupManager({
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

  const { centerCard } =
    useCenterAssetCard({
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

  const layoutRef =
    useRef<HTMLDivElement | null>(null);

  // =========================
  // ✅ クイック入力
  // =========================
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

  // =========================
  // ✅ 保存演出
  // =========================
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

  const {
    saveQuickAdd,
  } = useQuickAddSave({
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

  // =========================
  // ✅ リング編集
  // =========================
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
  // ✅ category表示名
  // =========================
  const {
    resolveCategoryLabel,
  } = useCategoryLabels({
    extraRings,
    fixedLifeKey: FIXED_LIFE_KEY,
    fixedSaveKey: FIXED_SAVE_KEY,
  });

  // =========================
  // ✅ リング配置
  // =========================
  const {
    extraPositions,
  } = useOrbitPositions({
    extraRings,
    isMobile,
    selectedRing,
    orbitOffset,
  });

  // =========================
  // ✅ 固定リング長押し
  // =========================
  const lpGoalAsset =
    useLongPressHandlers(
      () => {
        setDetectiveMofuOpen(true);

        window.setTimeout(() => {
          setDetectiveMofuOpen(false);
        }, 3000);
      },
      650
    );

  const {
    shouldIgnoreClick:
    shouldIgnoreAsset,
    ...lpGoalAssetProps
  } = lpGoalAsset;

  // =========================
  // ✅ レポート
  // =========================
  const {
    openPrintView,
    exportMonthlyImage,
  } = useReportActions({
    selectedYm,
    monthTransactions,
    monthSummary,
    resolveCategoryLabel,
  });
  const handleExportMonthlyImage =
    async () => {
      setIsExportingReport(true);

      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      });

      try {
        await exportMonthlyImage();
      } finally {
        setIsExportingReport(false);
      }
    };


  if (!mounted) return null;



  // =========================
  // メイン画面
  // =========================
  return (
    <div style={{ padding: 14 }}>
      <TransactionsModals
        payoffModal={payoffModal}
        pendingGlowRingId={
          pendingGlowRingId
        }
        setPayoffModal={
          setPayoffModal
        }
        triggerRingGlow={
          triggerRingGlow
        }
        setPendingGlowRingId={
          setPendingGlowRingId
        }
        saveOverlay={saveOverlay}
        setSaveOverlay={
          setSaveOverlay
        }
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
        applyPastedKey={
          applyPastedKey
        }
        setUserIdOpen={
          setUserIdOpen
        }

        showUserKeyUi={
          SHOW_USERKEY_UI
        }
        keyEditingOpen={
          keyEditingOpen
        }
        userKeyInput={userKeyInput}
        setUserKeyInput={
          setUserKeyInput
        }
        applyUserKey={applyUserKey}
        regenerateUserKey={
          regenerateUserKey
        }
        setKeyEditingOpen={
          setKeyEditingOpen
        }

        createOpen={createOpen}
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
        saveCreate={saveCreate}
        setCreateOpen={
          setCreateOpen
        }

        extraEditId={extraEditId}
        extraDraft={extraDraft}
        setExtraDraft={
          setExtraDraft
        }
        saveExtraEdit={
          saveExtraEdit
        }
        setExtraEditId={
          setExtraEditId
        }
        removeExtraRing={
          removeExtraRing
        }

        goalModalOpen={
          goalModalOpen
        }
        goalFocusCategory={
          goalFocusCategory
        }
        goalAssetKey={
          GOAL_ASSET_KEY
        }
        ringCategories={[
          GOAL_ASSET_KEY,
          ringCategory(
            FIXED_LIFE_KEY
          ),
          ringCategory(
            FIXED_SAVE_KEY
          ),
          ...extraRings.map(
            (ring) =>
              ringCategory(
                ring.ringKey
              )
          ),
        ]}
        resolveCategoryLabel={
          resolveCategoryLabel
        }
        closeGoalEditor={
          closeGoalEditor
        }

        quickAddOpen={
          quickAddOpen
        }
        quickMeta={getQuickMeta()}
        quickView={quickView}
        setQuickView={setQuickView}
        quickType={quickType}
        setQuickType={setQuickType}
        quickDate={quickDate}
        setQuickDate={setQuickDate}
        quickAmountStr={
          quickAmountStr
        }
        setQuickAmountStr={
          setQuickAmountStr
        }
        quickDetail={quickDetail}
        setQuickDetail={
          setQuickDetail
        }
        isSavingQuick={
          isSavingQuick
        }
        selectedYm={selectedYm}
        transactions={
          transactions
        }
        holdings={holdings}
        setHoldings={setHoldings}
        closeQuickAdd={
          closeQuickAdd
        }
        saveQuickAdd={saveQuickAdd}
        startEdit={setEditing}
        updateTransactionAmount={updateTransactionAmount}
        parseAmountLike={
          parseAmountLike
        }
        makeId={makeId}
        ringCategory={
          ringCategory
        }
      />

      {makerTab === "home" &&
        homeView === "rings" && (
          <div
            style={{
              position: "relative",
              zIndex: 4,
            }}
          >
            <HeaderBar
              selectedYm={selectedYm}
              setSelectedYm={
                setSelectedYm
              }
            />
          </div>
        )}

      <div
        id="miyamu-report"
        ref={layoutRef}
        className="maker-ring-fixed"
        style={{
          pointerEvents:
            makerTab === "home" &&
              homeView === "rings"
              ? "auto"
              : "none",
          zIndex:
            (makerTab === "home" &&
              homeView === "rings") ||
              isExportingReport
              ? 3
              : 0,
          visibility:
            (makerTab === "home" &&
              homeView === "rings") ||
              isExportingReport
              ? "visible"
              : "hidden",
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

          <CenterAssetRing
            centerCard={centerCard}
            totalAssetBalance={
              totalAssetBalance
            }
            isMobile={isMobile}
            bigSize={bigSize}
            strokeBig={strokeBig}
            outwardBig={outwardBig}
            longPressProps={
              lpGoalAssetProps
            }
            shouldIgnoreClick={
              shouldIgnoreAsset
            }
          />
          {detectiveMofuOpen && (
            <div
              style={{
                position: "absolute",
                left: "50%",
                top: isMobile ? "95px" : "80px",
                transform: "translateX(-50%)",
                zIndex: 40,
                pointerEvents: "none",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                animation:
                  "detectiveMofuAppear 220ms ease-out both",
              }}
            >
              <div
                style={{
                  position: "relative",
                  marginBottom: 8,
                  padding: "10px 14px",
                  borderRadius: 14,
                  background: "rgba(255,255,255,0.96)",
                  border:
                    "1px solid rgba(0,0,0,0.10)",
                  boxShadow:
                    "0 10px 24px rgba(0,0,0,0.14)",
                  fontSize: isMobile ? 14 : 16,
                  fontWeight: 900,
                  whiteSpace: "nowrap",
                }}
              >
                資産状況、確認しろよ？

                <div
                  style={{
                    position: "absolute",
                    left: "50%",
                    bottom: -7,
                    transform:
                      "translateX(-50%) rotate(45deg)",
                    width: 14,
                    height: 14,
                    background:
                      "rgba(255,255,255,0.96)",
                    borderRight:
                      "1px solid rgba(0,0,0,0.10)",
                    borderBottom:
                      "1px solid rgba(0,0,0,0.10)",
                  }}
                />
              </div>

              <img
                src="/mofu-detective-chibi.png"
                alt="探偵モフ"
                style={{
                  width: isMobile ? 150 : 220,
                  height: "auto",
                  filter:
                    "drop-shadow(0 14px 24px rgba(0,0,0,0.18))",
                }}
              />
            </div>
          )}
          <ExtraRingLayer
            extraPositions={
              extraPositions
            }
            extraRings={extraRings}
            extraComputed={
              extraComputed
            }
            ringGoals={ringGoals}
            glowRingId={glowRingId}
            selectedRing={
              selectedRing
            }
            isMobile={isMobile}
            strokeSmall={
              strokeSmall
            }
            outwardSmall={
              outwardSmall
            }
            asOf={asOf}
            getRingSums={
              getRingSums
            }
            openHoldingsView={
              openHoldingsView
            }
            openQuickAdd={
              openQuickAdd
            }
            openGoalEditor={
              openGoalEditor
            }
            setSelectedRing={
              setSelectedRing
            }
          />
          <style jsx>{`
  @keyframes detectiveMofuAppear {
    from {
      opacity: 0;
      transform:
        translateX(-50%)
        translateY(14px)
        scale(0.96);
    }

    to {
      opacity: 1;
      transform:
        translateX(-50%)
        translateY(0)
        scale(1);
    }
  }
`}</style>
        </div>
      </div>

      {makerTab === "home" &&
        homeView === "manage" && (
          <RingManagementView
            extraRings={extraRings}
            canAddExtra={canAddExtra}
            maxExtraRings={maxExtraRings}
            onOpenCreate={openCreate}
            onOpenEdit={openExtraEdit}
            onBack={() =>
              setHomeView("rings")
            }
          />
        )}

      {makerTab === "report" && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            minHeight: "100vh",
            background: "#fff",
          }}
        >
          {mainView === "history" ? (
            <TransactionHistoryView
              selectedYm={selectedYm}
              setSelectedYm={setSelectedYm}
              transactions={monthTransactions}
              editing={editing}
              setEditing={setEditing}
              setTransactions={setTransactions}
              resolveCategoryLabel={
                resolveCategoryLabel
              }
              startEdit={setEditing}
              onBack={() =>
                setMainView("input")
              }
            />
          ) : (
            <MakerReportView
              onOpenHistory={() =>
                setMainView("history")
              }
              onExportMonthlyImage={
                handleExportMonthlyImage
              }
              onOpenPrintView={
                openPrintView
              }
            />
          )}
        </div>
      )}

      {makerTab === "mypage" && (
        <MakerMyPageView
          exportBackup={exportBackup}
          importFileRef={importFileRef}
          importBackup={importBackup}
        />
      )}

      <MakerBottomNavigation
        activeTab={makerTab}
        onChange={(tab) => {
          if (tab === "home") {
            setMakerTab("home");
            setHomeView("manage");
            return;
          }

          setMakerTab(tab);
          setHomeView("rings");
        }}
      />
    </div>
  );
}