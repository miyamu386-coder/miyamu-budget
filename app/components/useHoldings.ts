"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
  if (!userKey) return;

  setLoaded(false);

  try {
    const raw = localStorage.getItem(holdingsStorageKey);
    if (!raw) {
      setHoldings([]);
      return;
    }

    const arr = JSON.parse(raw) as Holding[];
    setHoldings(Array.isArray(arr) ? arr : []);
  } catch (e) {
    console.warn("holdings load failed", e);
    setHoldings([]);
  } finally {
    setLoaded(true);
  }
}, [userKey, holdingsStorageKey]);

  useEffect(() => {
  if (!userKey) return;
  if (!loaded) return;

  try {
    localStorage.setItem(holdingsStorageKey, JSON.stringify(holdings));
  } catch (e) {
    console.warn("holdings save failed", e);
  }
}, [userKey, holdingsStorageKey, holdings, loaded]);

  const holdingsTotal = useMemo(() => {
    return holdings.reduce((sum, h) => sum + h.value, 0);
  }, [holdings]);
  const getHoldingValue = useCallback(
  (ringKey: string) => {
    return holdings
      .filter((h) => h.ringKey === ringKey)
      .reduce((sum, h) => sum + h.value, 0);
  },
  [holdings]
);
  return {
  holdings,
  setHoldings,
  holdingsTotal,
  getHoldingValue,
};
}
