// Reports period: a preset (Today, 7 days, 30 days) or a custom range, as Prague days
// (YYYY-MM-DD, both days included). Pure helpers, shared by the Reports tab and its tests.

export const KPI_PRESETS = ["today", "7d", "30d", "custom"] as const;
export type KpiPreset = (typeof KPI_PRESETS)[number];
export const KPI_PRESET_LABEL: Record<KpiPreset, string> = { today: "Today", "7d": "7 days", "30d": "30 days", custom: "Custom" };
/** The API refuses longer periods. */
export const KPI_MAX_DAYS = 366;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;
const PRAGUE = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Prague" });

/** Today in the warehouse's time (Europe/Prague). */
export const pragueToday = (now = new Date()) => PRAGUE.format(now);

export const isDay = (s: string | null | undefined): s is string => !!s && DATE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

export const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);

export const daysIn = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY) + 1;

export interface KpiRange {
  from: string;
  to: string;
}

/**
 * The days a preset stands for. A custom range is used only when both days are dates, in order
 * and not longer than the API allows; otherwise it falls back to the last 7 days.
 */
export function periodRange(preset: KpiPreset, custom: Partial<KpiRange> = {}, now = new Date()): KpiRange {
  const today = pragueToday(now);
  if (preset === "today") return { from: today, to: today };
  if (preset === "30d") return { from: addDays(today, -29), to: today };
  if (preset === "custom" && isDay(custom.from) && isDay(custom.to) && custom.from <= custom.to && daysIn(custom.from, custom.to) <= KPI_MAX_DAYS) {
    return { from: custom.from, to: custom.to };
  }
  return { from: addDays(today, -6), to: today };
}

/** "9.10.2026 – 15.10.2026 (7 days)" */
export function periodText(r: KpiRange): string {
  const d = (s: string) => `${Number(s.slice(8))}.${Number(s.slice(5, 7))}.${s.slice(0, 4)}`;
  const n = daysIn(r.from, r.to);
  return r.from === r.to ? `${d(r.from)} (1 day)` : `${d(r.from)} – ${d(r.to)} (${n} days)`;
}

/** A KPI value with its unit, "" when not measured. */
export function kpiValueText(value: number | null, unit: string): string {
  if (value == null) return "";
  const n = Number.isInteger(value) ? String(value) : value.toFixed(1);
  const num = n.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  if (unit === "%") return `${num} %`;
  return unit ? `${num} ${unit}` : num;
}
