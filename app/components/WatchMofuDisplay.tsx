"use client";

type WatchMofuSpeech = {
  show: boolean;
  key: number;
  text: string;
};

type Props = {
  isMobile: boolean;
  speech: WatchMofuSpeech;
};

export default function WatchMofuDisplay({
  isMobile,
  speech,
}: Props) {
  return (
    <>
      {!speech.show && (
        <img
          src="/mofu-watch.png"
          alt="watch mofu"
          style={{
            position: "absolute",
            left: "50%",
            top: isMobile ? "-10px" : "-40px",
            transform: "translateX(-50%)",
            width: isMobile ? 280 : 520,
            opacity: 0.5,
            pointerEvents: "none",
            zIndex: 1,
          }}
        />
      )}

      {speech.show && (
        <>
          <img
            src="/mofu-watch.png"
            alt="watch mofu"
            style={{
              position: "absolute",
              left: "50%",
              top: isMobile ? "-10px" : "-40px",
              transform: "translateX(-50%)",
              width: isMobile ? 280 : 520,
              height: "auto",
              zIndex: 19,
              pointerEvents: "none",
              filter:
                "drop-shadow(0 20px 40px rgba(0,0,0,0.25))",
              animation:
                "watchMofuNutto 220ms ease-out both",
            }}
          />

          <div
            key={speech.key}
            style={{
              position: "absolute",
              left: "50%",
              top: isMobile ? "78px" : "112px",
              transform: "translateX(-50%)",
              background: "rgba(255,255,255,0.92)",
              border:
                "1px solid rgba(0,0,0,0.10)",
              borderRadius: 16,
              padding: isMobile
                ? "9px 12px"
                : "10px 14px",
              fontSize: isMobile ? 12 : 13,
              fontWeight: 900,
              boxShadow:
                "0 14px 32px rgba(0,0,0,0.12)",
              zIndex: 20,
              pointerEvents: "none",
              animation:
                "watchMofuPop 220ms ease-out both",
              maxWidth: "min(420px, 92vw)",
              textAlign: "center",
            }}
          >
            {speech.text}

            <div
              style={{
                position: "absolute",
                left: "50%",
                bottom: -8,
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft:
                  "8px solid transparent",
                borderRight:
                  "8px solid transparent",
                borderTop:
                  "8px solid rgba(255,255,255,0.92)",
                filter:
                  "drop-shadow(0 6px 8px rgba(0,0,0,0.10))",
              }}
            />
          </div>
        </>
      )}

      <style jsx>{`
        @keyframes watchMofuPop {
          from {
            opacity: 0;
            transform: translateX(-50%)
              translateY(10px)
              scale(0.98);
          }

          to {
            opacity: 1;
            transform: translateX(-50%)
              translateY(0)
              scale(1);
          }
        }

        @keyframes watchMofuNutto {
          from {
            opacity: 0;
            transform: translateX(-50%)
              translateY(12px)
              scale(0.96);
          }

          to {
            opacity: 1;
            transform: translateX(-50%)
              translateY(0)
              scale(1);
          }
        }
      `}</style>
    </>
  );
}