"use client";
export default function SaveCharaOverlay({
  kind,
  message,
  onClose,
  isMobile,
}: {
  kind: "mofu" | "hina";
  message: string;
  onClose: () => void;
  isMobile: boolean;
}) {
  const src = kind === "mofu" ? "/mofu-main.png" : "/hina.png";

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10050,
        pointerEvents: "auto",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        padding: isMobile ? 14 : 18,
        background: "rgba(0,0,0,0.12)",
      }}
      title="タップで閉じる"
    >
      <div
        style={{
          width: "min(720px, 96vw)",
          position: "relative",
          display: "flex",
          gap: 14,
          alignItems: "center",
          justifyContent: "center",
          padding: isMobile ? 12 : 14,
          borderRadius: 18,
          background: "rgba(255,255,255,0.92)",
          border: "1px solid rgba(0,0,0,0.06)",
          boxShadow: "0 18px 60px rgba(0,0,0,0.28)",
          animation: "miyamuPopIn 240ms ease-out both",
          transformOrigin: "50% 100%",
        }}
      >
        <img
          src={src}
          alt={kind}
          style={{
            width: isMobile ? 140 : 180,
            height: "auto",
            filter: "drop-shadow(0 18px 28px rgba(0,0,0,0.25))",
            animation: "miyamuNutto 520ms cubic-bezier(.2,.9,.2,1) both",
          }}
        />

        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 900 }}>保存</div>
          <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, marginTop: 6, lineHeight: 1.2 }}>{message}</div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.6 }}>※タップで閉じる</div>
        </div>
      </div>

      <style jsx>{`
        @keyframes miyamuPopIn {
          from {
            opacity: 0;
            transform: translateY(16px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes miyamuNutto {
          from {
            opacity: 0;
            transform: translateY(18px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}