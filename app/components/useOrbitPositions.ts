"use client";

import { useMemo } from "react";
import { buildOrbitPositions } from "../../lib/orbitLayout";
import type { ExtraRing } from "../../lib/ringUtils";

type Params = {
  extraRings: ExtraRing[];
  isMobile: boolean;
  selectedRing: string | null;
  orbitOffset: number;
};

export function useOrbitPositions({
  extraRings,
  isMobile,
  selectedRing,
  orbitOffset,
}: Params) {
  const extraPositions = useMemo(() => {
    return buildOrbitPositions({
      extraRings,
      isMobile,
      selectedRing,
      orbitOffset,
    });
  }, [
    extraRings,
    isMobile,
    selectedRing,
    orbitOffset,
  ]);

  return { extraPositions };
}