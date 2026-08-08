"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { useEffect, useMemo, useState } from "react";
import {
  guessCarryOver,
  isRepayRingLike,
  type ExtraRing,
  type RingMode,
} from "../../lib/ringUtils";

const MAX_EXTRA_RINGS = 10;

// =========================
// 保存データを読み込む
// Web → localStorage
// iOS / Android → Preferences
// =========================
async function getStoredValue(
  key: string
): Promise<string | null> {
  try {
    if (Capacitor.isNativePlatform()) {
      const result = await Preferences.get({ key });

      if (result.value !== null) {
        return result.value;
      }

      // 旧localStorageに残っている場合は移行
      const oldValue = localStorage.getItem(key);

      if (oldValue !== null) {
        await Preferences.set({
          key,
          value: oldValue,
        });

        return oldValue;
      }

      return null;
    }

    return localStorage.getItem(key);
  } catch (error) {
    console.warn("extra rings storage load failed", error);
    return null;
  }
}

// =========================
// 保存データを書き込む
// Web → localStorage
// iOS / Android → Preferences
// =========================
async function setStoredValue(
  key: string,
  value: string
) {
  try {
    if (Capacitor.isNativePlatform()) {
      await Preferences.set({
        key,
        value,
      });

      return;
    }

    localStorage.setItem(key, value);
  } catch (error) {
    console.warn("extra rings storage save failed", error);
  }
}

export function useExtraRings(userKey: string) {
  const extrasStorageKey = useMemo(() => {
    return `miyamu_maker_extra_rings_v6:${userKey}`;
  }, [userKey]);

  const [extraRings, setExtraRings] = useState<ExtraRing[]>([]);

  // 読み込み済みの保存キーを記録
  const [loadedKey, setLoadedKey] =
    useState<string | null>(null);

  // =========================
  // 追加リングを読み込む
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    setLoadedKey(null);

    void (async () => {
      try {
        const raw =
          await getStoredValue(extrasStorageKey);

        if (cancelled) return;

        if (!raw) {
          setExtraRings([]);
          setLoadedKey(extrasStorageKey);
          return;
        }

        const parsed = JSON.parse(raw) as ExtraRing[];

        if (!Array.isArray(parsed)) {
          setExtraRings([]);
          setLoadedKey(extrasStorageKey);
          return;
        }

        const normalized = parsed
          .filter(
            (ring) =>
              ring &&
              typeof ring.id === "string"
          )
          .slice(0, MAX_EXTRA_RINGS)
          .map((ring) => {
            const title = String(
              ring.title ?? "追加リング"
            );

            const mode = (
              ring.mode ?? "both"
            ) as RingMode;

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

              charMode:
                ring.charMode ?? "auto",
            } satisfies ExtraRing;
          });

        setExtraRings(normalized);
        setLoadedKey(extrasStorageKey);
      } catch (error) {
        console.warn(
          "extra rings load failed",
          error
        );

        if (!cancelled) {
          setExtraRings([]);
          setLoadedKey(extrasStorageKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey, extrasStorageKey]);

  // =========================
  // 追加リングを保存
  // =========================
  useEffect(() => {
    if (!userKey) return;

    // 読み込み前の空配列で上書きしない
    if (loadedKey !== extrasStorageKey) return;

    void setStoredValue(
      extrasStorageKey,
      JSON.stringify(extraRings)
    );
  }, [
    userKey,
    extrasStorageKey,
    extraRings,
    loadedKey,
  ]);

  return {
    extraRings,
    setExtraRings,
    maxExtraRings: MAX_EXTRA_RINGS,
    canAddExtra:
      extraRings.length < MAX_EXTRA_RINGS,
  };
}