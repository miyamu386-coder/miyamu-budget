"use client";

import { useCallback, useMemo } from "react";
import type { Transaction } from "../types";
import type { ExtraRing } from "../../lib/ringUtils";
import {
  buildCategorySums,
  getRingSumsFromMap,
} from "../../lib/ringCalculator";

type UseRingSummaryParams = {
  extraRings: ExtraRing[];
  monthTransactions: Transaction[];
  carryOverTransactions: Transaction[];
  getHoldingValue: (ringKey: string) => number;
};

export function useRingSummary({
  extraRings,
  monthTransactions,
  carryOverTransactions,
  getHoldingValue,
}: UseRingSummaryParams) {
  const sumByCategoryMonthly = useMemo(() => {
    return buildCategorySums(monthTransactions);
  }, [monthTransactions]);

  const sumByCategoryCarry = useMemo(() => {
    return buildCategorySums(carryOverTransactions);
  }, [carryOverTransactions]);

  const getRingSums = useCallback(
    (ringKey: string, useCarry: boolean) => {
      const map = useCarry
        ? sumByCategoryCarry
        : sumByCategoryMonthly;

      return getRingSumsFromMap(map, ringKey);
    },
    [sumByCategoryCarry, sumByCategoryMonthly]
  );

  const extraComputed = useMemo(() => {
    return extraRings.map((ring) => {
      const sums = getRingSums(
        ring.ringKey,
        Boolean(ring.carryOver)
      );

      const isSecuritiesRing =
        ring.title.includes("証券") ||
        ring.title.includes("株") ||
        ring.title.includes("投資");

      if (!isSecuritiesRing) {
        return {
          ...ring,
          sums,
        };
      }

      const holdingsValue = getHoldingValue(
        ring.ringKey
      );

      return {
        ...ring,
        sums: {
          ...sums,
          income: holdingsValue,
          expense: 0,
          balance: holdingsValue,
        },
      };
    });
  }, [
    extraRings,
    getHoldingValue,
    getRingSums,
  ]);

  const totalAssetBalance = useMemo(() => {
    return extraComputed.reduce((total, ring) => {
      if (!ring.carryOver) return total;
      if (ring.ringType !== "asset") return total;

      return total + ring.sums.balance;
    }, 0);
  }, [extraComputed]);

  return {
    getRingSums,
    extraComputed,
    totalAssetBalance,
  };
}