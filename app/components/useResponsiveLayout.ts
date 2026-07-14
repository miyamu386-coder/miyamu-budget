"use client";

import { useEffect, useState } from "react";

export function useResponsiveLayout() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 600px)");

    const apply = () => {
      setIsMobile(mq.matches);
    };

    apply();

    mq.addEventListener?.("change", apply);

    return () => {
      mq.removeEventListener?.("change", apply);
    };
  }, []);

  const bigSize = isMobile ? 170 : 320;
  const strokeBig = isMobile ? 14 : 16;
  const strokeSmall = isMobile ? 12 : 14;
  const outwardBig = isMobile ? 10 : 12;
  const outwardSmall = isMobile ? 8 : 10;
  const areaH = isMobile ? 820 : 860;

  return {
    isMobile,
    bigSize,
    strokeBig,
    strokeSmall,
    outwardBig,
    outwardSmall,
    areaH,
  };
}