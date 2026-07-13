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

  const selectedYmKey = useMemo(() => {
    const key = userKey || "anonymous";
    return `miyamu_selected_ym:${key}`;
  }, [userKey]);

  const [selectedYm, setSelectedYm] = useState(() => {
    if (typeof window === "undefined") {
      return nowYm;
    }

    try {
      const saved = localStorage.getItem(
        "miyamu_selected_ym:anonymous"
      );

      return saved || nowYm;
    } catch {
      return nowYm;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(selectedYmKey);

      if (saved) {
        setSelectedYm(saved);
      } else {
        setSelectedYm(nowYm);
      }
    } catch {
      setSelectedYm(nowYm);
    }
  }, [selectedYmKey, nowYm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(selectedYmKey, selectedYm);
    } catch (error) {
      console.error("selectedYm save failed:", error);
    }
  }, [selectedYmKey, selectedYm]);

  const selectedEnd = useMemo(
    () => endOfMonthYMD(selectedYm),
    [selectedYm]
  );

  const monthTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const ymd = (transaction.occurredAt ?? "").slice(0, 10);

      if (!ymd) return false;

      return ymdToMonthKey(ymd) === selectedYm;
    });
  }, [transactions, selectedYm]);

  const carryOverTransactions = useMemo(() => {
    return transactions.filter((transaction) => {
      const ymd = (transaction.occurredAt ?? "").slice(0, 10);

      if (!ymd) return false;

      return ymd <= selectedEnd;
    });
  }, [transactions, selectedEnd]);

  const monthSummary = useMemo(
    () => calcSummary(monthTransactions),
    [monthTransactions]
  );

  const monthStorageKey = useMemo(() => {
    const key = userKey || "anonymous";
    return `miyamu_month:${key}:${selectedYm}`;
  }, [userKey, selectedYm]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      localStorage.setItem(
        monthStorageKey,
        JSON.stringify(monthTransactions)
      );
    } catch (error) {
      console.error("month transactions save failed:", error);
    }
  }, [monthStorageKey, monthTransactions]);

  return {
    nowYm,
    selectedYm,
    setSelectedYm,
    monthTransactions,
    carryOverTransactions,
    monthSummary,
  };
}