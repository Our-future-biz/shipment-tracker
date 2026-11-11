import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { isAdminLevel } from "../../../lib/rbac";
import { auth, shipments } from "~encore/clients";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { cnbImportRunRepository } from "../repositories/cnbImportRun.repository";
import { roeSettingRepository } from "../repositories/roeSetting.repository";
import type { RoeSettingRecord } from "../schemas/roeSetting.schema";
import { addDays, expectedLatestFixing, isCzechHoliday, isIsoDate, isWeekend, lastDayOfMonth, pragueToday } from "../lib/dates";
import { againstBase, averageByCurrency, isRetired, perUnit, periodsOfYear, ratesForDate, resolveFixing, round, type Fixing } from "../lib/rates";
import { openAlerts } from "./fxAlert.service";
import { FX_CHOICE_PREF_KEY, parseCurrencyChoice, type CurrencyChoice } from "../lib/currencyChoice";
import type {
  DailyRow, DayKind, FxAlertItem, FxOverview, ImportRunItem, PeriodAverage, RatesOnDate, ResolvedRate, RetiredCurrencyItem, RoeChange, RoeInfo,
  SyncStatus, TodayRate,
} from "../interfaces/interfaces";

// The currencies the company trades in. Every ČNB currency is stored; these are shown first.
export const MAIN_CURRENCIES = ["EUR", "USD"];
// What a user who hasn't picked sees: the first two of these that aren't their base currency.
const DEFAULT_CURRENCIES = ["EUR", "USD", "CZK"];
export const DEFAULT_ROE_PCT = 100;

// Display names by user id; a lookup failure must not fail the read.
async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, u.displayName || u.email || ""]));
  } catch (err) {
    log.warn("fx: user names unavailable, showing changes without names", { error: err instanceof Error ? err.message : String(err) });
    return new Map();
  }
}

function roeInfo(row: RoeSettingRecord | null, names: Map<string, string>): RoeInfo {
  if (!row) return { pct: DEFAULT_ROE_PCT, effectiveFrom: null, changedByName: "", changedAt: null, note: "" };
  return {
    pct: Number(row.pct),
    effectiveFrom: row.effectiveFrom,
    changedByName: names.get(row.changedBy) ?? "",
    changedAt: row.createdAt.toISOString(),
    note: row.note,
  };
}

// The % in force on `date` from a history list (newest effective date first, as stored).
function pctOn(history: RoeSettingRecord[], date: string): number {
  const row = history.find((h) => h.effectiveFrom <= date);
  return row ? Number(row.pct) : DEFAULT_ROE_PCT;
}

// A currency's newest fixing on or before today and the one before it, from `rows` (any order).
function todayRate(currency: string, rows: Fixing[]): TodayRate {
  const [cur, prev] = rows.filter((r) => r.currency === currency).sort((a, b) => b.validDate.localeCompare(a.validDate));
  return {
    currency,
    rate: cur ? perUnit(cur) : null,
    amount: cur?.amount || 1,
    fixingDate: cur?.validDate ?? null,
    previousRate: prev ? perUnit(prev) : null,
    previousFixingDate: prev?.validDate ?? null,
  };
}

function scheduledRoe(history: RoeSettingRecord[], names: Map<string, string>, today: string): RoeChange | null {
  const inForce = history.find((h) => h.effectiveFrom <= today) ?? null;
  const upcoming = history.filter((h) => h.effectiveFrom > today).at(-1) ?? null;
  return upcoming ? toChange(upcoming, names, inForce, today) : null;
}

async function syncStatus(): Promise<SyncStatus> {
  const [latestFixing, runs] = await Promise.all([cnbRateRepository.latestValidDate(), cnbImportRunRepository.recent(20)]);
  const expectedFixing = expectedLatestFixing();
  const last = runs[0] ?? null;
  const lastSuccess = runs.find((r) => r.status === "ok" || r.status === "no_new_data") ?? null;

  let state: SyncStatus["state"];
  if (!latestFixing) state = last?.status === "failed" ? "failed" : "empty";
  else if (latestFixing >= expectedFixing) state = "ok";
  // ČNB itself offered nothing newer at the last successful check: late, or a public holiday.
  else if (last && last.status !== "failed" && last.latestValidDate === latestFixing) state = "waiting";
  else state = last?.status === "failed" ? "failed" : "waiting";

  return {
    state,
    latestFixing,
    expectedFixing,
    lastRunAt: last ? last.startedAt.toISOString() : null,
    lastRunStatus: last?.status ?? null,
    lastSuccessAt: lastSuccess ? (lastSuccess.finishedAt ?? lastSuccess.startedAt).toISOString() : null,
    lastError: last?.status === "failed" ? last.error : "",
  };
}

// The signed-in user's saved choice of currencies (shipments' user preferences). A failed read
// gives the default, so the page still shows.
async function savedChoice(): Promise<CurrencyChoice> {
  try {
    return parseCurrencyChoice((await shipments.userPrefGet({ prefKey: FX_CHOICE_PREF_KEY })).value);
  } catch (err) {
    log.warn(err, "the user's chosen currencies could not be read; the default is shown");
    return parseCurrencyChoice(null);
  }
}

export const fxRatesService = {
  // `choice`: the currencies the user picked to see, in their order, and the currency the rates
  // are shown against (CZK, as ČNB publishes them, when left out); none - the user's saved choice,
  // read here, so the page needs no read of its own first.
  async overview(companyId: string, choice?: { currencies: string[]; base?: string }): Promise<FxOverview> {
    const { currencies: chosen, base: baseArg = "CZK" } = choice ?? (await savedChoice());
    const today = pragueToday();
    const month = today.slice(0, 7);
    const [history, names, sync, alerts, allCurrencies] = await Promise.all([
      roeSettingRepository.history(companyId),
      userNames(),
      syncStatus(),
      openAlerts(),
      cnbRateRepository.currencies(),
    ]);
    // Only what ČNB still publishes can be picked; a retired currency (BGN) drops out of a saved list.
    const latest = await cnbRateRepository.latestOnOrBefore(today, allCurrencies);
    const published = ratesForDate(latest, today, expectedLatestFixing()).rates.map((r) => r.currency);
    const available = ["CZK", ...published].sort();
    const base = available.includes(baseArg.toUpperCase()) ? baseArg.toUpperCase() : "CZK";
    const picked = [...new Set(chosen.map((c) => c.toUpperCase()))].filter((c) => available.includes(c) && c !== base);
    const currencies = picked.length ? picked : DEFAULT_CURRENCIES.filter((c) => c !== base).slice(0, 2);

    // Two weeks before the month, so the last two fixings are there on the month's first days too.
    const cnbShown = [base, ...currencies].filter((c) => c !== "CZK");
    const rows = await cnbRateRepository.between(addDays(`${month}-01`, -14), today, cnbShown);
    const cross = againstBase(rows, base);
    const averages = averageByCurrency(cross, `${month}-01`, today);

    return {
      today,
      base,
      currencies,
      available,
      rates: currencies.map((c) => todayRate(c, cross)),
      cnbRates: cnbShown.map((c) => todayRate(c, rows)),
      roe: roeInfo(history.find((h) => h.effectiveFrom <= today) ?? null, names),
      scheduledRoe: scheduledRoe(history, names, today),
      month,
      // in the order of `currencies`, like `rates`
      monthAverages: currencies.flatMap((c) => averages.filter((a) => a.currency === c)),
      sync,
      alerts,
    };
  },

  async daily(
    companyId: string, month: string, all: boolean,
  ): Promise<{ month: string; currencies: string[]; days: DailyRow[]; retired: RetiredCurrencyItem[] }> {
    const first = `${month}-01`;
    const last = lastDayOfMonth(month);
    const today = pragueToday();
    const currencies = all ? await cnbRateRepository.currencies() : MAIN_CURRENCIES;
    // A week before the month, so its first days can carry the previous fixing.
    const asOf = last < today ? last : today;
    const [rows, history, latest] = await Promise.all([
      cnbRateRepository.between(addDays(first, -10), last, currencies),
      roeSettingRepository.history(companyId),
      cnbRateRepository.latestOnOrBefore(asOf, currencies),
    ]);
    const byCurrency = new Map<string, typeof rows>();
    for (const r of rows) byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
    const fixingNoByDate = new Map(rows.map((r) => [r.validDate, r.fixingNo]));
    const fixingDates = [...fixingNoByDate.keys()].sort();
    const expected = expectedLatestFixing();

    const days: DailyRow[] = [];
    for (let date = first; date <= last; date = addDays(date, 1)) {
      const hasFixing = fixingNoByDate.has(date);
      let kind: DayKind;
      if (hasFixing) kind = "fixing";
      else if (date > today) kind = "future";
      else if (isWeekend(date)) kind = "weekend";
      else if (isCzechHoliday(date)) kind = "no_fixing";
      else kind = date <= expected ? "missing" : "pending";

      const newest = fixingDates.filter((d) => d <= date).at(-1) ?? null;
      const dayRates = kind === "future" ? [] : currencies.flatMap((currency) => {
        const res = resolveFixing(byCurrency.get(currency) ?? [], date, expected);
        // a currency ČNB no longer publishes has no rate that day — never its old one carried on
        return res && !isRetired(res.fixingDate, newest)
          ? [{ currency, rate: res.rate, amount: res.amount, fixingDate: res.fixingDate, carried: res.carried }]
          : [];
      });
      days.push({ date, kind, fixingNo: fixingNoByDate.get(date) ?? null, roePct: pctOn(history, date), rates: dayRates });
    }
    // All currencies: one ČNB stopped publishing before the month has nothing to show in it.
    const shown = all ? currencies.filter((c) => days.some((d) => d.rates.some((r) => r.currency === c))) : currencies;
    const { retired } = ratesForDate(latest, asOf, expected);
    return { month, currencies: shown, days: days.reverse(), retired };
  },

  async averages(year: number, all: boolean): Promise<{ year: number; currencies: string[]; periods: PeriodAverage[] }> {
    const today = pragueToday();
    const currencies = all ? await cnbRateRepository.currencies() : MAIN_CURRENCIES;
    const rows = await cnbRateRepository.between(`${year}-01-01`, `${year}-12-31`, currencies);
    const periods = periodsOfYear(year)
      .filter((p) => p.from <= today)
      .map((p) => ({ ...p, final: p.to < today, averages: averageByCurrency(rows, p.from, p.to) }))
      .filter((p) => p.averages.length > 0);
    // All currencies: one ČNB stopped publishing before the year has no average in it.
    const shown = all ? currencies.filter((c) => periods.some((p) => p.averages.some((a) => a.currency === c))) : currencies;
    return { year, currencies: shown, periods };
  },

  async roeHistory(companyId: string): Promise<RoeChange[]> {
    const today = pragueToday();
    const [history, names] = await Promise.all([roeSettingRepository.history(companyId), userNames()]);
    const inForce = history.find((h) => h.effectiveFrom <= today) ?? null;
    return history.map((h) => toChange(h, names, inForce, today));
  },

  // Range (80–120) and format are checked by the endpoint's validators; what they can't express is here.
  async setRoe(companyId: string, userId: string, input: { pct: number; effectiveFrom: string; note: string }): Promise<RoeChange[]> {
    const { pct } = input;
    if (round(pct, 3) !== pct) throw APIError.invalidArgument("Use at most 3 decimals");
    if (!isIsoDate(input.effectiveFrom)) throw APIError.invalidArgument("Effective from must be a real date (YYYY-MM-DD)");
    const note = input.note.trim();
    if (!note) throw APIError.invalidArgument("Add a note saying why the % changes");
    // Backdating is allowed (the page asks the admin to confirm it): it changes the % that
    // drafts and previews of past dates use, so it is logged.
    const today = pragueToday();
    if (input.effectiveFrom < today) {
      log.warn("fx: ROE % backdated", { companyId, userId, pct, effectiveFrom: input.effectiveFrom, today });
    }
    await roeSettingRepository.createForCompany(companyId, { pct: pct.toFixed(3), effectiveFrom: input.effectiveFrom, note, changedBy: userId });
    return this.roeHistory(companyId);
  },

  // The ČNB rate for a calendar date, plus the ROE % in force that day (not applied — the
  // caller applies it to a converted amount, and only when it prices a sale).
  async resolve(companyId: string, currencyRaw: string, date: string): Promise<ResolvedRate> {
    const currency = currencyRaw.toUpperCase();
    if (!isIsoDate(date)) throw APIError.invalidArgument("Date must be a real date (YYYY-MM-DD)");
    const roe = await roeSettingRepository.inForce(companyId, date);
    const roePct = roe ? Number(roe.pct) : DEFAULT_ROE_PCT;
    if (currency === "CZK") {
      return { currency, date, rate: 1, fixingDate: null, carried: false, provisional: false, missing: false, roePct, reason: "" };
    }
    const [[row], newest] = await Promise.all([cnbRateRepository.latestOnOrBefore(date, [currency]), cnbRateRepository.latestValidDate(date)]);
    const res = row ? resolveFixing([row], date, expectedLatestFixing()) : null;
    if (res && isRetired(res.fixingDate, newest)) {
      return {
        currency, date, rate: null, fixingDate: null, carried: false, provisional: false, missing: false, roePct,
        reason: `ČNB no longer publishes ${currency} (last fixing ${res.fixingDate})`,
      };
    }
    if (!res) {
      return {
        currency, date, rate: null, fixingDate: null, carried: false, provisional: false, missing: false, roePct,
        reason: `No ČNB rate for ${currency} on or before ${date}`,
      };
    }
    return {
      currency, date, rate: res.rate, fixingDate: res.fixingDate, carried: res.carried, provisional: res.provisional,
      missing: res.missing, roePct, reason: res.missing ? `The ČNB fixing after ${res.fixingDate} has not been imported` : "",
    };
  },

  /** Every ČNB rate valid on `date` (today in Prague when left out) plus the ROE % in force. */
  async ratesOn(companyId: string, dateArg?: string): Promise<RatesOnDate> {
    const date = dateArg || pragueToday();
    if (!isIsoDate(date)) throw APIError.invalidArgument("Date must be a real date (YYYY-MM-DD)");
    const [currencies, roe] = await Promise.all([cnbRateRepository.currencies(), roeSettingRepository.inForce(companyId, date)]);
    const rows = await cnbRateRepository.latestOnOrBefore(date, currencies);
    // A currency ČNB stopped publishing (BGN) is listed as retired: it never makes the date missing.
    const { rates, retired, fixingDate, provisional, missing } = ratesForDate(rows, date, expectedLatestFixing());
    return {
      date, fixingDate, provisional, missing, roePct: roe ? Number(roe.pct) : DEFAULT_ROE_PCT,
      rates: rates.map((r) => ({ currency: r.currency, rate: r.rate })),
      retired,
    };
  },

  /** Open "ČNB rates missing" alerts — only admins see them (they act on them). */
  async alertsFor(role: string): Promise<FxAlertItem[]> {
    return isAdminLevel(role) ? openAlerts() : [];
  },

  async importRuns(limit: number): Promise<ImportRunItem[]> {
    const runs = await cnbImportRunRepository.recent(Math.min(Math.max(limit, 1), 200));
    return runs.map((r) => ({
      id: r.id,
      startedAt: r.startedAt.toISOString(),
      finishedAt: r.finishedAt ? r.finishedAt.toISOString() : null,
      trigger: r.trigger,
      status: r.status,
      rowsAdded: r.rowsAdded,
      latestValidDate: r.latestValidDate,
      error: r.error,
    }));
  },
};

function toChange(h: RoeSettingRecord, names: Map<string, string>, inForce: RoeSettingRecord | null, today: string): RoeChange {
  return {
    ...roeInfo(h, names),
    id: h.id,
    effectiveFrom: h.effectiveFrom,
    changedAt: h.createdAt.toISOString(),
    current: inForce?.id === h.id,
    scheduled: h.effectiveFrom > today,
  };
}
