"use client";

import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { useEffect, useMemo, useState } from "react";
import type { Transaction } from "../types";

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

      // 旧localStorageに残っていればPreferencesへ移行
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
    console.warn(
      "transactions storage load failed",
      error
    );

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
    console.warn(
      "transactions storage save failed",
      error
    );
  }
}

export function useTransactions(
  userKey: string,
  initialTransactions: Transaction[] = []
) {
  const transactionsStorageKey = useMemo(() => {
    const key = userKey || "anonymous";

    return `miyamu_transactions_v1:${key}`;
  }, [userKey]);

  const [transactions, setTransactions] =
    useState<Transaction[]>(initialTransactions);

  // どの保存キーまで読み込み完了したか
  const [loadedKey, setLoadedKey] =
    useState<string | null>(null);

  // =========================
  // 保存済みtransactionsを読み込む
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    setLoadedKey(null);

    void (async () => {
      try {
        const raw = await getStoredValue(
          transactionsStorageKey
        );

        if (cancelled) return;

        if (!raw) {
          setTransactions(initialTransactions);
          setLoadedKey(transactionsStorageKey);
          return;
        }

        const parsed = JSON.parse(raw) as Transaction[];

        setTransactions(
          Array.isArray(parsed)
            ? parsed
            : initialTransactions
        );

        setLoadedKey(transactionsStorageKey);
      } catch (error) {
        console.warn(
          "transactions load failed",
          error
        );

        if (!cancelled) {
          setTransactions(initialTransactions);
          setLoadedKey(transactionsStorageKey);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    userKey,
    transactionsStorageKey,
    initialTransactions,
  ]);

  // =========================
  // transactions変更時に保存
  // =========================
  useEffect(() => {
    if (!userKey) return;

    // 読み込み完了前の空配列で上書きしない
    if (
      loadedKey !== transactionsStorageKey
    ) {
      return;
    }

    void setStoredValue(
      transactionsStorageKey,
      JSON.stringify(transactions)
    );
  }, [
    userKey,
    transactionsStorageKey,
    transactions,
    loadedKey,
  ]);

  return {
    transactions,
    setTransactions,
  };
}