"use client";

import type { ExtraRing } from "../../lib/ringUtils";
import AddRingButton from "./AddRingButton";

type Props = {
  extraRings: ExtraRing[];
  canAddExtra: boolean;
  maxExtraRings: number;
  onOpenCreate: () => void;
  onOpenEdit: (id: string) => void;
  onBack: () => void;
};

export default function RingManagementView({
  extraRings,
  canAddExtra,
  maxExtraRings,
  onOpenCreate,
  onOpenEdit,
  onBack,
}: Props) {
  return (
    <div
      style={{
        position: "relative",
        zIndex: 5,
        minHeight: "100vh",
        background: "#fff",
        padding: "20px 14px 120px",
      }}
    >
      <div
        style={{
          width: "min(720px, 100%)",
          margin: "0 auto",
        }}
      >
        <button
          type="button"
          onClick={onBack}
          style={{
            border: "1px solid #ddd",
            background: "#fff",
            borderRadius: 12,
            padding: "10px 14px",
            fontWeight: 900,
            cursor: "pointer",
            marginBottom: 20,
          }}
        >
          ← リング画面に戻る
        </button>

        <h2
          style={{
            margin: 0,
            fontSize: 24,
            fontWeight: 900,
          }}
        >
          リング管理
        </h2>

        <div
          style={{
            marginTop: 6,
            fontSize: 13,
            opacity: 0.65,
          }}
        >
          追加リングの作成・編集・削除ができます
        </div>

        <div style={{ marginTop: 24 }}>
          <AddRingButton
            canAddExtra={canAddExtra}
            maxExtraRings={maxExtraRings}
            extraRingCount={extraRings.length}
            onOpenCreate={onOpenCreate}
          />
        </div>

        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 24,
          }}
        >
          {extraRings.length === 0 && (
            <div
              style={{
                padding: 20,
                borderRadius: 16,
                border: "1px solid #eee",
                textAlign: "center",
                opacity: 0.6,
              }}
            >
              追加リングはまだありません
            </div>
          )}

          {extraRings.map((ring) => (
            <div
              key={ring.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 16,
                borderRadius: 16,
                border: "1px solid #eee",
                background: "#fff",
              }}
            >
              <div
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: ring.color ?? "#60a5fa",
                  flexShrink: 0,
                }}
              />

              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    fontWeight: 900,
                    fontSize: 16,
                    overflowWrap: "anywhere",
                  }}
                >
                  {ring.title}
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 12,
                    opacity: 0.6,
                  }}
                >
                  {ring.mode === "both"
                    ? "収入 / 支出"
                    : ring.mode === "income_only"
                    ? "収入のみ"
                    : "支出のみ"}
                  {" ・ "}
                  {ring.carryOver
                    ? "累計"
                    : "月ごと"}
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  onOpenEdit(ring.id)
                }
                style={{
                  border: "1px solid #ddd",
                  background: "#fff",
                  borderRadius: 10,
                  padding: "9px 12px",
                  fontWeight: 900,
                  cursor: "pointer",
                  flexShrink: 0,
                }}
              >
                編集
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}