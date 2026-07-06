export function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}