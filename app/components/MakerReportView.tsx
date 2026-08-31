"use client";

type Props = {
    onOpenHistory: () => void;
    onExportMonthlyImage: () => void;
    onOpenPrintView: () => void;
};

export default function MakerReportView({
    onOpenHistory,
    onExportMonthlyImage,
    onOpenPrintView,
}: Props) {
    return (
        <section
            style={{
                maxWidth: 520,
                margin: "0 auto",
                padding: "24px 0 110px",
            }}
        >
            <h2
                style={{
                    margin: "0 0 20px",
                    fontSize: 24,
                    fontWeight: 800,
                    textAlign: "center",
                }}
            >
                明細・レポート
            </h2>
            <div
                style={{
                    display: "grid",
                    gap: 12,
                }}
            >
                <button
                    type="button"
                    onClick={onOpenHistory}
                    style={buttonStyle}
                >
                    取引履歴
                </button>

                <button
                    type="button"
                    onClick={onExportMonthlyImage}
                    style={buttonStyle}
                >
                    月レポート保存
                </button>

                <button
                    type="button"
                    onClick={onOpenPrintView}
                    style={buttonStyle}
                >
                    PDF
                </button>
            </div>
        </section>
    );
}

const buttonStyle = {
    minHeight: 56,
    padding: "0 18px",
    border: "1px solid rgba(0, 0, 0, 0.12)",
    borderRadius: 16,
    background: "#fff",
    color: "#222",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
} as const;