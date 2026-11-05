// The margin guardrails of Sales (Council Outlay 6, decided 3 Nov 2026): a floor per freight mode,
// a minimum % and a minimum CZK, judged on the whole quote (D1, D2). Road keeps Trucking's floor
// (D3). For the modes priced by the box the CZK minimum is per container. Pure.

export interface GuardrailFloor {
  percent: number;
  /** For this quote: per container already multiplied by its containers. */
  minAmountCzk: number;
}

/** A mode's floor as set: the CZK minimum per quote, or per container. */
export interface GuardrailSetting {
  percent: number;
  minAmountCzk: number;
  perContainer: boolean;
}

/** The freight modes with a guardrail, as quotes store them. */
export const GUARDRAIL_MODES = ["Road", "Sea FCL", "Sea LCL", "Sea Break Bulk", "Air", "Rail"] as const;
export type GuardrailMode = (typeof GUARDRAIL_MODES)[number];
/** The modes Sales sets (Road is Trucking's). */
export const SALES_GUARDRAIL_MODES: readonly GuardrailMode[] = ["Sea FCL", "Sea LCL", "Sea Break Bulk", "Air", "Rail"];
/** Modes whose CZK minimum is per container. */
export const PER_CONTAINER_MODES: readonly GuardrailMode[] = ["Sea FCL", "Rail"];

/** The starting floors (D2), until a manager changes them. */
export const DEFAULT_GUARDRAILS: Record<Exclude<GuardrailMode, "Road">, { percent: number; minAmountCzk: number }> = {
  "Sea FCL": { percent: 7, minAmountCzk: 1500 },
  Rail: { percent: 7, minAmountCzk: 1500 },
  "Sea LCL": { percent: 15, minAmountCzk: 1000 },
  Air: { percent: 10, minAmountCzk: 1000 },
  "Sea Break Bulk": { percent: 10, minAmountCzk: 10000 },
};

export type GuardrailSettings = Record<GuardrailMode, GuardrailSetting>;

/** Trucking's own starting floor (trucking lib/settingsRules DEFAULT_MARGIN_FLOOR): Road's stand-in while Trucking's cannot be read. */
export const ROAD_FALLBACK_FLOOR = { percent: 8, minAmountCzk: 300 };

/** The company's settings: its stored floors over the defaults, and Trucking's floor for Road. */
export function guardrailSettings(stored: { serviceType: string; percent: number; minAmountCzk: number }[], road: { percent: number; minAmountCzk: number }): GuardrailSettings {
  const out = { Road: { ...road, perContainer: false } } as GuardrailSettings;
  for (const mode of SALES_GUARDRAIL_MODES) {
    const row = stored.find((r) => r.serviceType === mode);
    const base = DEFAULT_GUARDRAILS[mode as Exclude<GuardrailMode, "Road">];
    out[mode] = { percent: row?.percent ?? base.percent, minAmountCzk: row?.minAmountCzk ?? base.minAmountCzk, perContainer: PER_CONTAINER_MODES.includes(mode) };
  }
  return out;
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/** The quote's containers: the sum of its container lines (at least 1 for a per-container floor). */
export function containersOf(data: unknown): number {
  const lines = isObject(data) && Array.isArray(data.containers) ? data.containers : [];
  return lines.reduce((sum: number, l: unknown) => sum + (isObject(l) && typeof l.qty === "number" && l.qty > 0 ? l.qty : 0), 0);
}

/** Whether `mode` has a guardrail. */
export const isGuardrailMode = (mode: unknown): mode is GuardrailMode => typeof mode === "string" && (GUARDRAIL_MODES as readonly string[]).includes(mode);

/** The floor a quote of this freight mode is judged against, per-container minimums multiplied out. */
export function floorFor(mode: GuardrailMode, data: unknown, settings: GuardrailSettings): GuardrailFloor {
  const s = settings[mode];
  return { percent: s.percent, minAmountCzk: s.perContainer ? s.minAmountCzk * Math.max(1, containersOf(data)) : s.minAmountCzk };
}

/** Why a manager's floors are refused; null when they may be stored. */
export function settingsProblem(rows: { serviceType: string; percent: number; minAmountCzk: number }[]): string | null {
  for (const r of rows) {
    if (!(SALES_GUARDRAIL_MODES as readonly string[]).includes(r.serviceType)) return `${r.serviceType} has no guardrail set in Sales (Road's is Trucking's)`;
    if (!Number.isFinite(r.percent) || r.percent < 0 || r.percent > 100) return `${r.serviceType}: the percent must be between 0 and 100`;
    if (!Number.isFinite(r.minAmountCzk) || r.minAmountCzk < 0) return `${r.serviceType}: the minimum in CZK cannot be negative`;
  }
  if (new Set(rows.map((r) => r.serviceType)).size !== rows.length) return "Each freight mode once";
  return null;
}
