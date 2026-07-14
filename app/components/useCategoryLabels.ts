"use client";

import { useMemo } from "react";
import { ringCategory } from "../../lib/ringUtils";

type ExtraRing = {
  ringKey: string;
  title: string;
};

type Params = {
  extraRings: ExtraRing[];
  fixedLifeKey: string;
  fixedSaveKey: string;
};

export function useCategoryLabels({
  extraRings,
  fixedLifeKey,
  fixedSaveKey,
}: Params) {
  const categoryLabelMap = useMemo(() => {
    const map = new Map<string, string>();

    map.set(
      ringCategory(fixedLifeKey),
      "生活費"
    );

    map.set(
      ringCategory(fixedSaveKey),
      "貯蓄（今月）"
    );

    for (const ring of extraRings) {
      map.set(
        ringCategory(ring.ringKey),
        ring.title
      );
    }

    return map;
  }, [
    extraRings,
    fixedLifeKey,
    fixedSaveKey,
  ]);

  const resolveCategoryLabel = (
    category: string
  ) => {
    const normalized =
      (category ?? "").trim();

    return (
      categoryLabelMap.get(normalized) ??
      normalized
    );
  };

  return {
    resolveCategoryLabel,
  };
}