import { api } from "@/lib/api";

// Shapes returned by the fx service, taken from the generated client.
export type FxOverview = Awaited<ReturnType<typeof api.fx.fxOverview>>;
export type DailyResponse = Awaited<ReturnType<typeof api.fx.fxDaily>>;
export type AveragesResponse = Awaited<ReturnType<typeof api.fx.fxAverages>>;
export type RoeChange = Awaited<ReturnType<typeof api.fx.fxRoeList>>["changes"][number];

export const FX_KEYS = {
  overview: ["fx", "overview"] as const,
  daily: (month: string, all: boolean) => ["fx", "daily", month, all] as const,
  averages: (year: number, all: boolean) => ["fx", "averages", year, all] as const,
  roe: ["fx", "roe"] as const,
  runs: ["fx", "runs"] as const,
};

// ČNB publishes 3 decimals; rates are CZK per 1 unit.
export function fmtRate(value: number | null | undefined, places = 3): string {
  return value == null ? "—" : value.toFixed(places);
}

export function fmtPct(value: number): string {
  return `${value.toFixed(3).replace(/\.?0+$/, "")} %`;
}

export const CELL = "px-4 py-2.5 border-b border-slate-100 align-middle text-[14px]";
export const TH =
  "text-[11.5px] font-bold tracking-[.05em] uppercase text-slate-500 px-4 py-2.5 " +
  "border-b border-slate-200 bg-[#fafafa] text-left whitespace-nowrap";
export const CARD = "bg-white border border-slate-200 rounded-2xl";
