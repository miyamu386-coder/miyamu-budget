"use client";

import { useEffect } from "react";
import RingGoalEditor from "./RingGoalEditor";

type Props = {
  userKey: string;
  goalFocusCategory: string | null;
  goalAssetKey: string;
  ringCategories: string[];
  resolveLabel: (cat: string) => string;
  onClose: () => void;
};

export default function GoalModal({
  userKey,
  goalFocusCategory,
  goalAssetKey,
  ringCategories,
  resolveLabel,
  onClose,
}: Props) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.35)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 9999,
        overflow: "hidden",
        overscrollBehavior: "contain",
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(640px, 96vw)",
          maxHeight: "calc(100dvh - 32px)",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            flexShrink: 0,
            padding: "16px 16px 10px",
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          リング目標を編集
          {goalFocusCategory
            ? `：${
                goalFocusCategory === goalAssetKey
                  ? "総資産"
                  : resolveLabel(goalFocusCategory)
              }`
            : ""}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            overscrollBehavior: "contain",
            padding: "0 16px 16px",
            WebkitOverflowScrolling: "touch",
          }}
          onTouchMove={(e) => e.stopPropagation()}
        >
          <RingGoalEditor
  userKey={userKey}
  ringCategories={ringCategories}
  goalFocusCategory={goalFocusCategory}
  resolveLabel={resolveLabel}
/>
        </div>

        <div
          style={{
            flexShrink: 0,
            display: "flex",
            justifyContent: "flex-end",
            padding: 12,
            borderTop: "1px solid #eee",
            background: "#fff",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 18px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            戻る
          </button>
        </div>
      </div>
    </div>
  );
}