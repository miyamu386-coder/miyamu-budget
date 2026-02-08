export type TxType = "income" | "expense";

export type Transaction = {
  id: number;
  amount: number;
  category: string;
  type: TxType;
  createdAt: string;   // ISO文字列
  occurredAt: string;  // ISO文字列（発生日）
};