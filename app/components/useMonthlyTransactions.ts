"use client";

import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "../types";
import {
  endOfMonthYMD,
  todayYMD,
  ymdToMonthKey,
} from "../../lib/dateUtils";
import { calcSummary } from "../../lib/transactions";

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
  const [selectedYmLoaded, setSelectedYmLoaded] =
    useState(false);

  // userKey確定後に、保存済みの年月を読み込む
  useEffect(() => {
    if (!userKey) return;

    setSelectedYmLoaded(false);

    try {
      const saved = localStorage.getItem(selectedYmKey);
      setSelectedYm(saved || nowYm);
    } catch (error) {
      console.error("selectedYm load failed:", error);
      setSelectedYm(nowYm);
    } finally {
      setSelectedYmLoaded(true);
    }
  }, [userKey, selectedYmKey, nowYm]);

  // 読み込み完了後に、選択中の年月を保存する
  useEffect(() => {
    if (!userKey) return;
    if (!selectedYmLoaded) return;

    try {
      localStorage.setItem(selectedYmKey, selectedYm);
    } catch (error) {
      console.error("selectedYm save failed:", error);
    }
  }, [
    userKey,
    selectedYmKey,
    selectedYm,
    selectedYmLoaded,
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
    return transactions.filter((transaction) => {
      const ymd = (transaction.occurredAt ?? "").slice(0, 10);

      if (!ymd) return false;

      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  // =========================
  // 選択月末までの累計取引
  // =========================
  const carryOverTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const ymd = (transaction.occurredAt ?? "").slice(0, 10);

      if (!ymd) return false;

      return ymd <= selectedEnd;
    });
  }, [transactions, selectedEnd]);

  // =========================
  // 選択月の収支
  // =========================
  const monthSummary = useMemo(() => {
    return calcSummary(monthTransactions);
  }, [monthTransactions]);

  // =========================
  // 月別取引のローカル保存
  // =========================
  const monthStorageKey = useMemo(() => {
    return `miyamu_month:${userKey}:${selectedYm}`;
  }, [userKey, selectedYm]);

  useEffect(() => {
    if (!userKey) return;
    if (!selectedYmLoaded) return;

    try {
      localStorage.setItem(
        monthStorageKey,
        JSON.stringify(monthTransactions)
      );
    } catch (error) {
      console.error(
        "month transactions save failed:",
        error
      );
    }
  }, [
    userKey,
    selectedYmLoaded,
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