"use client";

import { useState } from "react";
import { Transaction } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";

function formatDate(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("ja-JP");
}

export default function TransactionList({
  transactions,
  onEdit,
  onDeleted,
  resolveCategoryLabel,
}: {
  transactions: Transaction[];
  onEdit: (t: Transaction) => void;
  onDeleted: (id: number) => void;
  resolveCategoryLabel?: (category: string) => string;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const remove = async (id: number) => {
    if (deletingId === id) return;

    // ✅ Promise<string> なので await が必要
    const userKey = await getOrCreateUserKey();

    setDeletingId(id);
    try {
      const res = await fetch(`/api/transactions?id=${id}`, {
        method: "DELETE",
        headers: {
          "x-user-key": userKey,
        },
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e?.error ?? "削除に失敗しました");
        return;
      }

      onDeleted(id);
    } catch (e) {
      console.error(e);
      alert("削除に失敗しました");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div>
      <div style={{ fontWeight: 700, marginBottom: 10 }}>履歴</div>

      <div style={{ display: "grid", gap: 10 }}>
        {transactions.map((t) => {
          const label = resolveCategoryLabel ? resolveCategoryLabel(t.category ?? "") : t.category ?? "";
          return (
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
                  {label} ・ {formatDate(t.occurredAt)}
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
                  disabled={deletingId === t.id}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 10,
                    border: "1px solid #f2b3b3",
                    color: "#b42318",
                    background: "#fff0f0",
                    cursor: "pointer",
                    opacity: deletingId === t.id ? 0.6 : 1,
                  }}
                >
                  削除
                </button>
              </div>
            </div>
          );
        })}

        {transactions.length === 0 && <div style={{ opacity: 0.7 }}>まだ履歴がありません</div>}
      </div>
    </div>
  );
}
