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
