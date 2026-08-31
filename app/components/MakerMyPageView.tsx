"use client";

import {
    useState,
    type RefObject,
} from "react";

type Props = {
    exportBackup: () => void;
    importFileRef: RefObject<HTMLInputElement | null>;
    importBackup: (
        file: File
    ) => Promise<void>;
};

export default function MakerMyPageView({
    exportBackup,
    importFileRef,
    importBackup,
}: Props) {
    const [view, setView] =
        useState<"menu" | "settings">("menu");

    if (view === "settings") {
        return (
            <section
                style={{
                    maxWidth: 520,
                    margin: "0 auto",
                    padding: "24px 0 110px",
                }}
            >
                <button
                    type="button"
                    onClick={() =>
                        setView("menu")
                    }
                    style={buttonStyle}
                >
                    ← マイページへ戻る
                </button>

                <h2
                    style={{
                        margin: "20px 0",
                        fontSize: 24,
                        fontWeight: 800,
                        textAlign: "center",
                    }}
                >
                    このアプリについて
                </h2>

                <div
                    style={{
                        padding: "18px",
                        borderRadius: 16,
                        background: "#fff",
                        border:
                            "1px solid rgba(0, 0, 0, 0.12)",
                    }}
                >
                    <div
                        style={{
                            fontSize: 14,
                            color: "#666",
                            marginBottom: 6,
                        }}
                    >
                        アプリ名
                    </div>

                    <div
                        style={{
                            fontSize: 18,
                            fontWeight: 800,
                            color: "#222",
                            marginBottom: 10,
                        }}
                    >
                        みやむMaker
                    </div>

                    <div
                        style={{
                            fontSize: 14,
                            lineHeight: 1.7,
                            color: "#555",
                        }}
                    >
                        お金の流れや資産の状況を、
                        リングで見える化して管理するアプリです。
                        日々の記録から、貯蓄や目標まで
                        ひとつの画面で確認できます。
                    </div>
                </div>
            </section>
        );
    }

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
                マイページ
            </h2>

            <div
                style={{
                    display: "grid",
                    gap: 12,
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
                    accept="application/json,.json"
                    onChange={(event) => {
                        const file =
                            event.target.files?.[0];

                        if (!file) return;

                        void importBackup(file);

                        event.target.value = "";
                    }}
                    style={{ display: "none" }}
                />

                <button
                    type="button"
                    onClick={() =>
                        setView("settings")
                    }
                    style={buttonStyle}
                >
                    このアプリについて
                </button>
            </div>
        </section>
    );
}

const buttonStyle = {
    minHeight: 56,
    padding: "0 18px",
    border:
        "1px solid rgba(0, 0, 0, 0.12)",
    borderRadius: 16,
    background: "#fff",
    color: "#222",
    fontSize: 16,
    fontWeight: 700,
    cursor: "pointer",
} as const;