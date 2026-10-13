// Money helpers shared by every customer view, so a figure reads the same wherever it appears.

// Formatting and typing of amounts are the app's, not only the customers': Sales uses the same ones.
export { fmtMoney, roundCents, normalizeMoneyInput, moneyInputParser } from "@/lib/money";

// Shipment selling/buying arrive as numeric strings (or empty); anything unparsable counts as 0.
export function num(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isNaN(n) ? 0 : n;
}

export function marginPct(revenue: number, profit: number): number {
  if (!revenue) return 0;
  return Math.round((profit / revenue) * 100);
}
