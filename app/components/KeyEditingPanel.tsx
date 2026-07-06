"use client";

type Props = {
  userKeyInput: string;
  setUserKeyInput: (v: string) => void;
  applyUserKey: () => void;
  regenerateUserKey: () => void;
  onClose: () => void;
};

export default function KeyEditingPanel({
  userKeyInput,
  setUserKeyInput,
  applyUserKey,
  regenerateUserKey,
  onClose,
}: Props) {
  return (
    <div
      style={{
        border: "1px dashed #ddd",
        borderRadius: 12,
        padding: 12,
        marginBottom: 12,
      }}
    >
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
        userKeyを切り替える（デモ用）
      </div>

      <input
        value={userKeyInput}
        onChange={(e) => setUserKeyInput(e.target.value)}
        placeholder="8〜64文字（例：itchy-2026）"
        style={{
          width: "100%",
          padding: 10,
          borderRadius: 10,
          border: "1px solid #ccc",
          fontSize: 12,
        }}
      />

      <div
        style={{
          display: "flex",
          gap: 10,
          marginTop: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={applyUserKey}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          このuserKeyに切替
        </button>

        <button
          type="button"
          onClick={regenerateUserKey}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          再生成
        </button>

        <button
          type="button"
          onClick={onClose}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontSize: 12,
          }}
        >
          閉じる
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
        ※切替すると、その場で一覧を再取得します
      </div>
    </div>
  );
}