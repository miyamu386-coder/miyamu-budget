import { useState } from "react";

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

type Props = {
  ringKey: string;
  holdings: Holding[];
  setHoldings: React.Dispatch<React.SetStateAction<Holding[]>>;
  closeQuickAdd: () => void;
  parseAmountLike: (input: string) => number;
  makeId: () => string;
};

export default function HoldingManager({
  ringKey,
  holdings,
  setHoldings,
  closeQuickAdd,
  parseAmountLike,
  makeId,
}: Props) {
  const [holdingEditId, setHoldingEditId] = useState<string | null>(null);
  const [holdingName, setHoldingName] = useState("");
  const [holdingKind, setHoldingKind] = useState<HoldingKind>("投資信託");
  const [holdingShares, setHoldingShares] = useState("");
  const [holdingUnit, setHoldingUnit] = useState<"株" | "口">("株");
  const [holdingValue, setHoldingValue] = useState("");

  const holdingColors: Record<HoldingKind, string> = {
    国内株: "#2563eb",
    米国ETF: "#f59e0b",
    投資信託: "#10b981",
    現金: "#9ca3af",
  };

  const currentHoldings = holdings
    .filter((h) => h.ringKey === ringKey)
    .slice()
    .sort((a, b) => b.value - a.value);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ fontWeight: 900, fontSize: 22 }}>
        持ち株一覧
      </div>

      <button type="button" onClick={closeQuickAdd}>
        ← 戻る
      </button>

      {currentHoldings.length === 0 && (
        <div style={{ opacity: 0.6, fontSize: 14 }}>
          まだ銘柄がありません
        </div>
      )}

      
      {currentHoldings.map((h) => (
        <div
          key={h.id}
          style={{
            padding: "12px 0",
            borderBottom: "1px solid #eee",
          }}
        >
         <div
  style={{
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    fontSize: 18,
  }}
>
  <span
    style={{
      width: 12,
      height: 12,
      borderRadius: "50%",
      background: holdingColors[h.kind ?? "投資信託"],
      display: "inline-block",
    }}
  />
  <span>{h.name}</span>
</div>

          <div style={{ marginTop: 4, fontSize: 16 }}>
            {h.shares}{h.unit ?? "株"}　¥{h.value.toLocaleString()}
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }}>
            <button
              type="button"
              onClick={() => {
                setHoldingEditId(h.id);
                setHoldingName(h.name);
                setHoldingShares(String(h.shares));
                setHoldingUnit(h.unit ?? "株");
                setHoldingValue(String(h.value));
              }}
            >
              編集
            </button>

            <button
              type="button"
              onClick={() => {
                setHoldings((prev) => prev.filter((x) => x.id !== h.id));
              }}
            >
              削除
            </button>
          </div>
        </div>
      ))}

      <hr style={{ width: "100%", margin: "8px 0" }} />

      <input
        placeholder="銘柄名"
        value={holdingName}
        onChange={(e) => setHoldingName(e.target.value)}
      />
      <select
  value={holdingKind}
  onChange={(e) => setHoldingKind(e.target.value as HoldingKind)}
>
  <option value="国内株">国内株</option>
  <option value="米国ETF">米国ETF</option>
  <option value="投資信託">投資信託</option>
  <option value="現金">現金</option>
</select>

      <input
        placeholder="株数"
        value={holdingShares}
        onChange={(e) => setHoldingShares(e.target.value)}
        />
        <select
  value={holdingUnit}
  onChange={(e) => setHoldingUnit(e.target.value as "株" | "口")}
>
  <option value="株">株</option>
  <option value="口">口</option>
</select>
      

      <input
        placeholder="評価額"
        value={holdingValue}
        onChange={(e) => setHoldingValue(e.target.value)}
      />

      <button
        type="button"
        onClick={() => {
          const name = holdingName.trim();
          const shares = Number(holdingShares);
          const value = parseAmountLike(holdingValue);

          if (!name) {
            alert("銘柄名を入力してください");
            return;
          }

          if (!Number.isFinite(shares) || shares < 0) {
            alert("株数を入力してください");
            return;
          }

          if (value < 0) {
            alert("評価額を入力してください");
            return;
          }

          setHoldings((prev) => {
            if (holdingEditId) {
              return prev.map((h) =>
                h.id === holdingEditId
                  ? { ...h, name, shares, unit: holdingUnit, value }
                  : h
              );
            }

            return [
              ...prev,
              {
  id: makeId(),
  ringKey:
  name,
  shares,
  unit: holdingUnit,
  value,
  kind: holdingKind,
},
            ];
          });

          setHoldingName("");
          setHoldingShares("");
          setHoldingValue("");
          setHoldingEditId(null);
        }}
      >
        {holdingEditId ? "保存" : "銘柄を追加"}
      </button>

      {holdingEditId && (
        <button
          type="button"
          onClick={() => {
            setHoldingEditId(null);
            setHoldingName("");
            setHoldingShares("");
            setHoldingValue("");
          }}
        >
          キャンセル
        </button>
      )}
    </div>
  );
}