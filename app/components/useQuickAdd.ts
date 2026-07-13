"use client";

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Transaction } from "../types";
import type { ExtraRing, RingMode } from "../../lib/ringUtils";
import { ringCategory } from "../../lib/ringUtils";
import { todayYMD } from "../../lib/dateUtils";
import { parseAmountLike } from "../../lib/amount";
import { createTransactionApi } from "../../lib/transactionApi";

export type TxType = "income" | "expense";

export type QuickView =
  | "form"
  | "history"
  | "holdings";

export type QuickAddTarget =
  | { kind: "life" }
  | { kind: "save" }
  | { kind: "extra"; id: string }
  | null;

export type QuickMeta = {
  ringKey: string;
  title: string;
  mode: RingMode;
};

type UseQuickAddParams = {
  userKey: string;
  extraRings: ExtraRing[];
  fixedLifeKey: string;
  fixedSaveKey: string;
  setTransactions: Dispatch<
    SetStateAction<Transaction[]>
  >;
  setSelectedRing: Dispatch<
    SetStateAction<string | null>
  >;
};

export function useQuickAdd({
  userKey,
  extraRings,
  fixedLifeKey,
  fixedSaveKey,
  setTransactions,
  setSelectedRing,
}: UseQuickAddParams) {
  const [quickAddOpen, setQuickAddOpen] =
    useState(false);

  const [quickView, setQuickView] =
    useState<QuickView>("form");

  const [quickTarget, setQuickTarget] =
    useState<QuickAddTarget>(null);

  const [quickType, setQuickType] =
    useState<TxType>("expense");

  const [quickAmountStr, setQuickAmountStr] =
    useState("");

  const [quickDate, setQuickDate] =
    useState(todayYMD());

  const [quickDetail, setQuickDetail] =
    useState("");

  const [isSavingQuick, setIsSavingQuick] =
    useState(false);

  const openQuickAdd = (
    target: QuickAddTarget,
    defaultType: TxType
  ) => {
    setQuickTarget(target);
    setQuickType(defaultType);
    setQuickAmountStr("");
    setQuickDetail("");
    setQuickDate(todayYMD());
    setIsSavingQuick(false);
    setQuickView("form");
    setQuickAddOpen(true);
  };

  const openHoldingsView = (id: string) => {
    setQuickTarget({
      kind: "extra",
      id,
    });
    setQuickView("holdings");
    setQuickAddOpen(true);
  };

  const closeQuickAdd = () => {
    setQuickAddOpen(false);
    setQuickTarget(null);
    setIsSavingQuick(false);
  };

  const getQuickMeta = (): QuickMeta | null => {
    if (!quickTarget) {
      return null;
    }

    if (quickTarget.kind === "life") {
      return {
        ringKey: fixedLifeKey,
        title: "生活費",
        mode: "expense_only",
      };
    }

    if (quickTarget.kind === "save") {
      return {
        ringKey: fixedSaveKey,
        title: "貯蓄（今月）",
        mode: "income_only",
      };
    }

    const ring = extraRings.find(
      (item) => item.id === quickTarget.id
    );

    if (!ring) {
      return null;
    }

    return {
      ringKey: ring.ringKey,
      title: ring.title,
      mode: ring.mode,
    };
  };

  const saveQuickTransaction = async (): Promise<{
    transaction: Transaction;
    meta: QuickMeta;
    type: TxType;
    amount: number;
  }> => {
    if (isSavingQuick) {
      throw new Error(
        "quick transaction is already saving"
      );
    }

    const meta = getQuickMeta();

    if (!meta) {
      throw new Error(
        "リング情報が見つかりませんでした"
      );
    }

    const amount =
      parseAmountLike(quickAmountStr);

    if (amount <= 0) {
      throw new Error(
        "金額を入力してください（例: 50000 / 5万 / 1.2万）"
      );
    }

    const type: TxType =
      meta.mode === "income_only"
        ? "income"
        : meta.mode === "expense_only"
          ? "expense"
          : quickType;

    setIsSavingQuick(true);

    try {
      const transaction =
        await createTransactionApi(userKey, {
          type,
          amount,
          occurredAt: quickDate,
          category: ringCategory(meta.ringKey),
          detailCategory:
            quickDetail.trim()
              ? quickDetail.trim().slice(0, 24)
              : undefined,
        });

      setTransactions((previous) => [
        transaction,
        ...previous,
      ]);

      setSelectedRing(null);
      closeQuickAdd();

      return {
        transaction,
        meta,
        type,
        amount,
      };
    } catch (error) {
      setIsSavingQuick(false);
      throw error;
    }
  };

  return {
    quickAddOpen,
    setQuickAddOpen,

    quickView,
    setQuickView,

    quickTarget,
    setQuickTarget,

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
  };
}