/** A number from API/user text ("12.5") or a number; anything unparsable counts as 0. */
export function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}

/**
 * A number for reading: thousands separated by a space, a decimal point, `decimals` places
 * (readable for CZ and EN users). `empty` is what a missing value shows ("" or "—").
 */
export function formatNumber(value: number | null | undefined, decimals = 0, empty = ""): string {
  if (value == null) return empty;
  return value.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).replace(/,/g, " ");
}

/** "1 250" / "12.5" / "0.25": whole numbers without decimals, others with up to 2. */
export function formatQty(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  if (Number.isInteger(rounded)) return formatNumber(rounded, 0);
  return formatNumber(rounded, Number.isInteger(rounded * 10) ? 1 : 2);
}

/** "12.5 %"; with `signed`, "+3 %" / "−5 %". "—" for none. */
export function formatPercent(p: number | null | undefined, signed = false): string {
  if (p == null || !Number.isFinite(p)) return "—";
  const rounded = Math.round(p * 10) / 10 || 0;
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${formatQty(Math.abs(rounded))} %`;
}
