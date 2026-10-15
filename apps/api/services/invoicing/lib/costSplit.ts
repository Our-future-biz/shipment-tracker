// Splits one amount into parts by weight (a master job's invoice by each shipment's freight
// tons, a line-haul cost by each consignment's share), so the parts add up to the amount to the
// cent. Each part is rounded down to whole cents and the cents left over go, one each, to the
// parts that lost the most in rounding (the largest-remainder method); a tie goes to the part
// listed first. Pure, so the split has its test.

/**
 * `totalCents` split by `weights`, in whole cents, in the order of the weights. A weight of 0
 * gets 0. Weights must be finite, not negative, and not all 0.
 */
export function splitCents(totalCents: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalCents)) throw new Error("the total must be a whole number of cents");
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) throw new Error("a weight must be a number of at least 0");
  const sum = weights.reduce((a, w) => a + w, 0);
  if (sum <= 0) throw new Error("at least one weight must be above 0");

  // A negative total (a credit) is split as its positive and turned back.
  const sign = totalCents < 0 ? -1 : 1;
  const total = Math.abs(totalCents);
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let left = total - parts.reduce((a, p) => a + p, 0);

  const byRemainder = exact
    .map((x, i) => ({ i, remainder: x - Math.floor(x) }))
    .filter(({ i }) => weights[i]! > 0)
    .sort((a, b) => b.remainder - a.remainder || a.i - b.i);
  // `left` is below the number of parts; the loop only guards against float drift.
  for (let k = 0; left > 0; k = (k + 1) % byRemainder.length, left -= 1) parts[byRemainder[k]!.i]! += 1;

  return parts.map((p) => p * sign);
}

/** `total` ("100.00") split by `weights` into decimal strings ("33.34", "33.33", "33.33"). */
export function splitAmount(total: string, weights: number[]): string[] {
  const cents = Math.round(Number(total) * 100);
  if (!Number.isFinite(cents)) throw new Error("the total must be a number");
  return splitCents(cents, weights).map((c) => (c / 100).toFixed(2));
}
