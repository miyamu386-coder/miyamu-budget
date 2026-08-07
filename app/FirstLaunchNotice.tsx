"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "miyamuMakerFirstLaunchNotice_v1";

export default function FirstLaunchNotice() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const confirmed = localStorage.getItem(STORAGE_KEY);

    if (confirmed !== "done") {
      setShow(true);
    }
  }, []);

  const handleConfirm = () => {
    localStorage.setItem(STORAGE_KEY, "done");
    setShow(false);
  };

  if (!show) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 420,
          background: "#fff",
          borderRadius: 20,
          padding: "28px 24px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.2)",
          color: "#222",
        }}
      >
        <h2
          style={{
            margin: "0 0 14px",
            fontSize: 22,
            textAlign: "center",
          }}
        >
          みやむMakerをご利用いただく前に
        </h2>

        <p
          style={{
            color: "#d32f2f",
            fontWeight: 700,
            textAlign: "center",
            margin: "0 0 20px",
          }}
        >
          ※資産管理アプリとなります。
        </p>

        <div
          style={{
            fontSize: 15,
            lineHeight: 1.8,
            marginBottom: 24,
          }}
        >
          <p>・入力したデータは端末内に保存されます。</p>

          <p>
            ・アプリの削除や端末の変更等により、データが失われる場合があります。
          </p>

          <p>
            ・大切なデータは定期的にバックアップしてください。
          </p>

          <p>
            ・表示される金額や集計結果は、入力された内容をもとに算出しています。
          </p>
        </div>

        <button
          type="button"
          onClick={handleConfirm}
          style={{
            width: "100%",
            border: "none",
            borderRadius: 14,
            padding: "14px 16px",
            fontSize: 16,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          確認してはじめる
        </button>
      </div>
    </div>
  );
}