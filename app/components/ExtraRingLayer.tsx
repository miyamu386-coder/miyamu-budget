"use client";

import ExtraRingButton from "./ExtraRingButton";
import { getTarget } from "../../lib/ringGoals";
import { calcRepayment } from "../../lib/repayment";
import {
  ringCategory,
  isRepayRingLike,
} from "../../lib/ringUtils";

type Props = {
  extraPositions: any[];
  extraRings: any[];
  extraComputed: any[];
  ringGoals: any[];
  glowRingId: string | null;
  selectedRing: string | null;
  isMobile: boolean;
  strokeSmall: number;
  outwardSmall: number;
  asOf: Date | null;
  getRingSums: any;
  openHoldingsView: any;
  openQuickAdd: any;
  openGoalEditor: any;
  setSelectedRing: any;
};

type RepayInfo = {
  enabled: boolean;
  progressPct: number;
  remaining: number;
  months: number | null;
  payoffDate: Date | null;
  message?: string;
};

export default function ExtraRingLayer({
  extraPositions,
  extraRings,
  extraComputed,
  ringGoals,
  glowRingId,
  selectedRing,
  isMobile,
  strokeSmall,
  outwardSmall,
  asOf,
  getRingSums,
  openHoldingsView,
  openQuickAdd,
  openGoalEditor,
  setSelectedRing,
}: Props) {
  return (
    <>
      {extraPositions.map((p) => {
        const r = extraRings.find((x: any) => x.id === p.id);
        const rc = extraComputed.find((x: any) => x.id === p.id);

        if (!r || !rc) return null;

        const catKey = ringCategory(r.ringKey);
        const target = getTarget(ringGoals, catKey);
        const showRepay = isRepayRingLike(r);

        const repayInfo: RepayInfo | undefined = showRepay
          ? (() => {
            const totalDebt = getTarget(
              ringGoals,
              ringCategory(r.ringKey)
            );

            const repaidTotal = getRingSums(
              r.ringKey,
              true
            ).income;

            const monthlyPayment = getRingSums(
              r.ringKey,
              false
            ).income;

            const result = calcRepayment({
              totalDebt,
              repaidTotal,
              monthlyPayment,
              asOf: asOf ?? new Date(0),
            });

            return {
              enabled: totalDebt > 0,
              progressPct: result.progressPct,
              remaining: result.remaining,
              months: result.months,
              payoffDate: result.payoffDate,
              message: result.message,
            };
          })()
          : undefined;

        return (
          <ExtraRingButton
            key={r.id}
            id={r.id}
            title={r.title}
            color={r.color}
            mode={r.mode}
            charMode={r.charMode}
            sums={rc.sums}
            target={target}
            repayInfo={repayInfo}
            isGlowing={glowRingId === r.id}
            selected={selectedRing === r.id}
            isMobile={isMobile}
            pos={p}
            strokeSmall={strokeSmall}
            outwardSmall={outwardSmall}
            onTapAdd={(id, defaultType) => {
              setSelectedRing(id);

              if (r.title.includes("証券")) {
                openHoldingsView(id);
                return;
              }

              openQuickAdd(
                { kind: "extra", id },
                defaultType
              );
            }}
            onLongPressGoal={() =>
              openGoalEditor(catKey)
            }
          />
        );
      })}
    </>
  );
}