"use client";

import Ring from "./Ring";
import { yen } from "../../lib/format";
import styles from "../TransactionsClient.module.css";

type CenterCard = {
  title: string;
  value: number;
  progress: number;
  color: string;
  sub1: string;
  sub2: string;
  achieved: boolean;
};

type Props = {
  centerCard: CenterCard;
  totalAssetBalance: number;
  isMobile: boolean;
  bigSize: number;
  strokeBig: number;
  outwardBig: number;
  longPressProps: Record<string, unknown>;
  shouldIgnoreClick: () => boolean;
};

export default function CenterAssetRing({
  centerCard,
  totalAssetBalance,
  isMobile,
  bigSize,
  strokeBig,
  outwardBig,
  longPressProps,
  shouldIgnoreClick,
}: Props) {
  return (
    <button
      type="button"
      {...longPressProps}
      onClick={(event) => {
        if (shouldIgnoreClick()) {
          event.preventDefault();
          return;
        }
      }}
      style={{
        width: bigSize,
        height: bigSize,
        borderRadius: 999,
        border: "1px solid #e5e5e5",
        background: "#fff",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        position: "absolute",
        left: "50%",
        top: "40%",
        transform: "translate(-50%, -50%)",
        overflow: "visible",
        boxShadow: centerCard.achieved
          ? "0 0 28px rgba(34,197,94,0.45)"
          : "0 10px 25px rgba(0,0,0,0.06)",
        zIndex: 3,
        touchAction: "manipulation",
        cursor: "pointer",
      }}
    >
      <Ring
        size={bigSize}
        stroke={strokeBig}
        outward={outwardBig}
        progress={centerCard.progress}
        color={centerCard.color}
      />

      <div
        className={styles.assetBox}
        style={{
          zIndex: 2,
          position: "relative",
        }}
      >
        <div
          style={{
            fontSize: 16,
            opacity: 0.75,
            fontWeight: 900,
          }}
        >
          {centerCard.title}
        </div>

        <div
          style={{
            fontSize: isMobile ? 42 : 52,
            fontWeight: 900,
            color: totalAssetBalance < 0 ? "#ef4444" : "#111",
            lineHeight: 1.05,
          }}
        >
          {yen(centerCard.value)}円
        </div>

        {centerCard.sub1 && (
          <div
            style={{
              marginTop: 10,
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            {centerCard.sub1}
          </div>
        )}

        {centerCard.sub2 && (
          <div
            style={{
              marginTop: 8,
              fontSize: 13,
              opacity: 0.75,
            }}
          >
            {centerCard.sub2}
          </div>
        )}

        {centerCard.achieved && (
          <div
            style={{
              marginTop: 6,
              fontWeight: 900,
            }}
          >
            ✅ 目標達成！
          </div>
        )}
      </div>
    </button>
  );
}