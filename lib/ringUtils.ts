export type CharaMode = "auto" | "mofu" | "hina" | "none";

export type RingMode = "both" | "income_only" | "expense_only";

export function makeId() {
  return `ring_${Math.random().toString(36).slice(2, 9)}_${Date.now()}`;
}

export function ringCategory(ringKey: string) {
  return `ring:${ringKey}`;
}

export function pickCharaAuto(
  title: string
): Exclude<CharaMode, "auto"> {
  const t = (title ?? "").toLowerCase();

  const mofuWords = [
    "銀行",
    "口座",
    "振込",
    "引落",
    "引き落とし",
    "返済",
    "ローン",
    "クレカ",
    "カード",
    "支出",
    "固定費",
    "家賃",
    "保険",
    "税",
    "年金",
  ];

  const hinaWords = [
    "投資",
    "nisa",
    "ニーサ",
    "株",
    "積立",
    "つみたて",
    "資産",
    "運用",
    "配当",
  ];

  if (mofuWords.some((w) => t.includes(w))) return "mofu";
  if (hinaWords.some((w) => t.includes(w))) return "hina";

  return "none";
}

export function resolveChara(
  title: string,
  mode?: CharaMode
): Exclude<CharaMode, "auto"> {
  if (mode === "mofu" || mode === "hina" || mode === "none") {
    return mode;
  }

  return pickCharaAuto(title);
}

export function guessCarryOver(
  title: string,
  mode: RingMode
) {
  const t = title ?? "";

  const repayWords = [
    "返済",
    "ローン",
    "借入",
    "カード",
    "クレカ",
    "リボ",
    "分割",
  ];

  if (repayWords.some((w) => t.includes(w))) return true;
  if (mode === "income_only") return true;
  if (mode === "expense_only") return true;

  return false;
}

export function isRepayRingLike(r: {
  title: string;
  mode: RingMode;
  carryOver?: boolean;
}) {
  const t = (r.title ?? "").toLowerCase();

  const words = [
    "返済",
    "ローン",
    "借入",
    "カードローン",
    "クレカ",
    "リボ",
    "分割",
  ];

  return words.some((w) => t.includes(w));
}
export type ExtraRing = {
  id: string;
  ringKey: string;
  title: string;
  mode: RingMode;
  color: string;
  charMode?: CharaMode;
  ringType?: "asset" | "debt";
  carryOver?: boolean;
};