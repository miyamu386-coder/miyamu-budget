"use client";

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

      <TransactionList
        transactions={transactions}
        onEdit={startEdit}
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