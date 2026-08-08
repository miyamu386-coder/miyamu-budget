"use client";

import { useEffect, useRef, useState } from "react";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T
) {
  const [value, setValue] = useState<T>(initialValue);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);

  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    if (!key) {
      setLoadedKey(null);
      return;
    }

    try {
      const raw = localStorage.getItem(key);

      if (raw) {
        setValue(JSON.parse(raw) as T);
      } else {
        setValue(initialValueRef.current);
      }
    } catch (e) {
      console.warn("localStorage load failed", e);
      setValue(initialValueRef.current);
    } finally {
      setLoadedKey(key);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;

    // ★ 読み込み完了前は絶対に保存しない
    if (loadedKey !== key) return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
  }, [key, value, loadedKey]);

  return [value, setValue] as const;
}