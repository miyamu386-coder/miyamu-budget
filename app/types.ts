export type TxType = "income" | "expense";

export type Transaction = {
  id: number;
  amount: number;
  category: string;
  detailCategory?: string;
  type: TxType;
  createdAt: string;
  occurredAt: string;
};

export type HoldingKind =
  | "国内株"
  | "米国ETF"
  | "投資信託"
  | "現金";

export type Holding = {
  id: string;
  ringKey: string;
  name: string;
  shares: number;
  unit?: "株" | "口";
  value: number;
  kind?: HoldingKind;
  market?: HoldingMarket;
};

export type HoldingMarket = "JP" | "US" | "FUND";

export type HoldingDictionaryEntry = {
  keyword: string;
  kind: HoldingKind;
  unit: "株" | "口";
  market: HoldingMarket;
};