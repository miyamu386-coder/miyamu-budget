"use client";

import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  loadRingGoals,
  upsertTarget,
  type RingGoal,
  getTarget,
} from "../../lib/ringGoals";

type Props = {
  userKey: string;
  ringCategories: string[];
  goalFocusCategory?: string | null;
  resolveLabel?: (category: string) => string;
  onSaved?: () => void;
};

export default function RingGoalEditor({
  userKey,
  ringCategories,
  goalFocusCategory,
  resolveLabel,
  onSaved,
}: Props) {
  const [goals, setGoals] =
    useState<RingGoal[]>([]);

  const [draft, setDraft] =
    useState<Record<string, number>>({});

  // =========================
  // 保存済み目標を読み込む
  // =========================
  useEffect(() => {
    if (!userKey) return;

    let cancelled = false;

    void (async () => {
      const g =
        await loadRingGoals(userKey);

      if (cancelled) return;

      setGoals(g);

      const initial: Record<string, number> = {};

      for (const c of ringCategories) {
        initial[c] = getTarget(g, c);
      }

      setDraft(initial);
    })();

    return () => {
      cancelled = true;
    };
  }, [userKey, ringCategories]);

  const cats = useMemo(() => {
    if (goalFocusCategory) {
      return [goalFocusCategory];
    }

    const uniq =
      Array.from(new Set(ringCategories));

    uniq.sort();

    return uniq;
  }, [ringCategories, goalFocusCategory]);

  if (cats.length === 0) return null;

  return (
    <div
      style={{
        width: "100%",
        boxSizing: "border-box",
        border: "1px solid #eee",
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          marginBottom: 12,
        }}
      >
        リング目標（円）
      </div>

      <div
        style={{
          display: "grid",
          gap: 14,
        }}
      >
        {cats.map((cat) => {
          const label = resolveLabel
            ? resolveLabel(cat)
            : cat;

          if (
            label === "生活費" ||
            label === "貯蓄（今月）" ||
            label === "貯蓄枠"
          ) {
            return null;
          }

          return (
            <div
              key={cat}
              style={{
                display: "grid",
                gap: 8,
                paddingBottom: 14,
                borderBottom:
                  "1px solid #eee",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  opacity: 0.9,
                  overflowWrap: "anywhere",
                }}
              >
                {label}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns:
                    "minmax(0, 1fr) auto",
                  gap: 8,
                  alignItems: "stretch",
                }}
              >
                <input
                  type="number"
                  inputMode="numeric"
                  value={draft[cat] ?? 0}
                  onChange={(e) =>
                    setDraft((previous) => ({
                      ...previous,
                      [cat]: Number(
                        e.target.value
                      ),
                    }))
                  }
                  placeholder="例：300000"
                  style={{
                    width: "100%",
                    minWidth: 0,
                    boxSizing: "border-box",
                    padding: 10,
                    borderRadius: 10,
                    border:
                      "1px solid #ccc",
                    fontSize: 16,
                  }}
                />

                <button
                  type="button"
                  onClick={() => {
                    void (async () => {
                      const nextGoals =
                        await upsertTarget(
                          userKey,
                          goals,
                          cat,
                          draft[cat] ?? 0
                        );

                      setGoals(nextGoals);

                      onSaved?.();
                    })();
                  }}
                  style={{
                    minWidth: 72,
                    padding: "10px 12px",
                    borderRadius: 10,
                    border:
                      "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div
        style={{
          marginTop: 10,
          fontSize: 12,
          opacity: 0.65,
        }}
      >
        ※目標は端末内に保存（userKeyごとに分離）
      </div>
    </div>
  );
}