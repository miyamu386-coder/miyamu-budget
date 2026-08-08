"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "../types";
import {
  endOfMonthYMD,
  todayYMD,
  ymdToMonthKey,
} from "../../lib/dateUtils";
import { calcSummary } from "../../lib/transactions";
import {
  getStoredValue,
  setStoredValue,
} from "../../lib/storage";

export function useMonthlyTransactions(
  transactions: Transaction[],
  userKey: string
) {
  const nowYm = ymdToMonthKey(todayYMD());

  // =========================
  // 選択中の年月
  // =========================
  const selectedYmKey = useMemo(() => {
    return `miyamu_selected_ym:${userKey}`;
  }, [userKey]);

  const [selectedYm, setSelectedYm] = useState(nowYm);

  const [loadedSelectedYmKey, setLoadedSelectedYmKey] =
    useState<string | null>(null);

  // =========================
  // 保存済み年月を読み込む
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    setLoadedSelectedYmKey(null);

    void (async () => {
      try {
        const saved =
          await getStoredValue(selectedYmKey);

        if (cancelled) return;

        setSelectedYm(saved || nowYm);

        setLoadedSelectedYmKey(
          selectedYmKey
        );
      } catch (error) {
        console.error(
          "selectedYm load failed:",
          error
        );

        if (!cancelled) {
          setSelectedYm(nowYm);

          setLoadedSelectedYmKey(
            selectedYmKey
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userKey,
    selectedYmKey,
    nowYm,
  ]);

  // =========================
  // 選択中の年月を保存
  // =========================
  useEffect(() => {
    if (!userKey) return;

    // 読み込み前の初期値で
    // 保存データを上書きしない
    if (
      loadedSelectedYmKey !==
      selectedYmKey
    ) {
      return;
    }

    void setStoredValue(
      selectedYmKey,
      selectedYm
    );
  }, [
    userKey,
    selectedYmKey,
    selectedYm,
    loadedSelectedYmKey,
  ]);

  // =========================
  // 選択月の末日
  // =========================
  const selectedEnd = useMemo(() => {
    return endOfMonthYMD(selectedYm);
  }, [selectedYm]);

  // =========================
  // 選択月だけの取引
  // =========================
  const monthTransactions = useMemo(() => {
    return transactions.filter(
      (transaction) => {
        if (!transaction) return false;

        const ymd = (
          transaction.occurredAt ?? ""
        ).slice(0, 10);

        if (!ymd) return false;

        return (
          ymdToMonthKey(ymd) ===
          selectedYm
        );
      }
    );
  }, [
    transactions,
    selectedYm,
  ]);

  // =========================
  // 選択月末までの累計取引
  // =========================
  const carryOverTransactions =
    useMemo(() => {
      return transactions.filter(
        (transaction) => {
          if (!transaction) {
            return false;
          }

          const ymd = (
            transaction.occurredAt ?? ""
          ).slice(0, 10);

          if (!ymd) return false;

          return ymd <= selectedEnd;
        }
      );
    }, [
      transactions,
      selectedEnd,
    ]);

  // =========================
  // 選択月の収支
  // =========================
  const monthSummary = useMemo(() => {
    return calcSummary(
      monthTransactions
    );
  }, [monthTransactions]);

  // =========================
  // 月別取引保存キー
  // =========================
  const monthStorageKey =
    useMemo(() => {
      return `miyamu_month:${userKey}:${selectedYm}`;
    }, [
      userKey,
      selectedYm,
    ]);

  // =========================
  // 月別取引を保存
  // =========================
  useEffect(() => {
    if (!userKey) return;

    if (
      loadedSelectedYmKey !==
      selectedYmKey
    ) {
      return;
    }

    void setStoredValue(
      monthStorageKey,
      JSON.stringify(
        monthTransactions
      )
    );
  }, [
    userKey,
    selectedYmKey,
    loadedSelectedYmKey,
    monthStorageKey,
    monthTransactions,
  ]);

  return {
    nowYm,
    selectedYm,
    setSelectedYm,
    monthTransactions,
    carryOverTransactions,
    monthSummary,
  };
}