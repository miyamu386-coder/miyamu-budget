import { useEffect, useMemo, useState } from "react";
import {
  guessCarryOver,
  isRepayRingLike,
  type ExtraRing,
  type RingMode,
} from "../../lib/ringUtils";

const MAX_EXTRA_RINGS = 10;

export function useExtraRings(userKey: string) {
  const extrasStorageKey = useMemo(() => {
    return `miyamu_maker_extra_rings_v6:${userKey}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!userKey) return;

    setLoaded(false);

    try {
      const raw = localStorage.getItem(extrasStorageKey);

      if (!raw) {
        setExtraRings([]);
        return;
      }

      const parsed = JSON.parse(raw) as ExtraRing[];

      if (!Array.isArray(parsed)) {
        setExtraRings([]);
        return;
      }

      const normalized = parsed
        .filter((ring) => ring && typeof ring.id === "string")
        .slice(0, MAX_EXTRA_RINGS)
        .map((ring) => {
          const title = String(ring.title ?? "追加リング");
          const mode = (ring.mode ?? "both") as RingMode;

          const carryOver =
            typeof ring.carryOver === "boolean"
              ? ring.carryOver
              : guessCarryOver(title, mode);

          return {
            id: ring.id,
            ringKey:
              typeof ring.ringKey === "string"
                ? ring.ringKey
                : ring.id,
            title,
            mode,
            color:
              typeof ring.color === "string"
                ? ring.color
                : "#60a5fa",
            ringType: isRepayRingLike({
              title,
              mode,
              carryOver,
            })
              ? "debt"
              : ring.ringType ?? "asset",
            carryOver,
            charMode: ring.charMode ?? "auto",
          } satisfies ExtraRing;
        });

      setExtraRings(normalized);
    } catch (error) {
      console.warn("extra rings load failed", error);
      setExtraRings([]);
    } finally {
      setLoaded(true);
    }
  }, [userKey, extrasStorageKey]);

  useEffect(() => {
    if (!userKey) return;
    if (!loaded) return;

    try {
      localStorage.setItem(
        extrasStorageKey,
        JSON.stringify(extraRings)
      );
    } catch (error) {
      console.warn("extra rings save failed", error);
    }
  }, [userKey, extrasStorageKey, extraRings, loaded]);

  return {
    extraRings,
    setExtraRings,
    maxExtraRings: MAX_EXTRA_RINGS,
    canAddExtra: extraRings.length < MAX_EXTRA_RINGS,
  };
}