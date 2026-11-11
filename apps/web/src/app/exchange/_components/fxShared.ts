import { api } from "@/lib/api";
import { TD, TH } from "@/styles/ui";

// The tables of the four tabs, built alike: a framed table with a light grey header, roomy cells,
// figures in columns of one width (right-aligned under their heading) and the text column after
// them set apart, so the figures and the words do not run together.
export const FX_TABLE_WRAP = "overflow-x-auto border border-slate-200 rounded-xl";
export const FX_TH = `${TH} !px-4 !py-2.5 bg-slate-50`;
export const FX_TD = `${TD} !px-4 !py-2.5`;
/** A column of figures: one width, right-aligned. */
export const FX_NUM = "w-[130px] !text-right tabular-nums whitespace-nowrap";
/** The first text column after the figures: set apart from them. */
export const FX_AFTER_NUM = "!pl-10";
/** The row's key (date, period, start): one width, never wrapped. */
export const FX_KEY = "w-[190px] whitespace-nowrap";

// Shapes returned by the fx service, taken from the generated client.
export type FxOverview = Awaited<ReturnType<typeof api.fx.fxOverview>>;
export type DailyResponse = Awaited<ReturnType<typeof api.fx.fxDaily>>;
export type AveragesResponse = Awaited<ReturnType<typeof api.fx.fxAverages>>;
export type RoeChange = Awaited<ReturnType<typeof api.fx.fxRoeList>>["changes"][number];

// ČNB publishes 3 decimals; rates are CZK per 1 unit.
export function fmtRate(value: number | null | undefined, places = 3): string {
  return value == null ? "—" : value.toFixed(places);
}

/**
 * A per-1-unit rate as ČNB quotes it: per 100 / 1000 units for small currencies
 * ("0.137 / 100"), else per 1.
 */
export function fmtQuoted(perUnit: number | null | undefined, amount = 1): string {
  if (perUnit == null) return "—";
  return amount > 1 ? `${fmtRate(perUnit * amount)} / ${amount}` : fmtRate(perUnit);
}

/** "British Pound" for GBP, in the browser's English names; "" when it has none. */
export function currencyName(code: string): string {
  try {
    const name = new Intl.DisplayNames(["en"], { type: "currency" }).of(code);
    return name && name !== code ? name : "";
  } catch {
    return "";
  }
}

/**
 * A period average as ČNB quotes it: per 1 unit, or per 100 / 1000 for small currencies
 * ("1.190 / 1000" for IDR) — the per-1-unit value would round to nothing at 3 decimals.
 */
export function fmtAverage(a: { quoted: number; amount: number } | undefined): string {
  if (!a) return "—";
  return a.amount > 1 ? `${fmtRate(a.quoted)} / ${a.amount}` : fmtRate(a.quoted);
}

export function fmtPct(value: number): string {
  return `${value.toFixed(3).replace(/\.?0+$/, "")} %`;
}
