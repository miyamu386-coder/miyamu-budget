"use client";

import { useEffect, useRef, useState } from "react";
import type { Transaction, TxType } from "./types";
import { getOrCreateUserKey } from "../lib/userKey";

// ✅ userKey UI は「ローカル開発(next dev)」だけ表示
const SHOW_USERKEY_UI = process.env.NODE_ENV === "development";

const STORAGE_KEY = "miyamu_budget_user_key";

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

function normalizeUserKeyInput(s: string) {
  return s.trim().slice(0, 64);
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

  // --- userKey UI（ローカルのみ）
  const [userKey, setUserKey] = useState<string>("");
  const [userKeyInput, setUserKeyInput] = useState("");

  useEffect(() => {
    if (!SHOW_USERKEY_UI) return;

    (async () => {
      const k = await getOrCreateUserKey();   // ✅ await追加
      setUserKey(k);
      setUserKeyInput(k);
    })().catch(console.error);
  }, []);

  const applyUserKey = () => {
    const next = normalizeUserKeyInput(userKeyInput);
    if (next.length < 8 || next.length > 64) {
      alert("userKey は8〜64文字で入力してください");
      return;
    }
    localStorage.setItem(STORAGE_KEY, next);
    setUserKey(next);
    alert("切替しました。リロードしてください。");
  };

  const regenerateUserKey = async () => {     // ✅ async追加
    localStorage.removeItem(STORAGE_KEY);
    const next = await getOrCreateUserKey();  // ✅ await追加
    setUserKey(next);
    setUserKeyInput(next);
    alert("再生成しました。リロードしてください。");
  };

  const [toast, setToast] = useState<null | { kind: ToastKind; text: string }>(null);
  const toastTimer = useRef<number | null>(null);

  function showToast(kind: ToastKind, text: string) {
    setToast({ kind, text });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2000);
  }

  function decideToast(tt: TxType, cat: string) {
    const c = (cat ?? "").trim().toLowerCase();

    if (c === "ring:debt") {
      return { kind: "mofu" as const, text: "借金も計画的に、な。" };
    }

    const investWords = ["投資", "nisa", "ニーサ", "株", "積立", "つみたて", "資産", "運用", "配当"];
    if (investWords.some((w) => c.includes(w))) {
      return { kind: "hina" as const, text: "未来のためにありがとう！" };
    }

    if (c === "ring:save") {
      return { kind: "hina" as const, text: "積み上げ、最高！" };
    }

    return { kind: "mofu" as const, text: "記録できた。えらい。" };
  }

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
      alert("金額は正の数で入力してください");
      return;
    }

    const normalizedCategory = normalizeCategoryInput(category);
    if (!normalizedCategory.trim()) {
      alert("カテゴリを入力してください");
      return;
    }

    const key = await getOrCreateUserKey();   // ✅ await追加

    setLoading(true);
    try {
      const endpoint = editing
        ? `/api/transactions?id=${editing.id}`
        : "/api/transactions";

      const method = editing ? "PATCH" : "POST";

      const res = await fetch(endpoint, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-user-key": key,
        },
        body: JSON.stringify({
          type,
          amount,
          category: normalizedCategory,
          occurredAt,
        }),
      });

      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e?.error ?? "save failed");
      }

      const result: Transaction = await res.json();

      const t1 = decideToast(type, normalizedCategory);
      showToast(t1.kind, t1.text);

      if (editing) {
        onUpdated?.(result);
      } else {
        onAdded?.(result);
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
        <div style={{ marginBottom: 12, fontWeight: 900 }}>
          {toast.text}
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading}>
        {editing ? "更新" : "保存"}
      </button>
    </div>
  );
}

