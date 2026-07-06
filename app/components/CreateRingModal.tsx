type RingMode = "both" | "income_only" | "expense_only";

type Props = {
  createTitle: string;
  createMode: RingMode;
  createCarryOver: boolean;
  setCreateTitle: (v: string) => void;
  setCreateMode: (v: RingMode) => void;
  setCreateCarryOver: (v: boolean) => void;
  onSave: () => void;
  onClose: () => void;
};

export default function CreateRingModal({
  createTitle,
  createMode,
  createCarryOver,
  setCreateTitle,
  setCreateMode,
  setCreateCarryOver,
  onSave,
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
          width: "min(520px, 96vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          追加リングを作る
        </div>

        <label style={{ fontSize: 12, opacity: 0.75 }}>
          リング名
          <input
            value={createTitle}
            onChange={(e) => setCreateTitle(e.target.value)}
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 16,
              marginTop: 6,
            }}
            placeholder="例）カードローン返済 / 第一銀行 / 投資"
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
            value={createMode}
            onChange={(e) => {
              const m = e.target.value as RingMode;
              setCreateMode(m);
              setCreateCarryOver(m === "income_only" || m === "expense_only");
            }}
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
            checked={createCarryOver}
            onChange={(e) => setCreateCarryOver(e.target.checked)}
          />
          月またぎ（累計）で計算する
        </label>

        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
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
            作成
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
        </div>
      </div>
    </div>
  );
}