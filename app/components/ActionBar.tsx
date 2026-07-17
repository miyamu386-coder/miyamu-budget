"use client";

import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

type MainView = "input" | "history";

type Props = {
  exportMonthlyImage: () => void;
  openPrintView: () => void;
  exportBackup: () => void;

  importFileRef: RefObject<HTMLInputElement | null>;
  importBackup: (file: File) => Promise<void>;

  setMainView: Dispatch<SetStateAction<MainView>>;
};

export default function ActionBar({
  exportMonthlyImage,
  openPrintView,
  exportBackup,
  importFileRef,
  importBackup,
  setMainView,
}: Props) {
  const buttonStyle = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #111",
    background: "#fff",
    color: "#111",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
  } as const;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={() => setMainView("history")}
          style={buttonStyle}
        >
          明細一覧
        </button>

        <button
          type="button"
          onClick={exportMonthlyImage}
          style={buttonStyle}
        >
          月レポート保存
        </button>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <button
          type="button"
          onClick={exportBackup}
          style={buttonStyle}
        >
          バックアップ
        </button>

        <button
          type="button"
          onClick={() =>
            importFileRef.current?.click()
          }
          style={buttonStyle}
        >
          復元
        </button>

        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={async (event) => {
            const file = event.target.files?.[0];

            if (!file) return;

            await importBackup(file);
            event.currentTarget.value = "";
          }}
        />

        <button
          type="button"
          onClick={openPrintView}
          style={{
            ...buttonStyle,
            background: "#111",
            color: "#fff",
          }}
        >
          印刷 / PDF
        </button>
      </div>
    </div>
  );
}