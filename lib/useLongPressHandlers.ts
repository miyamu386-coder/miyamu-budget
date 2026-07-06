import { useRef } from "react";

export function useLongPressHandlers(onLongPress: () => void, delay = 650) {
  const timerRef = useRef<number | null>(null);
  const longPressedRef = useRef(false);

  const clear = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const onPointerDown = () => {
    clear();
    longPressedRef.current = false;
    timerRef.current = window.setTimeout(() => {
      longPressedRef.current = true;
      onLongPress();
    }, delay);
  };

  const onPointerUp = () => clear();

  const onPointerCancel = () => {
    clear();
    longPressedRef.current = false;
  };

  const shouldIgnoreClick = () => longPressedRef.current;

  return { onPointerDown, onPointerUp, onPointerCancel, shouldIgnoreClick };
}