"use client";

import { useState } from "react";
import type { Transaction, TxType } from "./types";

type Props = {
  // 追加/更新で再描画させるため
  onAdded?: (t: Transaction) => void;
  onUpdated?: (t: Transaction) => void;
  onCancelEdit?: () => void;

  // 編集中の取引（なければ新規）
  editing?: Transaction | null;

  // ✅ 親が作ったカテゴリ候補を受け取る（チップ表示用）
  categorySuggestions?: string[];
};

function toYMD(dateLike: string) {
  // "2026-02-08T..." -> "2026-02-08"
  if (!dateLike) return "";
  return String(dateLike).slice(0, 10);
}

function normalizeAmountInput(s: string) {
  // 全角→半角、カンマ除去
  const half = s.replace(/[０-９]/g, (ch) =>
    String(ch.charCodeAt(0) - 0xfee0)
  );
  return half.replace(/,/g, "");
}

export default function TransactionForm({
  onAdded,
  onUpdated,
  onCancelEdit,
  editing,
  categorySuggestions = [],
}: Props) {
  const [type, setType] = useState<TxType>(editing?.type ?? "expense");
  const [amountStr, setAmountStr] = useState(
    editing ? String(editing.amount) : ""
  );
  const [category, setCategory] = useState(editing?.category ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editing?.occurredAt
      ? toYMD(editing.occurredAt)
      : toYMD(new Date().toISOString())
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    const normalized = normalizeAmountInput(amountStr);
    const amount = Number(normalized);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("金額は正の数で入力してください");
      return;
    }
    if (!category.trim()) {
      alert("カテゴリを入力してください");
      return;
    }

    setLoading(true);
    try {
      if (editing) {
        // 更新
        const res = await fetch("/api/transactions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editing.id,
            type,
            amount,
            category: category.trim(),
            occurredAt, // "YYYY-MM-DD"
          }),
        });
        if (!res.ok) throw new Error("update failed");
        const updated: Transaction = await res.json();
        onUpdated?.(updated);
      } else {
        // 新規
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            amount,
            category: category.trim(),
            occurredAt, // "YYYY-MM-DD"
          }),
        });
        if (!res.ok) throw new Error("create failed");
        const created: Transaction = await res.json();
        onAdded?.(created);

        // 入力リセット（カテゴリは残す派なら消さなくてもOK）
        setAmountStr("");
        // setCategory("");
      }
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
      }}
    >
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button
          onClick={() => setType("expense")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: type === "expense" ? "#eee" : "#fff",
            cursor: "pointer",
          }}
        >
          支出
        </button>
        <button
          onClick={() => setType("income")}
          style={{
            padding: "8px 12px",
            borderRadius: 10,
            border: "1px solid #ccc",
            background: type === "income" ? "#eee" : "#fff",
            cursor: "pointer",
          }}
        >
          収入
        </button>
      </div>

      {/* 発生日 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>発生日</div>
        <input
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          placeholder="YYYY-MM-DD"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />
      </div>

      {/* 金額 */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>金額</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(normalizeAmountInput(e.target.value))}
            placeholder="例) 1200"
            inputMode="numeric"
            style={{
              width: "100%",
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
            }}
          />
          <span style={{ opacity: 0.7 }}>円</span>
        </div>
      </div>

      {/* カテゴリ */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
          カテゴリ
        </div>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="例) コンビニ / 給料"
          style={{
            width: "100%",
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
          }}
        />

        {/* ✅ 候補ボタン（親から受け取ったものを表示） */}
        {categorySuggestions.length > 0 && (
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              marginTop: 10,
            }}
          >
            {categorySuggestions.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 14 }}>
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          {editing ? "更新" : "保存"}
        </button>

        {editing && (
          <button
            type="button"
            onClick={onCancelEdit}
            style={{
              padding: 12,
              borderRadius: 10,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
              minWidth: 120,
            }}
          >
            キャンセル
          </button>
        )}
      </div>
    </div>
  );
}
