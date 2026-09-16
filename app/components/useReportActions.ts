"use client";

import { openMonthlyPrintView } from "../../lib/monthlyReport";

type MonthSummary = Parameters<
  typeof openMonthlyPrintView
>[0]["monthSummary"];

type MonthTransaction = Parameters<
  typeof openMonthlyPrintView
>[0]["monthTransactions"][number];

type Params = {
  selectedYm: string;
  monthTransactions: MonthTransaction[];
  monthSummary: MonthSummary;
  resolveCategoryLabel: (category: string) => string;
};

export function useReportActions({
  selectedYm,
  monthTransactions,
  monthSummary,
  resolveCategoryLabel,
}: Params) {
  const openPrintView = () => {
    openMonthlyPrintView({
      selectedYm,
      monthTransactions,
      monthSummary,
      resolveCategoryLabel,
    });
  };

  return {
    openPrintView,
  };
}