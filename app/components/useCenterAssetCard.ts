"use client";

import { useMemo } from "react";
import { clamp01 } from "../../lib/math";
import { yen } from "../../lib/format";

type Params = {
  totalAssetBalance: number;
  targetBalance: number;
};

export function useCenterAssetCard({
  totalAssetBalance,
  targetBalance,
}: Params) {
  const progressToTarget =
    targetBalance > 0
      ? clamp01(totalAssetBalance / targetBalance)
      : 0;

  const remainToTarget = Math.max(
    0,
    targetBalance - totalAssetBalance
  );

  const balanceAchieved =
    targetBalance > 0 &&
    totalAssetBalance >= targetBalance;

  const centerCard = useMemo(
    () => ({
      title: "総資産",
      value: totalAssetBalance,
      progress: progressToTarget,
      color: "#f59e0b",
      sub1: "",
      sub2:
        targetBalance > 0
          ? `目標まであと ${yen(remainToTarget)}円`
          : "",
      achieved: balanceAchieved,
    }),
    [
      totalAssetBalance,
      progressToTarget,
      targetBalance,
      remainToTarget,
      balanceAchieved,
    ]
  );

  return {
    centerCard,
  };
}