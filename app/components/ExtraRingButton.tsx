"use client";
import { useRef } from "react"
type CharaMode = "auto" | "mofu" | "hina" | "none";
type RingMode = "both" | "income_only" | "expense_only";
type TxType = "income" | "expense";

type RepayInfo = {
  enabled: boolean;
  progressPct: number;
  remaining: number;
  months: number | null;
  payoffDate: Date | null;
  message?: string;
};

function yen(n: number) {
  return (n || 0).toLocaleString("ja-JP");
}

function clamp01(x: number) {
  return Math.max(0, Math.min(1, x));
}
/**
 * ✅ 外周リング描画（SVG）
 */
function Ring({
  size,
  stroke,
  progress,
  color,
  selected,
  trackColor = "#e5e7eb",
  outward = 0,
  offsetDeg = -90,
}: {
  size: number;
  stroke: number;
  progress: number;
  color: string;
  selected?: boolean;
  trackColor?: string;
  outward?: number;
  offsetDeg?: number;
}) {
  // 選択時の強調
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
    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
    <feMerge>
      <feMergeNode in="coloredBlur"/>
      <feMergeNode in="SourceGraphic"/>
    </feMerge>
  </filter>
</defs>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
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
        style={{ transition: "stroke-dashoffset 0.35s ease" }}
      />
    </svg>
  );
}

function formatYMDDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}/${m}/${dd}`;
}
function useLongPressHandlers(onLongPress: () => void, delay = 650) {
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
export default function ExtraRingButton({
  id,
  title,
  color,
  mode,
  charMode,
  sums,
  target,
  isMobile,
  pos,
  strokeSmall,
  outwardSmall,
  onTapAdd,
  onLongPressGoal,
  repayInfo,
  isGlowing = false,
  selected = false,
}: {
  id: string;
  title: string;
  color: string;
  mode: RingMode;
  charMode?: CharaMode;
  sums: { income: number; expense: number; balance: number };
  target: number;
  isMobile: boolean;
  pos: {
  x: number;
  y: number;
  size: number;
  opacity?: number;
  zIndex?: number;
};
  strokeSmall: number;
  outwardSmall: number;
  onTapAdd: (id: string, defaultType: TxType) => void;
  onLongPressGoal: (id: string) => void;
  repayInfo?: RepayInfo;
  isGlowing?: boolean;
  selected?: boolean;
}) {

  const valueForProgress =
    mode === "income_only" ? sums.income : mode === "expense_only" ? sums.expense : Math.max(0, sums.balance);

  const prog = target > 0 ? clamp01(valueForProgress / target) : 0;

  const lp = useLongPressHandlers(() => onLongPressGoal(id), 650);
  const { shouldIgnoreClick, ...lpProps } = lp;

  const defaultType: TxType = mode === "income_only" ? "income" : "expense";
  const displayValue = mode === "income_only" ? sums.income : mode === "expense_only" ? sums.expense : sums.balance;
  const remain = target > 0 ? Math.max(0, target - displayValue) : 0;
  const achieved = target > 0 ? displayValue >= target : false;

  return (
    <button
      type="button"
      {...lpProps}
      onClick={(e) => {
        if (shouldIgnoreClick()) {
          e.preventDefault();
          return;
        }
        onTapAdd(id, defaultType);
      }}
      style={{
        position: "absolute",
        left: "50%",
        top: "40%",
        transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))scale(${isGlowing ? 1.04 : 1})`,
        transition: "transform 0.15s ease",
        width: pos.size,
        height: pos.size,
        borderRadius: 999,
        border: "1px solid #e5e5e5",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        overflow: "visible",
        cursor: "pointer",
        boxShadow: isGlowing
          ? "0 0 0 8px rgba(251,191,36,0.18), 0 0 30px rgba(251,191,36,0.65), 0 10px 25px rgba(0,0,0,0.10)"
          : "0 10px 25px rgba(0,0,0,0.05)",
        opacity: pos.opacity ?? 1,
        zIndex: selected ? 50 : pos.zIndex ?? 2,
        touchAction: "manipulation",
        animation: isGlowing ? "miyamuRingGlow 1s ease-in-out infinite alternate" : undefined,
      }}
    >
      <Ring size={pos.size} 
      stroke={strokeSmall} 
      outward={outwardSmall} 
      progress={prog} 
      color={color} 
      selected={selected}
      />

      <div style={{ zIndex: selected ? 30 : 2 }}>
        <div style={{ fontSize: 12, opacity: 0.75, fontWeight: 900 }}>{title}</div>
        <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900 }}>{yen(displayValue)}円</div>

        {target > 0 && !achieved && !repayInfo?.enabled && (
          <div style={{ fontSize: 11, marginTop: 2, opacity: 0.75 }}>目標まであと {yen(remain)}円</div>
        )}

        {target > 0 && achieved && <div style={{ fontSize: 11, marginTop: 2, color: "green" }}>🎉 達成！</div>}

        {repayInfo?.enabled && (
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.85, lineHeight: 1.25 }}>
            <div>返済率：{repayInfo.progressPct.toFixed(1)}%</div>
            <div>完済まであと {yen(repayInfo.remaining)}円</div>
            {repayInfo.months !== null && <div>完済まで：あと {repayInfo.months}ヶ月</div>}
            {repayInfo.payoffDate && <div>完済予定：{formatYMDDate(repayInfo.payoffDate)}</div>}
          </div>
        )}

        {repayInfo && !repayInfo.enabled && (
          <div style={{ marginTop: 6, fontSize: 11, opacity: 0.75 }}>目標（借入総額）が未設定です（長押しで設定）</div>
        )}

        
      </div>

      <style jsx>{`
        @keyframes miyamuRingGlow {
          from {
            transform: scale(1);
          }
          to {
            transform: scale(1.035);
          }
        }
      `}</style>
    </button>
  );
}