/**
 * ✅ 「5万」「1.2万」「3千」「50,000」等を数値にする
 */
export function parseAmountLike(input: string): number {
  if (!input) return 0;

  // 全角数字→半角
  const half = input.replace(/[０-９．]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (ch === "．") return ".";
    return String(code - 0xfee0);
  });

  // よくある単位・余計な文字を軽く掃除
  const s = half.trim().replace(/[,，\s]/g, "").replace(/円/g, "");

  // 「万」「千」対応（例: 1.2万, 5万, 3千）
  const manMatch = s.match(/^(-?\d+(?:\.\d+)?)万$/);
  if (manMatch) return Math.round(Number(manMatch[1]) * 10000);

  const senMatch = s.match(/^(-?\d+(?:\.\d+)?)千$/);
  if (senMatch) return Math.round(Number(senMatch[1]) * 1000);

  const n = Number(s);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}