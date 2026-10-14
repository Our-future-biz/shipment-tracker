// ČNB exchange-rate API client (https://api.cnb.cz/cnbapi, public, no key).
// Rates are CZK per `amount` units; the fixing a row belongs to is its `validFor`,
// which is the date to store it under — never the date that was asked for.

const BASE = "https://api.cnb.cz/cnbapi";
const TIMEOUT_MS = 10_000;

export interface CnbRow {
  validDate: string;
  currency: string;
  amount: number;
  rate: number;
  fixingNo: number | null;
}

interface CnbApiRate {
  validFor?: unknown;
  order?: unknown;
  currencyCode?: unknown;
  amount?: unknown;
  rate?: unknown;
}

export function parseRates(body: unknown): CnbRow[] {
  const list = (body as { rates?: unknown } | null)?.rates;
  if (!Array.isArray(list)) throw new Error("Unexpected ČNB response: no rates list");
  const rows: CnbRow[] = [];
  for (const r of list as CnbApiRate[]) {
    const validDate = typeof r.validFor === "string" ? r.validFor : "";
    const currency = typeof r.currencyCode === "string" ? r.currencyCode.toUpperCase() : "";
    const amount = Number(r.amount);
    const rate = Number(r.rate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(validDate) || !/^[A-Z]{3}$/.test(currency)) continue;
    if (!Number.isFinite(amount) || amount <= 0 || !Number.isFinite(rate) || rate <= 0) continue;
    rows.push({ validDate, currency, amount, rate, fixingNo: Number.isInteger(r.order) ? (r.order as number) : null });
  }
  return rows;
}

async function getJson(path: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "shipment-tracker/fx (CNB rate import)" }, // headers must be ASCII
    });
    if (!res.ok) throw new Error(`ČNB answered ${res.status} for ${path}`);
    return await res.json();
  } catch (err) {
    if (controller.signal.aborted) throw new Error(`ČNB did not answer within ${TIMEOUT_MS / 1000} s`);
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// The fixing valid for `date` (yyyy-mm-dd): the latest one on or before it.
export async function fetchDaily(date: string): Promise<CnbRow[]> {
  return parseRates(await getJson(`/exrates/daily?date=${date}&lang=EN`));
}

// Every fixing of a year in one call (about 0.5 MB) — used to fill gaps and backfill.
export async function fetchYear(year: number): Promise<CnbRow[]> {
  return parseRates(await getJson(`/exrates/daily-year?year=${year}&lang=EN`));
}
