"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

export type HoldingKind =
  | "国内株"
  | "米国ETF"
  | "投資信託"
  | "現金";

export type Holding = {
  id: string;
  ringKey: string;
  name: string;
  shares: number;
  unit?: "株" | "口";
  value: number;
  kind?: HoldingKind;
};

// =========================
// 保存データを読み込む
// ブラウザ → localStorage
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

      // 以前localStorageに保存していたデータがあれば
      // Preferencesへ移行する
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
    console.warn("holdings storage load failed", error);
    return null;
  }
}

// =========================
// 保存データを書き込む
// ブラウザ → localStorage
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
    console.warn("holdings storage save failed", error);
  }
}

export function useHoldings(userKey: string) {
  const holdingsStorageKey = useMemo(() => {
    const k = userKey || "anonymous";

    return `miyamu_holdings_v1:${k}`;
  }, [userKey]);

  const [holdings, setHoldings] = useState<Holding[]>([]);

  // 「どの保存キーまで読み込み完了したか」を記録
  const [loadedKey, setLoadedKey] =
    useState<string | null>(null);

  // =========================
  // 保存済みデータを読み込む
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    setLoadedKey(null);

    void (async () => {
      try {
        const raw =
          await getStoredValue(holdingsStorageKey);

        if (cancelled) return;

        if (!raw) {
          setHoldings([]);
          setLoadedKey(holdingsStorageKey);
          return;
        }

        const arr = JSON.parse(raw) as Holding[];

        setHoldings(
          Array.isArray(arr) ? arr : []
        );

        setLoadedKey(holdingsStorageKey);
      } catch (error) {
        console.warn(
          "holdings load failed",
          error
        );

        if (!cancelled) {
          setHoldings([]);
          setLoadedKey(holdingsStorageKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey, holdingsStorageKey]);

  // =========================
  // holdings変更時に保存
  // =========================
  useEffect(() => {
    if (!userKey) return;

    // 読み込みが終わる前に
    // 空データで上書きしないための安全装置
    if (loadedKey !== holdingsStorageKey) return;

    void setStoredValue(
      holdingsStorageKey,
      JSON.stringify(holdings)
    );
  }, [
    userKey,
    holdingsStorageKey,
    holdings,
    loadedKey,
  ]);

  // =========================
  // 全保有資産合計
  // =========================
  const holdingsTotal = useMemo(() => {
    return holdings.reduce(
      (sum, holding) => sum + holding.value,
      0
    );
  }, [holdings]);

  // =========================
  // リングごとの保有資産合計
  // =========================
  const getHoldingValue = useCallback(
    (ringKey: string) => {
      return holdings
        .filter(
          (holding) =>
            holding.ringKey === ringKey
        )
        .reduce(
          (sum, holding) =>
            sum + holding.value,
          0
        );
    },
    [holdings]
  );

  return {
    holdings,
    setHoldings,
    holdingsTotal,
    getHoldingValue,
  };
}