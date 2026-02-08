"use client";

import { Transaction } from "./types";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP"); // 例: 2026/02/08
}

export default function TransactionList({
  transactions,
  onEdit,
  onDeleted,
}: {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDeleted: (id: number) => void; // ✅ 修正：引数idを受け取る
}) {
  const remove = async (id: number) => {
    const res = await fetch(`/api/transactions?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      alert(e?.error ?? "削除に失敗しました");
      return;
    }
    await onDeleted(id); // ✅ 修正：削除したidを親に通知
  };

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>履歴</div>

      <div style={{ display: "grid", gap: 10 }}>
        {transactions.map((t) => (
          <div
            key={t.id}
            style={{
              border: "1px solid #eee",
              borderRadius: 12,
              padding: 14,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>
                {(t.type === "expense" ? -t.amount : t.amount).toLocaleString("ja-JP")}円
              </div>
              <div style={{ fontSize: 13, opacity: 0.75 }}>
                {t.category} ・ {formatDate(t.occurredAt)}
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                onClick={() => onEdit(t)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  cursor: "pointer",
                }}
              >
                編集
              </button>
              <button
                onClick={() => remove(t.id)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 10,
                  border: "1px solid #f2b3b3",
                  color: "#b42318",
                  background: "#fff0f0",
                  cursor: "pointer",
                }}
              >
                削除
              </button>
            </div>
          </div>
        ))}

        {transactions.length === 0 && (
          <div style={{ opacity: 0.7 }}>まだ履歴がありません</div>
        )}
      </div>
    </div>
  );
}