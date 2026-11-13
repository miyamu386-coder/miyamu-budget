import type { Transaction } from "../types";

export type CashFlowCategory =
    | "income1"
    | "income2"
    | "temporaryIncome"
    | "living"
    | "housing"
    | "vehicle"
    | "education"
    | "insurance"
    | "other"
    | "temporaryExpense";

export type CashFlowTotals = Record<
    number,
    Partial<Record<CashFlowCategory, number>>
>;

// =========================
// キャッシュフロー対象外の取引
// =========================
function isTransfer(
    transaction: Transaction
): boolean {
    const detail = (
        transaction.detailCategory ?? ""
    ).trim();

    return (
        transaction.category === "ring:save" ||
        detail === "口座振替"
    );
}

// =========================
// 取引の分類
// =========================
function classifyTransaction(
    transaction: Transaction
): CashFlowCategory {
    const detail = (
        transaction.detailCategory ?? ""
    ).trim();

    if (transaction.type === "income") {
        return "income1";
    }

    if (
        detail.includes("家賃") ||
        detail.includes("駐車場") ||
        detail.includes("住宅ローン") ||
        detail.includes("管理費")
    ) {
        return "housing";
    }

    if (
        detail.includes("食費") ||
        detail.includes("日用品") ||
        detail.includes("生活費") ||
        detail.includes("コンビニ") ||
        detail.includes("自販機")
    ) {
        return "living";
    }

    if (
        detail.includes("ガソリン") ||
        detail.includes("車検") ||
        detail.includes("自動車税") ||
        detail.includes("メンテナンス") ||
        detail.includes("洗車")
    ) {
        return "vehicle";
    }

    if (
        detail.includes("学費") ||
        detail.includes("教材") ||
        detail.includes("教育")
    ) {
        return "education";
    }

    if (
        detail.includes("保険") ||
        detail.includes("共済")
    ) {
        return "insurance";
    }

    return "other";
}

// =========================
// 年間実績の集計
// =========================
export function aggregateCashFlow(
    transactions: Transaction[]
): CashFlowTotals {
    const totals: CashFlowTotals = {};

    for (const transaction of transactions) {
        // 貯蓄・口座振替は集計対象外
        if (isTransfer(transaction)) {
            continue;
        }

        const year = Number(
            transaction.occurredAt.slice(0, 4)
        );

        if (
            !Number.isInteger(year) ||
            year < 2026
        ) {
            continue;
        }

        const category =
            classifyTransaction(transaction);

        if (!totals[year]) {
            totals[year] = {};
        }

        totals[year][category] =
            (totals[year][category] ?? 0) +
            transaction.amount;
    }

    return totals;
}