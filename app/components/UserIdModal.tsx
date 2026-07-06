type Props = {
  userKey: string;
  currentName: string;
  copied: boolean;
  pasteKey: string;
  setPasteKey: React.Dispatch<React.SetStateAction<string>>;
  pasteName: string;
  setPasteName: React.Dispatch<React.SetStateAction<string>>;
  onCopy: (text: string) => void;
  onApply: () => void;
  onClose: () => void;
};

export default function UserIdModal({
  userKey,
  currentName,
  copied,
  pasteKey,
  setPasteKey,
  pasteName,
  setPasteName,
  onCopy,
  onApply,
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
        zIndex: 10000,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "min(560px, 96vw)",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
          この端末のユーザーID（userKey）
        </div>

        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 12,
            fontSize: 12,
            wordBreak: "break-all",
            background: "#fafafa",
            fontWeight: 800,
          }}
        >
          {userKey || "（取得中…）"}
        </div>

        {currentName && (
          <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
            ユーザーネーム：<b>{currentName}</b>
          </div>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={() => onCopy(userKey)}
            disabled={!userKey}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: userKey ? "pointer" : "not-allowed",
              opacity: userKey ? 1 : 0.6,
            }}
          >
            {copied ? "コピーした！" : "コピー"}
          </button>

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

        <div style={{ marginTop: 10, fontSize: 11, opacity: 0.65 }}>
          ※ Safari と ホーム画面でデータがズレる時は、このIDが同じか確認してね
        </div>

        <hr style={{ margin: "12px 0" }} />

        <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 900, marginBottom: 6 }}>
          別のユーザーIDを貼り付けて、この端末のIDを揃える
        </div>
        <div style={{ fontSize: 11, opacity: 0.65, marginBottom: 8 }}>
          ※ このユーザーIDは第三者に送らないでください
        </div>

        <input
          value={pasteKey}
          onChange={(e) => setPasteKey(e.target.value)}
          placeholder="32桁のユーザーID を貼り付け（例：3e15a0...）"
          style={{
            width: "100%",
            padding: 10,
            borderRadius: 10,
            border: "1px solid #ccc",
            fontSize: 12,
          }}
        />

        {pasteKey.trim() && pasteKey.trim() !== userKey && (
          <>
            <div style={{ marginTop: 10, fontSize: 11, opacity: 0.7, fontWeight: 900 }}>
              このIDのユーザーネーム（任意）
            </div>
            <input
              value={pasteName}
              onChange={(e) => setPasteName(e.target.value)}
              placeholder="例）任意の名前 / "
              style={{
                width: "100%",
                padding: 10,
                borderRadius: 10,
                border: "1px solid #ccc",
                fontSize: 12,
                marginTop: 6,
              }}
            />
          </>
        )}

        <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            onClick={onApply}
            disabled={!pasteKey.trim()}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: pasteKey.trim() ? "pointer" : "not-allowed",
              opacity: pasteKey.trim() ? 1 : 0.6,
            }}
          >
            このIDに切り替える
          </button>

          <button
            type="button"
            onClick={() => {
              setPasteKey("");
              setPasteName("");
            }}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #ddd",
              background: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            クリア
          </button>
        </div>
      </div>
    </div>
  );
}