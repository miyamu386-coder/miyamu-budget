"use client";

import React from "react";

export type PieDatum = {
  label: string;
  value: number;
};

type Props = {
  title: string;
  data: PieDatum[];
  totalLabel?: string;     // 中央に出す数値（例: "4,000円"）※総資産を渡す
  centerTitle?: string;    // 中央上の見出し（例: "総資産"）
  showPercent?: boolean;
  percentDigits?: number;
  onToggle?: () => void;
  toggleHint?: string;
};

function polarToCartesian(cx: number, cy: number, r: number, angle: number) {
  return {
    x: cx + r * Math.cos(angle),
    y: cy + r * Math.sin(angle),
  };
}

function describeArc(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
) {
  const TAU = Math.PI * 2;
  const delta = endAngle - startAngle;

  // 100%（360°）のときは2つの弧に分割して描く（消える対策）
  if (delta >= TAU - 1e-6) {
    const start = polarToCartesian(cx, cy, r, startAngle);
    const mid = polarToCartesian(cx, cy, r, startAngle + Math.PI);

    return `M ${cx} ${cy}
            L ${start.x} ${start.y}
            A ${r} ${r} 0 1 1 ${mid.x} ${mid.y}
            A ${r} ${r} 0 1 1 ${start.x} ${start.y}
            Z`;
  }

  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = delta <= Math.PI ? "0" : "1";

  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function fmtYen(n: number) {
  return `${Math.round(n).toLocaleString("ja-JP")}円`;
}

export default function PieChart({
  title,
  data,
  totalLabel,
  centerTitle = "総資産",   // デフォルトを「総資産」に
  showPercent = false,
  percentDigits = 1,
  onToggle,
  toggleHint,
}: Props) {
  const total = data.reduce(
    (acc, d) => acc + (Number.isFinite(d.value) ? d.value : 0),
    0
  );
  const safeTotal = total > 0 ? total : 1;

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const r = 90;

  let acc = -Math.PI / 2; // 12時方向から

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div style={{ fontWeight: 700, marginBottom: 10 }}>{title}</div>
        {toggleHint && (
          <div style={{ fontSize: 12, opacity: 0.6, whiteSpace: "nowrap" }}>
            {toggleHint}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* 円グラフ */}
        <div
          onClick={onToggle}
          style={{
            cursor: onToggle ? "pointer" : "default",
            userSelect: "none",
          }}
          title={onToggle ? "タップで切替" : undefined}
        >
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
            {data.map((d, i) => {
              const frac = Math.max(0, d.value) / safeTotal;
              const start = acc;
              const end = acc + frac * Math.PI * 2;
              acc = end;

              const fill = `hsl(${(i * 57) % 360} 70% 55%)`;

              return (
                <path
                  key={d.label}
                  d={describeArc(cx, cy, r, start, end)}
                  fill={fill}
                />
              );
            })}

            {/* ドーナツ穴 */}
            <circle cx={cx} cy={cy} r={55} fill="#fff" />

            {/* 中央タイトル（総資産） */}
            <text
              x={cx}
              y={cy - 6}
              textAnchor="middle"
              style={{ fontSize: 12, opacity: 0.7 }}
            >
              {centerTitle}
            </text>

            {/* 中央の金額（総資産を渡す） */}
            <text
              x={cx}
              y={cy + 18}
              textAnchor="middle"
              style={{ fontSize: 18, fontWeight: 700 }}
            >
              {totalLabel ?? fmtYen(total)}
            </text>

            {/* 主要割合 */}
            {showPercent &&
              total > 0 &&
              (() => {
                const max = [...data].sort((a, b) => b.value - a.value)[0];
                const p = (max.value / safeTotal) * 100;
                const pStr = `${p.toFixed(percentDigits)}%`;
                return (
                  <text
                    x={cx}
                    y={cy + 70}
                    textAnchor="middle"
                    style={{ fontSize: 12, opacity: 0.75 }}
                  >
                    {pStr}
                  </text>
                );
              })()}
          </svg>
        </div>

        {/* 凡例 */}
        <div style={{ flex: 1 }}>
          {data.map((d) => {
            const p = (Math.max(0, d.value) / safeTotal) * 100;
            return (
              <div
                key={d.label}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  padding: "8px 0",
                  borderBottom: "1px solid #eee",
                  alignItems: "center",
                }}
              >
                <div style={{ fontWeight: 600 }}>{d.label}</div>
                <div style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>
                  {showPercent ? `${p.toFixed(percentDigits)}%` : ""}
                </div>
                <div style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtYen(d.value)}
                </div>
              </div>
            );
          })}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr auto",
              paddingTop: 10,
              fontWeight: 800,
            }}
          >
            <div>合計</div>
            <div style={{ fontVariantNumeric: "tabular-nums" }}>
              {fmtYen(total)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}