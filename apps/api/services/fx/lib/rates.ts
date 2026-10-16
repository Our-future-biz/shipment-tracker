import { lastDayOfMonth, nextFixingDay } from "./dates";

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
  provisional: boolean; // a later fixing is still to come and may replace it (not published yet)
  missing: boolean; // a later fixing should already be stored but isn't (import failed) — don't use
}

/**
 * The rate for a calendar date: the newest fixing on or before it, as ČNB itself rules
 * (a fixing covers its day and any following weekend or Czech public holiday). `rows` are
 * one currency's fixings, in any order. `expectedLatest` is the newest fixing that should be
 * stored by now (expectedLatestFixing()). Returns null when no fixing is that old.
 *
 * When the next fixing day after the one found is on or before the date, the found fixing
 * is not the date's rate: it is either still to be published (provisional) or should have
 * been imported already and is missing — the latter must never be treated as final.
 */
export function resolveFixing(rows: Fixing[], date: string, expectedLatest: string): ResolvedFixing | null {
  let best: Fixing | null = null;
  for (const r of rows) {
    if (r.validDate <= date && (!best || r.validDate > best.validDate)) best = r;
  }
  if (!best) return null;
  const carried = best.validDate !== date;
  const next = nextFixingDay(best.validDate);
  const covered = next > date;
  return {
    rate: perUnit(best),
    fixingDate: best.validDate,
    carried,
    provisional: !covered && next > expectedLatest,
    missing: !covered && next <= expectedLatest,
  };
}

/**
 * Whether a currency whose newest fixing on or before a date is `fixingDate` is no longer
 * published by ČNB on that date: a later fixing (`newestFixing`, the newest of any currency on
 * or before the date) was imported without it — BGN after 2025-12-31, when Bulgaria adopted the
 * euro. Its old rate is not the date's rate, and the import did not fail, so it is not missing.
 */
export function isRetired(fixingDate: string, newestFixing: string | null): boolean {
  return newestFixing !== null && fixingDate < newestFixing;
}

export interface RetiredCurrency {
  currency: string;
  lastFixingDate: string;
}

export interface RatesForDate {
  rates: (ResolvedFixing & { currency: string })[];
  retired: RetiredCurrency[];
  fixingDate: string | null; // the newest fixing used
  provisional: boolean;
  missing: boolean;
}

/**
 * Every currency's rate for `date`. `latest` is each currency's newest fixing on or before the
 * date (one row per currency, as the repository's latestOnOrBefore returns them). A currency ČNB
 * has stopped publishing is listed in `retired`, without a rate, and never makes the date
 * provisional or missing — only the currencies still published decide that.
 */
export function ratesForDate(latest: Fixing[], date: string, expectedLatest: string): RatesForDate {
  const usable = latest.filter((r) => r.validDate <= date);
  const newest = usable.reduce<string | null>((max, r) => (!max || r.validDate > max ? r.validDate : max), null);
  const out: RatesForDate = { rates: [], retired: [], fixingDate: null, provisional: false, missing: false };
  for (const row of usable) {
    if (isRetired(row.validDate, newest)) {
      out.retired.push({ currency: row.currency, lastFixingDate: row.validDate });
      continue;
    }
    const res = resolveFixing([row], date, expectedLatest);
    if (!res) continue;
    out.rates.push({ currency: row.currency, ...res });
    if (!out.fixingDate || res.fixingDate > out.fixingDate) out.fixingDate = res.fixingDate;
    out.provisional ||= res.provisional;
    out.missing ||= res.missing;
  }
  out.rates.sort((a, b) => a.currency.localeCompare(b.currency));
  out.retired.sort((a, b) => a.currency.localeCompare(b.currency));
  return out;
}

// The ROE % is applied to an amount already converted at the raw ČNB rate, never folded
// into a stored rate: converted × pct / 100 is right in every direction, while dividing
// by an "adjusted rate" would give the customer a discount.
export function applyRoe(converted: number, pct: number): number {
  return converted * (pct / 100);
}

export interface Average {
  currency: string;
  /** CZK per 1 unit: `quoted / amount`, unrounded (an IDR rate is about 0.0012). */
  average: number;
  /** Units ČNB quotes the currency for (1, 100, 1000), and the average per that many, 3 dp. */
  amount: number;
  quoted: number;
  fixingDays: number;
}

/**
 * Period average as ČNB computes its own published averages: the plain mean of the
 * fixings whose date falls in the period, rounded to 3 decimals per the amount the
 * currency is quoted for (100 HUF, 1000 IDR) — never per 1 unit, which would round an
 * IDR rate of 0.00119 to 0.001. A quarter or year is the mean of all its fixings, not
 * the mean of the monthly averages.
 */
export function averageByCurrency(rows: Fixing[], from: string, to: string): Average[] {
  const sums = new Map<string, { total: number; n: number; amount: number; latest: string }>();
  for (const r of rows) {
    if (r.validDate < from || r.validDate > to) continue;
    const s = sums.get(r.currency) ?? { total: 0, n: 0, amount: r.amount || 1, latest: "" };
    s.total += perUnit(r);
    s.n += 1;
    // The quoting amount of the newest fixing (ČNB has changed it only on redenominations).
    if (r.validDate > s.latest) {
      s.latest = r.validDate;
      s.amount = r.amount || 1;
    }
    sums.set(r.currency, s);
  }
  return [...sums.entries()]
    .map(([currency, s]) => {
      const quoted = round((s.total / s.n) * s.amount, 3);
      return { currency, average: quoted / s.amount, amount: s.amount, quoted, fixingDays: s.n };
    })
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
