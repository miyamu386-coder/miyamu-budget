"use client";

import { useEffect, useMemo, useState } from "react";

export type HoldingKind = "国内株" | "米国ETF" | "投資信託" | "現金";

export type Holding = {
  id: string;
  ringKey: string;
  name: string;
  shares: number;
  unit?: "株" | "口";
  value: number;
  kind?: HoldingKind;
};

export function useHoldings(userKey: string) {
  const holdingsStorageKey = useMemo(() => {
    const k = userKey || "anonymous";
    return `miyamu_holdings_v1:${k}`;
  }, [userKey]);

  const [holdings, setHoldings] = useState<Holding[]>([]);

  useEffect(() => {
    if (!userKey) return;

    try {
      const raw = localStorage.getItem(holdingsStorageKey);
      if (!raw) return;

      const arr = JSON.parse(raw) as Holding[];
      if (!Array.isArray(arr)) return;

      setHoldings(arr);
    } catch (e) {
      console.warn("holdings load failed", e);
    }
  }, [userKey, holdingsStorageKey]);

  useEffect(() => {
    if (!userKey) return;

    try {
      localStorage.setItem(holdingsStorageKey, JSON.stringify(holdings));
    } catch (e) {
      console.warn("holdings save failed", e);
    }
  }, [userKey, holdingsStorageKey, holdings]);

  const holdingsTotal = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.value, 0);
  }, [holdings]);
  const getHoldingValue = (ringKey: string) => {
  return holdings
    .filter((h) => h.ringKey === ringKey)
    .reduce((sum, h) => sum + h.value, 0);
};
  return {
  holdings,
  setHoldings,
  holdingsTotal,
  getHoldingValue,
};
}
