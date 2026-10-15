/** A number from API/user text ("12.5") or a number; anything unparsable counts as 0. */
export function toNumber(value: string | number | null | undefined): number {
  const n = typeof value === "number" ? value : parseFloat(value ?? "");
  return Number.isFinite(n) ? n : 0;
}
