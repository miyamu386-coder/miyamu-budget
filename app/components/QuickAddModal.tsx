"use client";

import type React from "react";
import type { Transaction } from "../types";
import HoldingManager from "./HoldingManager";
import { yen } from "../../lib/format";
import { ymdToMonthKey } from "../../lib/dateUtils";

type RingMode = "both" | "income_only" | "expense_only";
type TxType = "income" | "expense";
type QuickView = "form" | "history" | "holdings";

type HoldingKind = "国内株" | "米国ETF" | "投資信託" | "現金";

type Holding = {
  id: string;
  ringKey: string;
  name: string;
  shares: number;
  unit?: "株" | "口";
  value: number;
  kind?: HoldingKind;
};

type QuickMeta = {
  ringKey: string;
  title: string;
  mode: RingMode;
};

type Props = {
  meta: QuickMeta | null;
  quickView: QuickView;
  setQuickView: React.Dispatch<React.SetStateAction<QuickView>>;
  quickType: TxType;
  setQuickType: React.Dispatch<React.SetStateAction<TxType>>;
  quickDate: string;
  setQuickDate: React.Dispatch<React.SetStateAction<string>>;
  quickAmountStr: string;
  setQuickAmountStr: React.Dispatch<React.SetStateAction<string>>;
  quickDetail: string;
  setQuickDetail: React.Dispatch<React.SetStateAction<string>>;
  isSavingQuick: boolean;
  selectedYm: string;
  transactions: Transaction[];
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  closeQuickAdd: () => void;
  saveQuickAdd: () => void;
  startEdit: (t: Transaction) => void;
  parseAmountLike: (s: string) => number;
  makeId: () => string;
  ringCategory: (ringKey: string) => string;
};

export default function QuickAddModal({
  meta,
  quickView,
  setQuickView,
  quickType,
  setQuickType,
  quickDate,
  setQuickDate,
  quickAmountStr,
  setQuickAmountStr,
  quickDetail,
  setQuickDetail,
  isSavingQuick,
  selectedYm,
  transactions,
  holdings,
  setHoldings,
  closeQuickAdd,
  saveQuickAdd,
  startEdit,
  parseAmountLike,
  makeId,
  ringCategory,
}: Props) {
  if (!meta) return null;

  const mode = meta.mode;
  const showTabs = mode === "both";
  const isDebt = meta.title.includes("ローン");
  const isInvest = meta.title.includes("証券");

  const expenseLabel = isDebt ? "借入" : isInvest ? "売却" : "支出";
  const incomeLabel = isDebt ? "返済" : isInvest ? "積立" : "収入";

  const forcedType: TxType =
    meta.mode === "income_only"
      ? "income"
      : meta.mode === "expense_only"
      ? "expense"
      : quickType;

  if (quickView === "holdings") {
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
          zIndex: 9999,
        }}
        onClick={closeQuickAdd}
      >
        <div
          style={{
            width: "min(520px, 96vw)",
            maxHeight: "88vh",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
            background: "#fff",
            borderRadius: 16,
            padding: 16,
            boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <HoldingManager
            ringKey={meta.ringKey}
            holdings={holdings}
            setHoldings={setHoldings}
            closeQuickAdd={closeQuickAdd}
            parseAmountLike={parseAmountLike}
            makeId={makeId}
          />
        </div>
      </div>
    );
  }

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
        zIndex: 9999,
      }}
      onClick={closeQuickAdd}
    >
      <div
        style={{
          width: "min(520px, 96vw)",
          maxHeight: "88vh",
          overflowY: "auto",
          WebkitOverflowScrolling: "touch",
          background: "#fff",
          borderRadius: 16,
          padding: 16,
          boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {quickView === "history" ? (
          <>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
              入力一覧：{meta.title}
            </div>

            <button
              type="button"
              onClick={() => setQuickView("form")}
              style={{
                padding: "10px 12px",
                borderRadius: 12,
                border: "1px solid #ddd",
                background: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                marginBottom: 12,
              }}
            >
              ← 入力に戻る
            </button>

            <div style={{ display: "grid", gap: 8 }}>
              {transactions
                .filter((t) => {
                  const ymd = (t.occurredAt ?? "").slice(0, 10);
                  return (
                    (t.category ?? "") === ringCategory(meta.ringKey) &&
                    ymdToMonthKey(ymd) === selectedYm
                  );
                })
                .slice()
                .sort((a, b) =>
                  String(a.occurredAt ?? "").localeCompare(
                    String(b.occurredAt ?? "")
                  )
                )
                .map((t) => (
                  <div
                    key={t.id}
                    style={{
                      padding: 12,
                      borderRadius: 12,
                      border: "1px solid #eee",
                      background: "#fff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 8,
                        gap: 10,
                      }}
                    >
                      <div style={{ fontWeight: 900 }}>
                        {(t.occurredAt ?? "").slice(5, 10).replace("-", "/")}{" "}
                        {t.type === "income" ? "+" : "-"}
                        {yen(t.amount)}円
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          startEdit(t);
                          closeQuickAdd();
                        }}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 10,
                          border: "1px solid #ddd",
                          background: "#fff",
                          fontWeight: 900,
                          cursor: "pointer",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                        }}
                      >
                        編集
                      </button>
                    </div>

                    {t.detailCategory && (
                      <div
                        style={{
                          fontSize: 12,
                          opacity: 0.7,
                          marginTop: 4,
                        }}
                      >
                        {t.detailCategory}
                      </div>
                    )}
                  </div>
                ))}

              {transactions.filter((t) => {
                const ymd = (t.occurredAt ?? "").slice(0, 10);
                return (
                  (t.category ?? "") === ringCategory(meta.ringKey) &&
                  ymdToMonthKey(ymd) === selectedYm
                );
              }).length === 0 && (
                <div style={{ fontSize: 13, opacity: 0.65 }}>
                  入力履歴がありません
                </div>
              )}
            </div>
          </>
        ) : (
          <>
            <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 10 }}>
              入力：{meta.title}
            </div>

            {showTabs && (
              <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
                <button
                  type="button"
                  onClick={() => setQuickType("expense")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border:
                      quickType === "expense"
                        ? "2px solid #111"
                        : "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    flex: 1,
                  }}
                >
                  {expenseLabel}
                </button>

                <button
                  type="button"
                  onClick={() => setQuickType("income")}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 12,
                    border:
                      quickType === "income"
                        ? "2px solid #111"
                        : "1px solid #ddd",
                    background: "#fff",
                    cursor: "pointer",
                    fontWeight: 900,
                    flex: 1,
                  }}
                >
                  {incomeLabel}
                </button>
              </div>
            )}

            {!showTabs && (
              <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 12 }}>
                {mode === "income_only"
                  ? "このリングは「収入のみ」入力です"
                  : "このリングは「支出のみ」入力です"}
              </div>
            )}

            <div style={{ display: "grid", gap: 10 }}>
              <label style={{ fontSize: 12, opacity: 0.75 }}>
                発生日
                <input
                  value={quickDate}
                  onChange={(e) => setQuickDate(e.target.value)}
                  type="date"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontSize: 14,
                    marginTop: 6,
                  }}
                />
              </label>

              <label style={{ fontSize: 12, opacity: 0.75 }}>
                金額（円）
                <input
                  value={quickAmountStr}
                  onChange={(e) => setQuickAmountStr(e.target.value)}
                  inputMode="text"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontSize: 16,
                    marginTop: 6,
                  }}
                  placeholder="例) 50000 / 5万 / 1.2万"
                />
              </label>

              <label style={{ fontSize: 12, opacity: 0.75 }}>
                detailCategory（内訳）
                <input
                  value={quickDetail}
                  onChange={(e) => setQuickDetail(e.target.value)}
                  inputMode="text"
                  style={{
                    width: "100%",
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    fontSize: 16,
                    marginTop: 6,
                  }}
                  placeholder={
                    forcedType === "income"
                      ? "例）報酬 / 給与 / その他"
                      : "例）コンビニ / 外食 / スーパー"
                  }
                />
              </label>

              <div
                style={{
                  marginTop: 16,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  onClick={() => setQuickView("history")}
                  style={{
                    padding: "10px 12px",
                    borderRadius: 12,
                    border: "1px solid #ddd",
                    background: "#fff",
                    fontWeight: 900,
                    cursor: "pointer",
                    fontSize: 13,
                  }}
                >
                  入力一覧
                </button>
              </div>
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                marginTop: 12,
                position: "sticky",
                bottom: 0,
                background: "#fff",
                paddingTop: 10,
              }}
            >
              <button
                type="button"
                onClick={saveQuickAdd}
                disabled={isSavingQuick}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 900,
                  width: 140,
                  cursor: isSavingQuick ? "not-allowed" : "pointer",
                  opacity: isSavingQuick ? 0.6 : 1,
                }}
              >
                {isSavingQuick ? "保存中…" : "保存"}
              </button>

              <button
                type="button"
                onClick={closeQuickAdd}
                disabled={isSavingQuick}
                style={{
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#333",
                  fontWeight: 900,
                  width: 140,
                  cursor: isSavingQuick ? "not-allowed" : "pointer",
                  opacity: isSavingQuick ? 0.6 : 1,
                }}
              >
                キャンセル
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}