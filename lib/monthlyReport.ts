import type { Transaction } from "../app/types";
import { fmtYM } from "./dateUtils";
import { yen } from "./format";
import {
  Directory,
  Encoding,
  Filesystem,
} from "@capacitor/filesystem";
import { Share } from "@capacitor/share";

type MonthSummary = {
  income: number;
  expense: number;
  balance: number;
};

type OpenMonthlyPrintViewParams = {
  selectedYm: string;
  monthTransactions: Transaction[];
  monthSummary: MonthSummary;
  resolveCategoryLabel: (category: string) => string;
};

function escapeHtml(value: string): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildTransactionRows(
  transactions: Transaction[],
  resolveCategoryLabel: (category: string) => string
): string {
  return transactions
    .slice()
    .sort((a, b) =>
      String(a.occurredAt).localeCompare(
        String(b.occurredAt)
      )
    )
    .map((transaction) => {
      const ymd = (
        transaction.occurredAt ?? ""
      ).slice(0, 10);

      const type =
        transaction.type === "income" ? "収入" : "支出";

      const amount = yen(transaction.amount);

      const category = escapeHtml(
        resolveCategoryLabel(
          transaction.category ?? ""
        )
      );

      const detail = escapeHtml(
        transaction.detailCategory ?? ""
      );

      return `
        <tr>
          <td>${escapeHtml(ymd)}</td>
          <td>${type}</td>
          <td class="right">${escapeHtml(amount)}</td>
          <td>${category}</td>
          <td>${detail}</td>
        </tr>
      `;
    })
    .join("");
}

function buildExpenseBreakdownRows(
  transactions: Transaction[]
): string {
  const breakdown = new Map<string, number>();

  for (const transaction of transactions) {
    if (transaction.type !== "expense") {
      continue;
    }

    const detail =
      (transaction.detailCategory ?? "").trim() ||
      "（未分類）";

    breakdown.set(
      detail,
      (breakdown.get(detail) ?? 0) +
      transaction.amount
    );
  }

  return Array.from(breakdown.entries())
    .sort((a, b) => b[1] - a[1])
    .map(
      ([detail, amount]) => `
        <tr>
          <td>${escapeHtml(detail)}</td>
          <td class="right">
            ${escapeHtml(yen(amount))}
          </td>
        </tr>
      `
    )
    .join("");
}

function buildMonthlyReportHtml(params: {
  title: string;
  transactionRows: string;
  breakdownRows: string;
  monthSummary: MonthSummary;
}): string {
  const {
    title,
    transactionRows,
    breakdownRows,
    monthSummary,
  } = params;

  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />
  <title>${escapeHtml(title)}</title>

  <style>
    body {
      font-family:
        -apple-system,
        BlinkMacSystemFont,
        "Segoe UI",
        Roboto,
        "Noto Sans JP",
        sans-serif;
      padding: 18px;
    }

    h1 {
      font-size: 18px;
      margin: 0 0 10px;
    }

    .meta {
      color: #555;
      font-size: 12px;
      margin-bottom: 14px;
    }

    .box {
      border: 1px solid #ddd;
      border-radius: 10px;
      padding: 12px;
      margin-bottom: 14px;
    }

    .box-title {
      font-weight: 900;
      margin-bottom: 8px;
    }

    .actions {
      display: flex;
      gap: 10px;
      margin-bottom: 12px;
    }

    .button {
      padding: 10px 12px;
      border-radius: 10px;
      font-weight: 700;
      cursor: pointer;
    }

    .button-primary {
      border: 1px solid #111;
      background: #111;
      color: #fff;
    }

    .button-secondary {
      border: 1px solid #ccc;
      background: #fff;
      color: #111;
    }

    table {
      width: 100%;
      border-collapse: collapse;
    }

    th,
    td {
      border-bottom: 1px solid #eee;
      padding: 8px;
      font-size: 12px;
      vertical-align: top;
    }

    th {
      text-align: left;
      background: #fafafa;
    }

    .right {
      text-align: right;
    }

    @media print {
      body {
        padding: 0;
      }

      .no-print {
        display: none;
      }
    }
  </style>
</head>

<body>
  <div class="actions no-print">
    <button
      class="button button-primary"
      onclick="window.print()"
    >
      印刷 / PDF
    </button>

    <button
      class="button button-secondary"
      onclick="window.close()"
    >
      閉じる
    </button>
  </div>

  <h1>${escapeHtml(title)}</h1>

  <div class="meta">
    収入 ${escapeHtml(yen(monthSummary.income))}
    /
    支出 ${escapeHtml(yen(monthSummary.expense))}
    /
    収支 ${escapeHtml(yen(monthSummary.balance))}
  </div>

  <div class="box">
    <div class="box-title">
      支出内訳（detailCategory）
    </div>

    <table>
      <thead>
        <tr>
          <th>内訳</th>
          <th class="right">金額</th>
        </tr>
      </thead>

      <tbody>
        ${breakdownRows ||
    `
            <tr>
              <td colspan="2">
                （支出がありません）
              </td>
            </tr>
          `
    }
      </tbody>
    </table>
  </div>

  <div class="box">
    <div class="box-title">
      明細（収入・支出ログ）
    </div>

    <table>
      <thead>
        <tr>
          <th>日付</th>
          <th>種別</th>
          <th class="right">金額</th>
          <th>リング</th>
          <th>detailCategory</th>
        </tr>
      </thead>

      <tbody>
        ${transactionRows ||
    `
            <tr>
              <td colspan="5">
                （データがありません）
              </td>
            </tr>
          `
    }
      </tbody>
    </table>
  </div>
</body>
</html>`;
}

export async function openMonthlyPrintView({
  selectedYm,
  monthTransactions,
  monthSummary,
  resolveCategoryLabel,
}: OpenMonthlyPrintViewParams): Promise<void> {
  try {
    const title = `月次レポート（${fmtYM(
      selectedYm
    )}）`;

    const transactionRows =
      buildTransactionRows(
        monthTransactions,
        resolveCategoryLabel
      );

    const breakdownRows =
      buildExpenseBreakdownRows(
        monthTransactions
      );

    const html = buildMonthlyReportHtml({
      title,
      transactionRows,
      breakdownRows,
      monthSummary,
    });

    const fileName =
      `miyamu-report-${selectedYm}.html`;

    await Filesystem.writeFile({
      path: fileName,
      data: html,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
    });

    const fileInfo =
      await Filesystem.getUri({
        path: fileName,
        directory: Directory.Cache,
      });

    await Share.share({
      title,
      files: [fileInfo.uri],
      dialogTitle: "印刷 / PDF",
    });
  } catch (error) {
    console.error(
      "monthly report share failed:",
      error
    );

    window.alert(
      "月次レポートを開けませんでした。"
    );
  }
}