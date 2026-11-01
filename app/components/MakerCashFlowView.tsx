"use client";
import type { Transaction } from "../types";
import { aggregateCashFlow } from "./cashFlowUtils";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const START_YEAR = 2026;
const YEARS = 40;

const yearList = Array.from(
  { length: YEARS },
  (_, i) => START_YEAR + i
);

type CashFlowRow = {
  id: string;
  label: string;
  type: "income" | "expense";
};

const incomeRows: CashFlowRow[] = [
  {
    id: "income1",
    label: "収入①",
    type: "income",
  },
  {
    id: "income2",
    label: "収入②",
    type: "income",
  },
  {
    id: "temporaryIncome",
    label: "一時的な収入",
    type: "income",
  },
];

const expenseRows: CashFlowRow[] = [
  {
    id: "living",
    label: "基本生活費",
    type: "expense",
  },
  {
    id: "housing",
    label: "住居関連費",
    type: "expense",
  },
  {
    id: "vehicle",
    label: "車両費",
    type: "expense",
  },
  {
    id: "education",
    label: "教育費",
    type: "expense",
  },
  {
    id: "insurance",
    label: "保険料",
    type: "expense",
  },
  {
    id: "other",
    label: "その他の支出",
    type: "expense",
  },
  {
    id: "temporaryExpense",
    label: "一時的な支出",
    type: "expense",
  },
];

type FamilyMember = {
  name: string;
  age: string;
};

type CashFlowData = {
  family: FamilyMember[];
  events: Record<string, string>;
  values: Record<string, Record<string, number>>;
  initialBalance: number;
};

const STORAGE_KEY =
  "miyamu-maker-cashflow-v1";

function createInitialData(): CashFlowData {
  return {
    family: Array.from(
      { length: 4 },
      () => ({
        name: "",
        age: "",
      })
    ),
    events: {},
    values: {},
    initialBalance: 0,
  };
}

function formatMoney(value: number) {
  return Math.round(value).toLocaleString(
    "ja-JP"
  );
}

const cellStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  padding: "8px 6px",
  minWidth: 110,
  textAlign: "center",
  background: "#fff",
};

const labelStyle: React.CSSProperties = {
  ...cellStyle,
  minWidth: 145,
  position: "sticky",
  left: 0,
  zIndex: 2,
  background: "#f8f1f8",
  fontWeight: 700,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 0,
  padding: "6px 4px",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  textAlign: "right",
};

type Props = {
  transactions: Transaction[];
};

export default function MakerCashFlowView({
  transactions,
}: Props) {
  const [data, setData] =
    useState<CashFlowData>(
      createInitialData
    );

  const [loaded, setLoaded] =
    useState(false);

  // =========================
  // キャッシュフロー拡大・縮小
  // =========================
  const [scale, setScale] = useState(1);

  const tableContainerRef =
    useRef<HTMLDivElement>(null);

  const pinchRef = useRef<{
    distance: number;
    scale: number;
  } | null>(null);

  const lastTapRef = useRef(0);

  const MIN_SCALE = 0.5;
  const MAX_SCALE = 2;

  const clampScale = (value: number) =>
    Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, value)
    );

  // メーカーの取引実績を年別に集計
  const actualTotals = useMemo(
    () => aggregateCashFlow(transactions),
    [transactions]
  );

  // =========================
  // 保存データ読込
  // =========================
  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(
          STORAGE_KEY
        );

      if (saved) {
        const parsed = JSON.parse(
          saved
        ) as Partial<CashFlowData>;

        setData({
          ...createInitialData(),
          ...parsed,
          family: Array.isArray(parsed.family)
            ? parsed.family.slice(0, 4)
            : createInitialData().family,
          events: parsed.events ?? {},
          values: parsed.values ?? {},
        });
      }
    } catch (error) {
      console.error(
        "キャッシュフロー読込失敗",
        error
      );
    }

    setLoaded(true);
  }, []);

  // =========================
  // 自動保存
  // =========================
  useEffect(() => {
    if (!loaded) return;

    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(data)
      );
    } catch (error) {
      console.error(
        "キャッシュフロー保存失敗",
        error
      );
    }
  }, [data, loaded]);

  // =========================
  // 金額取得
  // =========================
  const getValue = (
    rowId: string,
    year: number
  ) => {
    return (
      data.values[rowId]?.[
      String(year)
      ] ?? 0
    );
  };

  // =========================
  // 金額更新
  // =========================
  const updateValue = (
    rowId: string,
    year: number,
    value: string
  ) => {
    const amount =
      value.trim() === ""
        ? 0
        : Number(value);

    if (
      !Number.isFinite(amount) ||
      amount < 0
    ) {
      return;
    }

    setData((prev) => ({
      ...prev,
      values: {
        ...prev.values,
        [rowId]: {
          ...prev.values[rowId],
          [String(year)]: amount,
        },
      },
    }));
  };

  // =========================
  // 家族情報更新
  // =========================
  const updateFamily = (
    index: number,
    field: keyof FamilyMember,
    value: string
  ) => {
    setData((prev) => ({
      ...prev,
      family: prev.family.map(
        (member, i) =>
          i === index
            ? {
              ...member,
              [field]: value,
            }
            : member
      ),
    }));
  };

  // =========================
  // 年間集計
  // =========================
  const calculations = useMemo(() => {
    let balance =
      data.initialBalance;

    return yearList.map((year) => {
      const income = incomeRows.reduce(
        (sum, row) =>
          sum +
          (data.values[row.id]?.[
            String(year)
          ] ?? 0),
        0
      );

      const expense = expenseRows.reduce(
        (sum, row) =>
          sum +
          (data.values[row.id]?.[
            String(year)
          ] ?? 0),
        0
      );

      const annualBalance =
        income - expense;

      balance += annualBalance;

      return {
        year,
        income,
        expense,
        annualBalance,
        balance,
      };
    });
  }, [data]);

  const renderMoneyRow = (
    row: CashFlowRow
  ) => (
    <tr key={row.id}>
      <th style={labelStyle}>
        {row.label}
      </th>

      {yearList.map((year) => (
        <td
          key={year}
          style={cellStyle}
        >
          <input
            type="number"
            min="0"
            value={
              data.values[row.id]?.[
              String(year)
              ] ?? ""
            }
            onChange={(event) =>
              updateValue(
                row.id,
                year,
                event.target.value
              )
            }
            style={inputStyle}
          />
        </td>
      ))}
    </tr>
  );

  const renderTotalRow = (
    label: string,
    key:
      | "income"
      | "expense"
      | "annualBalance"
      | "balance",
    background: string
  ) => (
    <tr>
      <th
        style={{
          ...labelStyle,
          background,
        }}
      >
        {label}
      </th>

      {calculations.map((item) => (
        <td
          key={item.year}
          style={{
            ...cellStyle,
            background,
            fontWeight: 800,
            color:
              item[key] < 0
                ? "#c62828"
                : "#222",
          }}
        >
          {formatMoney(item[key])}
        </td>
      ))}
    </tr>
  );
  // =========================
  // ピンチ操作
  // =========================
  const getTouchDistance = (
    touches: React.TouchList
  ) => {
    const dx =
      touches[0].clientX -
      touches[1].clientX;

    const dy =
      touches[0].clientY -
      touches[1].clientY;

    return Math.hypot(dx, dy);
  };

  const handleTouchStart = (
    event: React.TouchEvent<HTMLDivElement>
  ) => {
    if (event.touches.length === 2) {
      pinchRef.current = {
        distance: getTouchDistance(event.touches),
        scale,
      };
      return;
    }

    if (event.touches.length === 1) {
      const target = event.target as HTMLElement;

      if (
        target.closest(
          "input, textarea, button, select"
        )
      ) {
        return;
      }

      const now = Date.now();

      if (now - lastTapRef.current < 300) {
        setScale(1);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = now;
      }
    }
  };

  const handleTouchMove = (
    event: React.TouchEvent<HTMLDivElement>
  ) => {
    if (
      event.touches.length !== 2 ||
      !pinchRef.current
    ) {
      return;
    }

    const distance =
      getTouchDistance(event.touches);

    const nextScale =
      pinchRef.current.scale *
      (distance / pinchRef.current.distance);

    setScale(clampScale(nextScale));
  };

  const handleTouchEnd = (
    event: React.TouchEvent<HTMLDivElement>
  ) => {
    if (event.touches.length < 2) {
      pinchRef.current = null;
    }
  };

  if (!loaded) {
    return (
      <div style={{ padding: 24 }}>
        読み込み中...
      </div>
    );
  }

  return (
    <div
      style={{
        width: "100%",
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          marginBottom: 20,
          padding: 16,
          borderRadius: 14,
          background: "#f8f1f8",
        }}
      >
        <h3
          style={{
            margin: "0 0 12px",
          }}
        >
          キャッシュフロー設定
        </h3>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <span>開始時の貯蓄残高</span>

          <input
            type="number"
            value={
              data.initialBalance
            }
            onChange={(event) => {
              const value = Number(
                event.target.value
              );

              if (
                !Number.isFinite(value)
              ) {
                return;
              }

              setData((prev) => ({
                ...prev,
                initialBalance: value,
              }));
            }}
            style={{
              ...inputStyle,
              width: 180,
            }}
          />

          <span>円</span>
        </label>
      </div>

      <div
        ref={tableContainerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        style={{
          overflow: "auto",
          borderRadius: 12,
          border: "1px solid #ddd",
          touchAction: "pan-x pan-y",
        }}
      >
        <table
          style={{
            borderCollapse:
              "separate",
            borderSpacing: 0,
            width: "max-content",
            fontSize: 13,
            zoom: scale,
          }}
        >
          <thead>
            <tr>
              <th style={labelStyle}>
                年
              </th>

              {yearList.map((year) => (
                <th
                  key={year}
                  style={{
                    ...cellStyle,
                    background:
                      "#f8f1f8",
                  }}
                >
                  {year}
                </th>
              ))}
            </tr>

            <tr>
              <th style={labelStyle}>
                経過年数
              </th>

              {yearList.map(
                (_, index) => (
                  <td
                    key={index}
                    style={cellStyle}
                  >
                    {index === 0
                      ? "現在"
                      : `${index}年後`}
                  </td>
                )
              )}
            </tr>
          </thead>

          <tbody>
            {data.family.map(
              (member, index) => (
                <tr key={index}>
                  <th style={labelStyle}>
                    <input
                      placeholder={`家族${index + 1
                        }`}
                      value={
                        member.name
                      }
                      onChange={(
                        event
                      ) =>
                        updateFamily(
                          index,
                          "name",
                          event.target.value
                        )
                      }
                      style={{
                        ...inputStyle,
                        textAlign:
                          "left",
                      }}
                    />
                  </th>

                  {yearList.map(
                    (year, yearIndex) => {
                      const age =
                        member.age === ""
                          ? ""
                          : Number(
                            member.age
                          ) + yearIndex;

                      return (
                        <td
                          key={year}
                          style={cellStyle}
                        >
                          {yearIndex ===
                            0 ? (
                            <input
                              type="number"
                              min="0"
                              value={
                                member.age
                              }
                              onChange={(
                                event
                              ) =>
                                updateFamily(
                                  index,
                                  "age",
                                  event
                                    .target
                                    .value
                                )
                              }
                              style={
                                inputStyle
                              }
                            />
                          ) : (
                            age
                          )}
                        </td>
                      );
                    }
                  )}
                </tr>
              )
            )}

            <tr>
              <th style={labelStyle}>
                ライフイベント
              </th>

              {yearList.map((year) => (
                <td
                  key={year}
                  style={cellStyle}
                >
                  <textarea
                    value={
                      data.events[
                      String(year)
                      ] ?? ""
                    }
                    onChange={(
                      event
                    ) =>
                      setData(
                        (prev) => ({
                          ...prev,
                          events: {
                            ...prev.events,
                            [String(
                              year
                            )]:
                              event
                                .target
                                .value,
                          },
                        })
                      )
                    }
                    rows={3}
                    style={{
                      width: "100%",
                      minWidth: 0,
                      boxSizing:
                        "border-box",
                      resize:
                        "vertical",
                      fontSize: 12,
                      border:
                        "1px solid #ddd",
                      borderRadius: 6,
                    }}
                  />
                </td>
              ))}
            </tr>

            {incomeRows.map(
              renderMoneyRow
            )}

            {renderTotalRow(
              "収入合計（A）",
              "income",
              "#f8e6f4"
            )}

            {expenseRows.map(
              renderMoneyRow
            )}

            {renderTotalRow(
              "支出合計（B）",
              "expense",
              "#f0f0f0"
            )}

            {renderTotalRow(
              "年間収支（A-B）",
              "annualBalance",
              "#fff4df"
            )}

            {renderTotalRow(
              "貯蓄残高",
              "balance",
              "#f8e6f4"
            )}
          </tbody>
        </table>
      </div>

      <p
        style={{
          marginTop: 12,
          fontSize: 12,
          color: "#777",
          lineHeight: 1.7,
        }}
      >
        ※金額は円単位で入力してください。
        <br />
        ※入力内容は、この端末の
        ブラウザに自動保存されます。
        <br />
        ※物価上昇率・運用利回りは
        現段階では考慮していません。
      </p>
    </div>
  );
}