"use client";

import { useState } from "react";
import TransactionList from "../TransactionList";
import { Transaction } from "../types";
import { fmtYM, addMonths } from "../../lib/dateUtils";

type Props = {
  selectedYm: string;
  setSelectedYm: React.Dispatch<React.SetStateAction<string>>;

  transactions: Transaction[];

  editing: Transaction | null;
  setEditing: React.Dispatch<React.SetStateAction<Transaction | null>>;
  setTransactions: React.Dispatch<React.SetStateAction<Transaction[]>>;

  resolveCategoryLabel: (category: string) => string;

  startEdit: (t: Transaction) => void;

  onBack: () => void;
};

export default function TransactionHistoryView({
  selectedYm,
  setSelectedYm,
  transactions,
  editing,
  setEditing,
  setTransactions,
  resolveCategoryLabel,
  startEdit,
  onBack,
}: Props) {
  const [editingAmountStr, setEditingAmountStr] =
    useState("");

  return (
    <div
      style={{
        padding: 14,
        maxWidth: 980,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <button
          type="button"
          onClick={onBack}
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
          入力に戻る
        </button>

        <button
          type="button"
          onClick={() => setSelectedYm((v) => addMonths(v, -1))}
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

        <div style={{ fontWeight: 900, fontSize: 18 }}>
          {fmtYM(selectedYm)}
        </div>

        <button
          type="button"
          onClick={() => setSelectedYm((v) => addMonths(v, 1))}
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
      {editing && (
        <div
          style={{
            marginBottom: 16,
            padding: 14,
            borderRadius: 12,
            border: "1px solid #ddd",
            background: "#fafafa",
          }}
        >
          <div
            style={{
              fontWeight: 900,
              marginBottom: 8,
            }}
          >
            金額変更
          </div>

          <input
            value={editingAmountStr}
            onChange={(e) =>
              setEditingAmountStr(e.target.value)
            }
            inputMode="text"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 12,
              border: "1px solid #ddd",
              fontSize: 16,
            }}
          />
          <button
            type="button"
            onClick={() => {
              const amount = Number(
                editingAmountStr.replace(/,/g, "")
              );

              if (!Number.isFinite(amount) || amount <= 0) {
                alert("金額を入力してください");
                return;
              }

              setTransactions((prev) =>
                prev.map((t) =>
                  t.id === editing.id
                    ? { ...t, amount }
                    : t
                )
              );

              setEditing(null);
              setEditingAmountStr("");
            }}
            style={{
              marginTop: 10,
              padding: "10px 14px",
              borderRadius: 12,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            更新
          </button>
        </div>
      )}

      <TransactionList
        transactions={transactions}
        onEdit={(t) => {
          startEdit(t);
          setEditingAmountStr(String(t.amount));
        }}
        onDeleted={(id) => {
          setTransactions((prev) => prev.filter((t) => t.id !== id));

          if (editing?.id === id) {
            setEditing(null);
          }
        }}
        resolveCategoryLabel={resolveCategoryLabel}
      />
    </div>
  );
}