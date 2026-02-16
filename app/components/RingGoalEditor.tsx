"use client";

import React, { useEffect, useMemo, useState } from "react";
import { loadRingGoals, upsertTarget, type RingGoal, getTarget } from "../../lib/ringGoals";

type Props = {
  ringCategories: string[]; // ["ring:debt","ring:save","ring:xxx"...]
  resolveLabel?: (category: string) => string;

  // ✅ 追加：保存後に親へ通知（同一タブで即反映させる）
  onSaved?: () => void;
};

export default function RingGoalEditor({ ringCategories, resolveLabel, onSaved }: Props) {
  const [goals, setGoals] = useState<RingGoal[]>([]);
  const [draft, setDraft] = useState<Record<string, number>>({});

  useEffect(() => {
    const g = loadRingGoals();
    setGoals(g);
    const initial: Record<string, number> = {};
    for (const c of ringCategories) initial[c] = getTarget(g, c);
    setDraft(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ringCategories.join("|")]);

  const cats = useMemo(() => {
    const uniq = Array.from(new Set(ringCategories));
    uniq.sort();
    return uniq;
  }, [ringCategories]);

  if (cats.length === 0) return null;

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 12, padding: 14, marginBottom: 16 }}>
      <div style={{ fontWeight: 900, marginBottom: 8 }}>リング目標（円）</div>

      <div style={{ display: "grid", gap: 10 }}>
        {cats.map((cat) => {
          const label = resolveLabel ? resolveLabel(cat) : cat;
          return (
            <div
              key={cat}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 160px 90px",
                gap: 10,
                alignItems: "center",
              }}
            >
              <div style={{ fontWeight: 700, opacity: 0.9 }}>{label}</div>

              <input
                type="number"
                inputMode="numeric"
                value={draft[cat] ?? 0}
                onChange={(e) => setDraft((p) => ({ ...p, [cat]: Number(e.target.value) }))}
                placeholder="例：300000"
                style={{ padding: 10, borderRadius: 10, border: "1px solid #ccc" }}
              />

              <button
                type="button"
                onClick={() => {
                  const nextGoals = upsertTarget(goals, cat, draft[cat] ?? 0);
                  setGoals(nextGoals);

                  // ✅ 追加：親に「保存したよ」を通知して、即反映させる
                  onSaved?.();
                }}
                style={{
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#fff",
                  cursor: "pointer",
                }}
              >
                保存
              </button>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, fontSize: 12, opacity: 0.65 }}>※目標は端末内に保存（userKeyごとに分離）</div>
    </div>
  );
}
