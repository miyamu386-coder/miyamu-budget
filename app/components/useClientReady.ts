"use client";

import { useEffect, useState } from "react";

export function useClientReady() {
  const [mounted, setMounted] = useState(false);
  const [asOf, setAsOf] = useState<Date | null>(null);

  useEffect(() => {
    setAsOf(new Date());
    setMounted(true);
  }, []);

  return {
    mounted,
    asOf,
  };
}