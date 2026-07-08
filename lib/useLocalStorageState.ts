"use client";

import { useEffect, useState } from "react";

export function useLocalStorageState<T>(
  key: string,
  initialValue: T
) {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    if (!key) return;

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      setValue(JSON.parse(raw) as T);
    } catch (e) {
      console.warn("localStorage load failed", e);
    }
  }, [key]);

  useEffect(() => {
    if (!key) return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn("localStorage save failed", e);
    }
  }, [key, value]);

  return [value, setValue] as const;
}