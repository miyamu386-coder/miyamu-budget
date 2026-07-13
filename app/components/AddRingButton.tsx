"use client";

type Props = {
  canAddExtra: boolean;
  maxExtraRings: number;
  extraRingCount: number;
  onOpenCreate: () => void;
};

export default function AddRingButton({
  canAddExtra,
  maxExtraRings,
  extraRingCount,
  onOpenCreate,
}: Props) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "center",
        marginTop: 10,
      }}
    >
      <button
        type="button"
        onClick={onOpenCreate}
        disabled={!canAddExtra}
        style={{
          padding: "12px 14px",
          borderRadius: 12,
          border: "1px solid #ccc",
          background: canAddExtra ? "#fff" : "#f3f4f6",
          cursor: canAddExtra ? "pointer" : "not-allowed",
          fontWeight: 900,
          fontSize: 14,
          width: "min(360px, 96vw)",
        }}
      >
        ＋ 追加リング（残り{" "}
        {Math.max(0, maxExtraRings - extraRingCount)}）
      </button>
    </div>
  );
}