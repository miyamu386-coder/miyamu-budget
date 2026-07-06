import RingGoalEditor from "./RingGoalEditor";

type Props = {
  goalFocusCategory: string | null;
  goalAssetKey: string;
  ringCategories: string[];
  resolveLabel: (cat: string) => string;
  onClose: () => void;
};

export default function GoalModal({
  goalFocusCategory,
  goalAssetKey,
  ringCategories,
  resolveLabel,
  onClose,
}: Props) {
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
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(640px, 96vw)",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          リング目標を編集
          {goalFocusCategory
            ? `：${goalFocusCategory === goalAssetKey ? "総資産" : resolveLabel(goalFocusCategory)}`
            : ""}
        </div>

        <RingGoalEditor
          ringCategories={ringCategories}
          resolveLabel={resolveLabel}
        />

        <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}