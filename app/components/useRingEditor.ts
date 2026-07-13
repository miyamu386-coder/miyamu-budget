"use client";

import { useState } from "react";
import {
  isRepayRingLike,
  makeId,
  type ExtraRing,
  type RingMode,
} from "../../lib/ringUtils";

type ExtraRingDraft = {
  title: string;
  mode: RingMode;
  carryOver: boolean;
  ringType: "asset" | "debt";
};

type UseRingEditorParams = {
  extraRings: ExtraRing[];
  setExtraRings: React.Dispatch<
    React.SetStateAction<ExtraRing[]>
  >;
  canAddExtra: boolean;
  maxExtraRings: number;
};

export function useRingEditor({
  extraRings,
  setExtraRings,
  canAddExtra,
  maxExtraRings,
}: UseRingEditorParams) {
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState(
    "カードローン返済"
  );
  const [createMode, setCreateMode] =
    useState<RingMode>("both");
  const [createCarryOver, setCreateCarryOver] =
    useState(true);

  const [extraEditId, setExtraEditId] =
    useState<string | null>(null);

  const [extraDraft, setExtraDraft] =
    useState<ExtraRingDraft>({
      title: "",
      mode: "both",
      carryOver: false,
      ringType: "asset",
    });

  const openCreate = () => {
    if (!canAddExtra) {
      window.alert(
        `追加リングは最大${maxExtraRings}個までです`
      );
      return;
    }

    setCreateTitle("カードローン返済");
    setCreateMode("both");
    setCreateCarryOver(true);
    setCreateOpen(true);
  };

  const saveCreate = () => {
    if (!canAddExtra) return;

    const title =
      String(createTitle).trim().slice(0, 24) ||
      "追加リング";

    const id = makeId();
    const ringKey = makeId();
    const carryOver = Boolean(createCarryOver);

    const next: ExtraRing = {
      id,
      ringKey,
      title,
      mode: createMode,
      color: "#60a5fa",
      ringType: isRepayRingLike({
        title,
        mode: createMode,
        carryOver,
      })
        ? "debt"
        : "asset",
      carryOver,
      charMode: "auto",
    };

    setExtraRings((previous) => [
      ...previous,
      next,
    ]);

    setCreateOpen(false);
  };

  const openExtraEdit = (id: string) => {
    const ring = extraRings.find(
      (item) => item.id === id
    );

    if (!ring) return;

    setExtraDraft({
      title: ring.title,
      mode: ring.mode,
      carryOver: Boolean(ring.carryOver),
      ringType: ring.ringType ?? "asset",
    });

    setExtraEditId(id);
  };

  const saveExtraEdit = () => {
    if (!extraEditId) return;

    const title =
      String(extraDraft.title).trim().slice(0, 24) ||
      "追加リング";

    const mode = extraDraft.mode;
    const carryOver = Boolean(
      extraDraft.carryOver
    );

    setExtraRings((previous) =>
      previous.map((ring) =>
        ring.id === extraEditId
          ? {
              ...ring,
              title,
              mode,
              carryOver,
              ringType: isRepayRingLike({
                title,
                mode,
                carryOver,
              })
                ? "debt"
                : "asset",
            }
          : ring
      )
    );

    setExtraEditId(null);
  };

  const removeExtraRing = () => {
    if (!extraEditId) return;

    setExtraRings((previous) =>
      previous.filter(
        (ring) => ring.id !== extraEditId
      )
    );

    setExtraEditId(null);
  };

  return {
    createOpen,
    setCreateOpen,
    createTitle,
    setCreateTitle,
    createMode,
    setCreateMode,
    createCarryOver,
    setCreateCarryOver,
    openCreate,
    saveCreate,

    extraEditId,
    setExtraEditId,
    extraDraft,
    setExtraDraft,
    openExtraEdit,
    saveExtraEdit,
    removeExtraRing,
  };
}