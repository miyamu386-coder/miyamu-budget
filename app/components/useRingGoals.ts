"use client";

import { useEffect, useState } from "react";
import {
  getTarget,
  loadRingGoals,
  type RingGoal,
} from "../../lib/ringGoals";

type UseRingGoalsParams = {
  userKey: string;
  goalAssetKey: string;
};

export function useRingGoals({
  userKey,
  goalAssetKey,
}: UseRingGoalsParams) {
  const [ringGoals, setRingGoals] =
    useState<RingGoal[]>([]);

  const [goalModalOpen, setGoalModalOpen] =
    useState(false);

  const [
    goalFocusCategory,
    setGoalFocusCategory,
  ] = useState<string | null>(null);

  // =========================
  // 目標データ読み込み
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    void (async () => {
      const goals =
        await loadRingGoals(userKey);

      if (!cancelled) {
        setRingGoals(goals);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey]);

  const targetBalance = getTarget(
    ringGoals,
    goalAssetKey
  );

  const openGoalEditor = (
    category: string
  ) => {
    setGoalFocusCategory(category);
    setGoalModalOpen(true);
  };

  const closeGoalEditor = () => {
    setGoalModalOpen(false);
    setGoalFocusCategory(null);

    if (!userKey) return;

    void (async () => {
      const goals =
        await loadRingGoals(userKey);

      setRingGoals(goals);
    })();
  };

  return {
    ringGoals,
    setRingGoals,

    targetBalance,

    goalModalOpen,
    setGoalModalOpen,

    goalFocusCategory,
    setGoalFocusCategory,

    openGoalEditor,
    closeGoalEditor,
  };
}