// The kg keypad of floor mode's re-weigh: what the typed value becomes after one key. Pure (tested
// in keypad.test.ts).

export const MAX_KG = 100_000;

/** The typed value after one key: digits, one decimal point (one decimal), backspace ("⌫"); never above MAX_KG. */
export function typeKg(value: string, key: string): string {
  if (key === "⌫") return value.slice(0, -1);
  if (key === ".") return value.includes(".") ? value : value ? `${value}.` : "0.";
  if (!/^\d$/.test(key)) return value;
  const [, decimals] = value.split(".");
  if (decimals !== undefined && decimals.length >= 1) return value;
  const next = value === "0" ? key : `${value}${key}`;
  return Number(next) > MAX_KG ? value : next;
}
