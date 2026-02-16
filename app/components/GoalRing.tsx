"use client";

import React from "react";

type Props = {
  title: string;
  current: number;
  target: number;
  subLines?: string[];
};

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export default function GoalRing({ title, current, target, subLines = [] }: Props) {
  const safeTarget = target > 0 ? target : 0;
  const ratio = safeTarget > 0 ? current / safeTarget : 0;
  const pct = safeTarget > 0 ? Math.round(clamp(ratio, 0, 1) * 100) : 0;

  const ringStyle: React.CSSProperties = {
    width: 160,
    height: 160,
    borderRadius: "50%",
    background: `conic-gradient(#22c55e ${pct * 3.6}deg, #e5e7eb 0deg)`,
    display: "grid",
    placeItems: "center",
  };

  const innerStyle: React.CSSProperties = {
    width: 120,
    height: 120,
    borderRadius: "50%",
    background: "white",
    display: "grid",
    placeItems: "center",
    textAlign: "center",
    padding: 8,
    border: "1px solid #eee",
  };

  return (
    <div style={{ display: "grid", gap: 8, justifyItems: "center" }}>
      <div style={{ fontWeight: 800 }}>{title}</div>

      <div style={ringStyle} aria-label={`${title} 達成率 ${pct}%`}>
        <div style={innerStyle}>
          <div style={{ fontSize: 12, opacity: 0.6 }}>達成率</div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>{pct}%</div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {current.toLocaleString()} / {safeTarget.toLocaleString()}
          </div>
        </div>
      </div>

      {subLines.length > 0 && (
        <div style={{ fontSize: 12, opacity: 0.85, display: "grid", gap: 2, justifyItems: "center" }}>
          {subLines.map((s, i) => (
            <div key={i}>{s}</div>
          ))}
        </div>
      )}
    </div>
  );
}