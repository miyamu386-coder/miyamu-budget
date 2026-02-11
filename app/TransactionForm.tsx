"use client";

import { useEffect, useState } from "react";
import type { Transaction, TxType } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";

// ✅ userKey UI は「ローカル開発(next dev)」だけ表示（Vercelは常に非表示）
const SHOW_USERKEY_UI = process.env.NODE_ENV === "development";

// lib/userKey.ts と同じキー名（ここだけ一致させる）
const STORAGE_KEY = "miyamu_budget_user_key";

type Props = {
  onAdded?: (t: Transaction) => void;
  onUpdated?: (t: Transaction) => void;
  onCancelEdit?: () => void;

  editing?: Transaction | null;
  categorySuggestions?: string[];
};

function toYMD(dateLike: string) {
  if (!dateLike) return "";
  return String(dateLike).slice(0, 10);
}

function normalizeAmountInput(s: string) {
  const half = s.replace(/[０-９]/g, (ch) =>
    String(ch.charCodeAt(0) - 0xfee0)
  );
  return half.replace(/,/g, "");
}

function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
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

  // ✅ editing が変わったらフォームの中身も同期
  useEffect(() => {
    setType(editing?.type ?? "expense");
    setAmountStr(editing ? String(editing.amount) : "");
    setCategory(editing?.category ?? "");
    setOccurredAt(
      editing?.occurredAt
        ? toYMD(editing.occurredAt)
        : toYMD(new Date().toISOString())
    );
  }, [editing]);

  // --- userKey UI（ローカル開発だけ）
  const [userKey, setUserKey] = useState<string>("");
  const [userKeyInput, setUserKeyInput] = useState("");

  useEffect(() => {
    if (!SHOW_USERKEY_UI) return;
    const k = getOrCreateUserKey();
    setUserKey(k);
    setUserKeyInput(k);
  }, []);

  const applyUserKey = () => {
    const next = normalizeUserKeyInput(userKeyInput);
    if (next.length < 8 || next.length > 64) {
      alert("userKey は8〜64文字で入力してください（英数字推奨）");
      return;
    }
    localStorage.setItem(STORAGE_KEY, next);
    setUserKey(next);
    alert("切替しました。ページをリロードすると一覧取得が切り替わります。");
  };

  const regenerateUserKey = () => {
    localStorage.removeItem(STORAGE_KEY);
    const next = getOrCreateUserKey();
    setUserKey(next);
    setUserKeyInput(next);
    alert("再生成しました。ページをリロードすると一覧取得が切り替わります。");
  };

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

    const key = getOrCreateUserKey();

    setLoading(true);
    try {
      if (editing) {
        const res = await fetch("/api/transactions?id=" + editing.id, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": key,
          },
          body: JSON.stringify({
            type,
            amount,
            category: category.trim(),
            occurredAt,
          }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error ?? "update failed");
        }

        const updated: Transaction = await res.json();
        onUpdated?.(updated);
      } else {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": key,
          },
          body: JSON.stringify({
            type,
            amount,
            category: category.trim(),
            occurredAt,
          }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error ?? "create failed");
        }

        const created: Transaction = await res.json();
        onAdded?.(created);

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
      {/* ✅ userKey UI（ローカルだけ表示） */}
      {SHOW_USERKEY_UI && (
        <div
          style={{
            border: "1px dashed #ddd",
            borderRadius: 12,
            padding: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>
            userKey（この端末のデータ切替・デモ用）
          </div>
          <input
            value={userKeyInput}
            onChange={(e) => setUserKeyInput(e.target.value)}
            placeholder="8〜64文字（例：itchy-2026）"
            style={{
              width: "100%",
              padding: 10,
              borderRadius: 10,
              border: "1px solid #ccc",
              fontSize: 12,
            }}
          />
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button
              type="button"
              onClick={applyUserKey}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              このuserKeyに切替
            </button>
            <button
              type="button"
              onClick={regenerateUserKey}
              style={{
                padding: "8px 10px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#fff",
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              再生成
            </button>
          </div>
          <div style={{ marginTop: 8, fontSize: 11, opacity: 0.65 }}>
            ※切替後はページをリロードすると、一覧取得が新しいuserKeyに切り替わります
          </div>
        </div>
      )}

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

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>カテゴリ</div>
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