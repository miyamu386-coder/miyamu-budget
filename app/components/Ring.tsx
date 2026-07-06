type RingProps = {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  selected?: boolean;
  trackColor?: string;
  outward?: number;
  offsetDeg?: number;
};

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}

export default function Ring({
  size,
  stroke,
  progress,
  color,
  selected,
  trackColor = "#e5e7eb",
  outward = 0,
  offsetDeg = -90,
}: RingProps) {
  const activeStroke = selected ? stroke + 4 : stroke;
  const activeScale = selected ? 1.03 : 1;
  const activeFilter = selected
    ? "drop-shadow(0 6px 12px rgba(0,0,0,0.22))"
    : "none";

  const p = clamp01(progress);

  const pad = Math.max(0, outward) + stroke;
  const full = size + pad * 2;

  const r = (size - stroke) / 2 + outward;
  const c = 2 * Math.PI * r;
  const dashOffset = c * (1 - p);

  const cx = full / 2;
  const cy = full / 2;

  return (
    <svg
      width={full}
      height={full}
      style={{
        position: "absolute",
        top: -pad,
        left: -pad,
        pointerEvents: "none",
        overflow: "visible",
        transform: `scale(${activeScale})`,
        transformOrigin: "center",
        filter: activeFilter,
        transition:
          "transform 0.45s cubic-bezier(.2,.9,.2,1), opacity 0.35s ease",
        zIndex: selected ? 20 : 1,
      }}
      viewBox={`0 0 ${full} ${full}`}
    >
      <defs>
        <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFF7AE" />
          <stop offset="35%" stopColor="#FFD700" />
          <stop offset="60%" stopColor="#FFC300" />
          <stop offset="100%" stopColor="#FFB300" />
        </linearGradient>

        <filter id="goldGlow">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={trackColor}
        strokeWidth={stroke}
      />

      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke={p >= 0.999 ? "url(#gold)" : color}
        filter={p >= 0.999 ? "url(#goldGlow)" : undefined}
        strokeWidth={activeStroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashOffset}
        transform={`rotate(${offsetDeg} ${cx} ${cy})`}
        style={{
          transition: "stroke-dashoffset 0.35s ease",
        }}
      />
    </svg>
  );
}