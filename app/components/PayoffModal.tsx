"use client";

import { useRef, useState } from "react";
import { toPng } from "html-to-image";

function yen(n: number) {
  return (n || 0).toLocaleString("ja-JP");
}

export default function PayoffModal({
  title,
  amount,
  date,
  onClose,
  isMobile,
}: {
  title: string;
  amount: number;
  date: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const captureRef = useRef<HTMLDivElement | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const saveAsImage = async () => {
    if (!captureRef.current || isDownloading) return;

    try {
      setIsDownloading(true);

      const dataUrl = await toPng(captureRef.current, {
        cacheBust: true,
        pixelRatio: 3,
        backgroundColor: "#f8fafc",
      });

      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `payoff-${date}.png`;
      link.click();
    } catch (e) {
      console.error(e);
      alert("画像保存に失敗しました");
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.42)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10060,
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(720px, 96vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#ffffff",
          borderRadius: 28,
          padding: isMobile ? 18 : 24,
          boxShadow: "0 30px 90px rgba(0,0,0,0.30)",
        }}
      >
        {/* ここが画像として保存される範囲 */}
        <div
          ref={captureRef}
          style={{
            width: isMobile ? 340 : 420,
            maxWidth: "100%",
            margin: "0 auto",
            padding: isMobile ? 22 : 28,
            borderRadius: 30,
            boxSizing: "border-box",
            background: "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
            boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.05)",
            textAlign: "center",
          }}
        >
          {/* 上部ビジュアル */}
          <div
            style={{
              position: "relative",
              borderRadius: 24,
              overflow: "hidden",
              padding: isMobile ? "10px 10px 0" : "12px 12px 0",
              background: "linear-gradient(180deg, #fff7ed 0%, #ffffff 55%)",
            }}
          >
            <img
              src="/payoff.png"
              alt="完済おめでとう"
              style={{
                width: "100%",
                display: "block",
                margin: "0 auto",
                objectFit: "contain",
              }}
            />
          </div>

          {/* メイン見出し */}
          <div
            style={{
              marginTop: 14,
              fontSize: isMobile ? 31 : 38,
              fontWeight: 900,
              lineHeight: 1.2,
              letterSpacing: "-0.02em",
              color: "#111827",
              wordBreak: "keep-all",
            }}
          >
            {title}
            <br />
            完済！！
          </div>

          {/* お祝いサブコピー */}
          <div
            style={{
              marginTop: 8,
              fontSize: isMobile ? 14 : 15,
              fontWeight: 800,
              color: "#ef4444",
              letterSpacing: "0.02em",
            }}
          >
            🎉 おめでとう！ コツコツ積み上げた結果です 🎉
          </div>

          {/* 情報カード */}
          <div
            style={{
              marginTop: 18,
              padding: isMobile ? "16px 14px" : "18px 18px",
              borderRadius: 22,
              background: "#ffffff",
              boxShadow: "0 10px 30px rgba(15,23,42,0.08)",
              border: "1px solid rgba(15,23,42,0.06)",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              <div
                style={{
                  padding: "12px 10px",
                  borderRadius: 16,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "rgba(17,24,39,0.58)",
                    marginBottom: 6,
                  }}
                >
                  完済額
                </div>
                <div
                  style={{
                    fontSize: isMobile ? 24 : 28,
                    fontWeight: 900,
                    color: "#111827",
                    lineHeight: 1.15,
                  }}
                >
                  {yen(amount)}円
                </div>
              </div>

              <div
                style={{
                  padding: "12px 10px",
                  borderRadius: 16,
                  background: "#f8fafc",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 800,
                    color: "rgba(17,24,39,0.58)",
                    marginBottom: 6,
                  }}
                >
                  完済日
                </div>
                <div
                  style={{
                    fontSize: isMobile ? 18 : 20,
                    fontWeight: 900,
                    color: "#111827",
                    lineHeight: 1.2,
                  }}
                >
                  {date}
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 14,
                paddingTop: 14,
                borderTop: "1px dashed rgba(17,24,39,0.12)",
                fontSize: isMobile ? 13 : 14,
                fontWeight: 700,
                color: "rgba(17,24,39,0.72)",
                lineHeight: 1.5,
              }}
            >
              返済の記録、ちゃんと積み上がってました。
              <br />
              次の目標もこの調子でいこう。
            </div>
          </div>

          {/* フッター */}
          <div
            style={{
              marginTop: 16,
              fontSize: 12,
              fontWeight: 900,
              color: "rgba(17,24,39,0.38)",
              letterSpacing: "0.08em",
            }}
          >
            MIYAMU MAKER
          </div>
        </div>

        {/* モーダル操作ボタン */}
        <div
          style={{
            display: "flex",
            gap: 10,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 18,
          }}
        >
          <button
            type="button"
            onClick={saveAsImage}
            disabled={isDownloading}
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid #111827",
              background: "#111827",
              color: "#ffffff",
              fontWeight: 900,
              fontSize: 15,
              cursor: isDownloading ? "not-allowed" : "pointer",
              opacity: isDownloading ? 0.65 : 1,
              minWidth: 148,
            }}
          >
            {isDownloading ? "保存中…" : "画像を保存"}
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "14px 18px",
              borderRadius: 14,
              border: "1px solid #d1d5db",
              background: "#ffffff",
              color: "#111827",
              fontWeight: 900,
              fontSize: 15,
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}