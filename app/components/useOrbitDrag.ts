"use client";

import { useRef } from "react";

type Params = {
  orbitOffset: number;
  setOrbitOffset: (value: number) => void;
};

export function useOrbitDrag({
  orbitOffset,
  setOrbitOffset,
}: Params) {
  const dragStartXRef = useRef<number | null>(null);
  const dragStartOffsetRef = useRef(0);

  const onTouchStart = (
    event: React.TouchEvent<HTMLDivElement>
  ) => {
    dragStartXRef.current =
      event.touches[0].clientX;

    dragStartOffsetRef.current =
      orbitOffset;
  };

  const onTouchMove = (
    event: React.TouchEvent<HTMLDivElement>
  ) => {
    event.preventDefault();

    if (dragStartXRef.current == null) {
      return;
    }

    const dx =
      event.touches[0].clientX -
      dragStartXRef.current;

    setOrbitOffset(
      dragStartOffsetRef.current -
        dx * 0.01
    );
  };

  const onTouchEnd = () => {
    dragStartXRef.current = null;
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
  };
}