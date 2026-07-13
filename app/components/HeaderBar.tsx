"use client";

import type {
  Dispatch,
  RefObject,
  SetStateAction,
} from "react";

import {
  addMonths,
  fmtYM,
} from "../../lib/dateUtils";

import {
  getUserKeyName,
  maskKey,
} from "../../lib/userKey";

type MainView = "input" | "history";

type Props = {
  exportMonthlyImage: () => void;
  openPrintView: () => void;
  exportBackup: () => void;

  importFileRef: RefObject<HTMLInputElement | null>;
  importBackup: (file: File) => Promise<void>;

  selectedYm: string;
  setSelectedYm: Dispatch<SetStateAction<string>>;
  setMainView: Dispatch<SetStateAction<MainView>>;

  showUserKeyUi: boolean;
  userKey: string;
  setKeyEditingOpen: Dispatch<SetStateAction<boolean>>;
  hardReload: () => void;
};

export default function HeaderBar({
  exportMonthlyImage,
  openPrintView,
  exportBackup,
  importFileRef,
  importBackup,
  selectedYm,
  setSelectedYm,
  setMainView,
  showUserKeyUi,
  userKey,
  setKeyEditingOpen,
  hardReload,
}: Props) {
  const userKeyName =
    getUserKeyName(userKey);

  return (
    <>
      <div
        style={{
          display: "flex",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={exportMonthlyImage}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          月レポート保存
        </button>

        <button
          type="button"
          onClick={() =>
            setMainView("history")
          }
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          明細一覧
        </button>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {showUserKeyUi && (
          <>
            <div
              style={{
                fontSize: 12,
                opacity: 0.75,
              }}
            >
              userKey: {maskKey(userKey)}
              {userKeyName
                ? `（${userKeyName}）`
                : ""}
            </div>

            <button
              type="button"
              onClick={() =>
                setKeyEditingOpen(
                  (value) => !value
                )
              }
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              切替
            </button>

            <button
              type="button"
              onClick={hardReload}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
                cursor: "pointer",
                fontWeight: 900,
                fontSize: 12,
              }}
            >
              最新版読み直し
            </button>
          </>
        )}

        <button
          type="button"
          onClick={exportBackup}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          バックアップ
        </button>

        <button
          type="button"
          onClick={() =>
            importFileRef.current?.click()
          }
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#fff",
            color: "#111",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          復元
        </button>

        <input
          ref={importFileRef}
          type="file"
          accept="application/json"
          style={{
            display: "none",
          }}
          onChange={async (event) => {
            const file =
              event.target.files?.[0];

            if (!file) return;

            await importBackup(file);

            event.currentTarget.value = "";
          }}
        />

        <button
          type="button"
          onClick={openPrintView}
          style={{
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            cursor: "pointer",
            fontWeight: 900,
            fontSize: 12,
          }}
        >
          印刷 / PDF
        </button>

        <button
          type="button"
          onClick={() =>
            setSelectedYm((value) =>
              addMonths(value, -1)
            )
          }
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ◀
        </button>

        <div
          style={{
            fontWeight: 900,
            fontSize: 18,
          }}
        >
          {fmtYM(selectedYm)}
        </div>

        <button
          type="button"
          onClick={() =>
            setSelectedYm((value) =>
              addMonths(value, 1)
            )
          }
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 800,
          }}
        >
          ▶
        </button>
      </div>
    </>
  );
}