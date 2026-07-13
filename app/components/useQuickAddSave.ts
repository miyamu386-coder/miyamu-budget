"use client";

import confetti from "canvas-confetti";
import { getTarget } from "../../lib/ringGoals";
import {
  ringCategory,
  isRepayRingLike,
} from "../../lib/ringUtils";
import { decideSaveReaction } from "./useSaveEffects";
import type { RingGoal } from "../../lib/ringGoals";

type SaveReactionInput =
  Parameters<typeof decideSaveReaction>[0];

type SaveReactionResult =
  ReturnType<typeof decideSaveReaction>;

type Params = {
  saveQuickTransaction: () => Promise<{
    meta: Omit<
      SaveReactionInput,
      "fixedLifeKey" | "fixedSaveKey"
    >;
    type: "income" | "expense";
    amount: number;
  }>;

  extraRings: any[];
  ringGoals: RingGoal[];
  quickDate: string;

  fixedLifeKey: string;
  fixedSaveKey: string;

getRingSums: (
  ringKey: string,
  useCarry: boolean
) => {
  income: number;
  expense: number;
};

  triggerSaveOverlay: (
    kind: SaveReactionResult["kind"],
    tone: SaveReactionResult["tone"]
  ) => void;

  setPendingGlowRingId: (id: string) => void;

  setPayoffModal: (
    value:
      | {
          title: string;
          amount: number;
          date: string;
        }
      | null
  ) => void;
};

export function useQuickAddSave({
  saveQuickTransaction,
  extraRings,
  ringGoals,
  quickDate,
  fixedLifeKey,
  fixedSaveKey,
  getRingSums,
  triggerSaveOverlay,
  setPendingGlowRingId,
  setPayoffModal,
}: Params) {
  const saveQuickAdd = async () => {
    try {
      const { meta, type, amount } =
        await saveQuickTransaction();

      const reaction = decideSaveReaction({
        ...meta,
        fixedLifeKey,
        fixedSaveKey,
      });

      triggerSaveOverlay(
        reaction.kind,
        reaction.tone
      );

      const targetRing = extraRings.find(
        (ring) =>
          ring.ringKey === meta.ringKey
      );

      if (
        targetRing &&
        isRepayRingLike(targetRing) &&
        type === "income"
      ) {
        const totalDebt = getTarget(
          ringGoals,
          ringCategory(
            targetRing.ringKey
          )
        );

        const currentCarry =
          getRingSums(
            targetRing.ringKey,
            true
          ).income;

        const nextRepaidTotal =
          currentCarry + amount;

        const remainingAfterSave =
          Math.max(
            0,
            totalDebt -
              nextRepaidTotal
          );

        if (
          totalDebt > 0 &&
          remainingAfterSave === 0
        ) {
          setPendingGlowRingId(
            targetRing.id
          );

          window.setTimeout(() => {
            confetti({
              particleCount: 80,
              spread: 70,
              origin: {
                x: 0.25,
                y: 0.9,
              },
            });

            confetti({
              particleCount: 80,
              spread: 70,
              origin: {
                x: 0.75,
                y: 0.9,
              },
            });
          }, 2850);

          window.setTimeout(() => {
            confetti({
              particleCount: 120,
              spread: 100,
              origin: {
                x: 0.5,
                y: 0.8,
              },
            });
          }, 3050);

          window.setTimeout(() => {
            setPayoffModal({
              title:
                targetRing.title,
              amount:
                nextRepaidTotal,
              date: quickDate,
            });
          }, 3200);
        }
      }
    } catch (error) {
      console.error(error);

      const message =
        error instanceof Error
          ? error.message
          : "保存に失敗しました";

      window.alert(message);
    }
  };

  return {
    saveQuickAdd,
  };
}