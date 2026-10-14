import { isWeekend, lastDayOfMonth, addDays } from "./dates";

// Pure rate maths, shared by the service and its tests. Rates are CZK per 1 unit.

export interface Fixing {
  validDate: string;
  currency: string;
  amount: number;
  rate: string | number;
}

export function perUnit(f: Pick<Fixing, "amount" | "rate">): number {
  return Number(f.rate) / (f.amount || 1);
}

export function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round((value + Number.EPSILON) * f) / f;
}

export interface ResolvedFixing {
  rate: number; // CZK per 1 unit
  fixingDate: string; // the ČNB fixing used
  carried: boolean; // the date had no fixing of its own (weekend, holiday, not yet published)
  provisional: boolean; // a later fixing may still replace it (today before 14:30, or a future date)
}

/**
 * The rate for a calendar date: the newest fixing on or before it, as ČNB itself rules
 * (a fixing covers its day and any following weekend or holiday). `rows` are one
 * currency's fixings, newest first or in any order. Returns null when none is that old.
 */
export function resolveFixing(rows: Fixing[], date: string, today: string): ResolvedFixing | null {
  let best: Fixing | null = null;
  for (const r of rows) {
    if (r.validDate <= date && (!best || r.validDate > best.validDate)) best = r;
  }
  if (!best) return null;
  const carried = best.validDate !== date;
  return {
    rate: perUnit(best),
    fixingDate: best.validDate,
    carried,
    provisional: carried && date >= today && !coveredByFixing(best.validDate, date),
  };
}

// True when every day after the fixing up to `date` is a weekend, so the fixing is final for it.
function coveredByFixing(fixingDate: string, date: string): boolean {
  for (let d = addDays(fixingDate, 1); d <= date; d = addDays(d, 1)) {
    if (!isWeekend(d)) return false;
  }
  return true;
}

// The ROE % is applied to an amount already converted at the raw ČNB rate, never folded
// into a stored rate: converted × pct / 100 is right in every direction, while dividing
// by an "adjusted rate" would give the customer a discount.
export function applyRoe(converted: number, pct: number): number {
  return converted * (pct / 100);
}

export interface Average {
  currency: string;
  average: number; // mean of the fixing-day rates, 3 decimals like ČNB
  fixingDays: number;
}

/**
 * Period average as ČNB computes its own published averages: the plain mean of the
 * fixings whose date falls in the period, rounded to 3 decimals. A quarter or year is
 * the mean of all its fixings, not the mean of the monthly averages.
 */
export function averageByCurrency(rows: Fixing[], from: string, to: string): Average[] {
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of rows) {
    if (r.validDate < from || r.validDate > to) continue;
    const s = sums.get(r.currency) ?? { total: 0, n: 0 };
    s.total += perUnit(r);
    s.n += 1;
    sums.set(r.currency, s);
  }
  return [...sums.entries()]
    .map(([currency, s]) => ({ currency, average: round(s.total / s.n, 3), fixingDays: s.n }))
    .sort((a, b) => a.currency.localeCompare(b.currency));
}

export interface Period {
  type: "month" | "quarter" | "year";
  key: string; // 2026-10, 2026-Q4, 2026
  from: string;
  to: string;
}

export function periodsOfYear(year: number): Period[] {
  const periods: Period[] = [];
  for (let m = 1; m <= 12; m++) {
    const key = `${year}-${String(m).padStart(2, "0")}`;
    periods.push({ type: "month", key, from: `${key}-01`, to: lastDayOfMonth(key) });
  }
  for (let q = 1; q <= 4; q++) {
    const first = `${year}-${String(q * 3 - 2).padStart(2, "0")}`;
    const last = `${year}-${String(q * 3).padStart(2, "0")}`;
    periods.push({ type: "quarter", key: `${year}-Q${q}`, from: `${first}-01`, to: lastDayOfMonth(last) });
  }
  periods.push({ type: "year", key: String(year), from: `${year}-01-01`, to: `${year}-12-31` });
  return periods;
}
