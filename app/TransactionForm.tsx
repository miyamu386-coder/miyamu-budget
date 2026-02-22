"use client";

import { useEffect, useRef, useState } from "react";
import type { Transaction, TxType } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";

type Props = {
  onAdded?: (t: Transaction) => void;
  onUpdated?: (t: Transaction) => void;
  onCancelEdit?: () => void;
  editing?: Transaction | null;
  categorySuggestions?: string[];
  ringTitleResolver?: Array<{ title: string; category: string }>;
};

function toYMD(dateLike: string) {
  if (!dateLike) return "";
  return String(dateLike).slice(0, 10);
}

function normalizeAmountInput(s: string) {
  const half = s.replace(/[０-９．]/g, (ch) => {
    if (ch === "．") return ".";
    return String(ch.charCodeAt(0) - 0xfee0);
  });
  return half.replace(/,/g, "");
}

function parseAmountLike(input: string): number {
  if (!input) return 0;

  const half = input.replace(/[０-９．]/g, (ch) => {
    if (ch === "．") return ".";
    return String(ch.charCodeAt(0) - 0xfee0);
  });

  let s = half.trim().replace(/[,，\s]/g, "").replace(/円/g, "");

  const manMatch = s.match(/^(-?\d+(?:\.\d+)?)万$/);
  if (manMatch) return Math.round(Number(manMatch[1]) * 10000);

  const senMatch = s.match(/^(-?\d+(?:\.\d+)?)千$/);
  if (senMatch) return Math.round(Number(senMatch[1]) * 1000);

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

type ToastKind = "mofu" | "hina";

export default function TransactionForm({
  onAdded,
  onUpdated,
  onCancelEdit,
  editing,
  categorySuggestions = [],
  ringTitleResolver = [],
}: Props) {
  const [type, setType] = useState<TxType>(editing?.type ?? "expense");
  const [amountStr, setAmountStr] = useState(editing ? String(editing.amount) : "");
  const [category, setCategory] = useState(editing?.category ?? "");
  const [occurredAt, setOccurredAt] = useState(
    editing?.occurredAt ? toYMD(editing.occurredAt) : toYMD(new Date().toISOString())
  );
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setType(editing?.type ?? "expense");
    setAmountStr(editing ? String(editing.amount) : "");
    setCategory(editing?.category ?? "");
    setOccurredAt(editing?.occurredAt ? toYMD(editing.occurredAt) : toYMD(new Date().toISOString()));
  }, [editing]);

  // ✅ 保存成功トースト
  const [toast, setToast] = useState<null | { kind: ToastKind; text: string }>(null);
  const toastTimer = useRef<number | null>(null);

  function clearToast() {
    setToast(null);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
      toastTimer.current = null;
    }
  }

  function showToast(kind: ToastKind, text: string) {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  function decideToast(tt: TxType, cat: string) {
    const c = (cat ?? "").trim().toLowerCase();

    if (c === "ring:debt") return { kind: "mofu" as const, text: "借金も計画的に、な。" };

    const investWords = ["投資", "nisa", "ニーサ", "株", "積立", "つみたて", "資産", "運用", "配当"];
    if (investWords.some((w) => c.includes(w))) return { kind: "hina" as const, text: "未来のためにありがとう！" };

    if (c === "ring:save") return { kind: "hina" as const, text: "積み上げ、最高！" };

    return { kind: "mofu" as const, text: "記録できた。えらい。" };
  }

  useEffect(() => {
    return () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    };
  }, []);

  function normalizeCategoryInput(raw: string) {
    const v = (raw ?? "").trim();
    if (!v) return v;

    if (v.startsWith("ring:")) return v;

    for (const p of ringTitleResolver) {
      if ((p.title ?? "").trim() === v) return p.category;
    }
    return v;
  }

  async function handleSubmit() {
    const amount = parseAmountLike(amountStr);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert("金額は正の数で入力してください（例: 50000 / 5万 / 1.2万）");
      return;
    }

    const normalizedCategory = normalizeCategoryInput(category);
    if (!normalizedCategory.trim()) {
      alert("カテゴリを入力してください");
      return;
    }

    // ✅ ここがポイント：必ず await
    const key = await getOrCreateUserKey();

    setLoading(true);
    try {
      if (editing) {
        const res = await fetch("/api/transactions?id=" + editing.id, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": key, // cookieが本命だけど、互換で付けてもOK
          },
          body: JSON.stringify({ type, amount, category: normalizedCategory, occurredAt }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error ?? "update failed");
        }

        const updated: Transaction = await res.json();

        const t1 = decideToast(type, normalizedCategory);
        showToast(t1.kind, t1.text);

        onUpdated?.(updated);
      } else {
        const res = await fetch("/api/transactions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-user-key": key,
          },
          body: JSON.stringify({ type, amount, category: normalizedCategory, occurredAt }),
        });

        if (!res.ok) {
          const e = await res.json().catch(() => ({}));
          throw new Error(e?.error ?? "create failed");
        }

        const created: Transaction = await res.json();

        const t1 = decideToast(type, normalizedCategory);
        showToast(t1.kind, t1.text);

        onAdded?.(created);

        setAmountStr("");
      }
    } catch (e) {
      console.error(e);
      alert("保存に失敗しました");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 12, padding: 16, marginBottom: 16 }}>
      {toast && (
        <button
          type="button"
          onClick={clearToast}
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            padding: "10px 12px",
            borderRadius: 12,
            border: "1px solid rgba(0,0,0,0.08)",
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
            marginBottom: 12,
            cursor: "pointer",
            width: "100%",
          }}
          aria-label="toast"
        >
          <img
            src={toast.kind === "mofu" ? "/icons/mofu-chibi.png" : "/icons/hina-chibi.png"}
            alt={toast.kind}
            style={{ width: 46, height: 46, borderRadius: 999 }}
          />
          <div style={{ fontWeight: 900 }}>{toast.text}</div>
          <div style={{ marginLeft: "auto", opacity: 0.5, fontSize: 12 }}>×</div>
        </button>
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
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>金額</div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            value={amountStr}
            onChange={(e) => setAmountStr(normalizeAmountInput(e.target.value))}
            placeholder="例) 1200 / 5万"
            inputMode="text"
            style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
          />
          <span style={{ opacity: 0.7 }}>円</span>
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 6 }}>カテゴリ</div>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          onBlur={() => setCategory((v) => normalizeCategoryInput(v))}
          placeholder="例) コンビニ / 給料 / 返済 / 貯蓄 / 生活費"
          style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid #ccc" }}
        />

        {categorySuggestions.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
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