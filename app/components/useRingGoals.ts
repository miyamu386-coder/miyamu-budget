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
  const [ringGoals, setRingGoals] = useState<RingGoal[]>([]);

  const [goalModalOpen, setGoalModalOpen] =
    useState(false);

  const [
    goalFocusCategory,
    setGoalFocusCategory,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (!userKey) return;

    setRingGoals(loadRingGoals());
  }, [userKey]);

  const targetBalance = getTarget(
    ringGoals,
    goalAssetKey
  );

  const openGoalEditor = (category: string) => {
    setGoalFocusCategory(category);
    setGoalModalOpen(true);
  };

  const closeGoalEditor = () => {
    setGoalModalOpen(false);
    setGoalFocusCategory(null);
    setRingGoals(loadRingGoals());
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