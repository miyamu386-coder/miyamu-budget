type RingMode = "both" | "income_only" | "expense_only";

type ExtraDraft = {
  title: string;
  mode: RingMode;
  carryOver: boolean;
  ringType: "asset" | "debt";
};

type Props = {
  extraDraft: ExtraDraft;
  setExtraDraft: React.Dispatch<React.SetStateAction<ExtraDraft>>;
  onSave: () => void;
  onClose: () => void;
  onRemove: () => void;
};

export default function EditRingModal({
  extraDraft,
  setExtraDraft,
  onSave,
  onClose,
  onRemove,
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
          width: "min(520px, 96vw)",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          リング編集
        </div>

        <label style={{ fontSize: 12, opacity: 0.75 }}>
          表示名
          <input
            value={extraDraft.title}
            onChange={(e) =>
              setExtraDraft((d) => ({ ...d, title: e.target.value }))
            }
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 16,
              marginTop: 6,
            }}
          />
        </label>

        <label
          style={{
            fontSize: 12,
            opacity: 0.75,
            marginTop: 10,
            display: "block",
          }}
        >
          入力モード
          <select
            value={extraDraft.mode}
            onChange={(e) =>
              setExtraDraft((d) => ({
                ...d,
                mode: e.target.value as RingMode,
              }))
            }
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 14,
              marginTop: 6,
              background: "#fff",
            }}
          >
            <option value="both">収入/支出（両方）</option>
            <option value="income_only">収入のみ</option>
            <option value="expense_only">支出のみ</option>
          </select>
        </label>

        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 10,
            fontSize: 12,
          }}
        >
          <input
            type="checkbox"
            checked={extraDraft.carryOver}
            onChange={(e) =>
              setExtraDraft((d) => ({
                ...d,
                carryOver: e.target.checked,
              }))
            }
          />
          月またぎ（累計）で計算する
        </label>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 12,
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={onSave}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              width: 140,
              cursor: "pointer",
            }}
          >
            保存
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              color: "#333",
              fontWeight: 900,
              width: 140,
              cursor: "pointer",
            }}
          >
            キャンセル
          </button>

          <div style={{ flex: 1 }} />

          <button
            type="button"
            onClick={onRemove}
            style={{
              padding: "12px 14px",
              borderRadius: 12,
              border: "1px solid #f2b3b3",
              color: "#b42318",
              background: "#fff0f0",
              fontWeight: 900,
              width: 160,
              cursor: "pointer",
            }}
          >
            このリングを削除
          </button>
        </div>
      </div>
    </div>
  );
}