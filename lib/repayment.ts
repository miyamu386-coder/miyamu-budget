function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function addMonthsDate(base: Date, monthsToAdd: number) {
  const d = new Date(base);
  const day = d.getDate();
  d.setMonth(d.getMonth() + monthsToAdd);
  if (d.getDate() < day) d.setDate(0);
  return d;
}
export function calcRepayment(params: {
  totalDebt: number;
  repaidTotal: number;
  monthlyPayment: number;
  asOf?: Date;
}) {
  const asOf = params.asOf ?? new Date();
  const totalDebt = Math.max(0, params.totalDebt);
  const repaidTotal = Math.max(0, params.repaidTotal);
  const monthlyPayment = Math.max(0, params.monthlyPayment);

  const remaining = Math.max(0, totalDebt - repaidTotal);
  const progressPct =
    totalDebt > 0 ? clamp((repaidTotal / totalDebt) * 100, 0, 100) : 0;

  if (totalDebt <= 0) {
    return {
      progressPct,
      remaining,
      months: null as number | null,
      payoffDate: null as Date | null,
      message: "目標（借入総額）が未設定です",
    };
  }

  if (remaining === 0) {
    return {
      progressPct: 100,
      remaining: 0,
      months: 0,
      payoffDate: asOf,
      message: "完済済み",
    };
  }

  if (monthlyPayment <= 0) {
    return {
      progressPct,
      remaining,
      months: null,
      payoffDate: null,
      message: "今月の返済額が0のため予測できません",
    };
  }

  const months = Math.ceil(remaining / monthlyPayment);
  const payoffDate = addMonthsDate(asOf, months);

  return { progressPct, remaining, months, payoffDate, message: "OK" };
}