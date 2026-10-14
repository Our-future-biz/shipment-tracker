import { APIError } from "encore.dev/api";
import { auth } from "~encore/clients";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import { cnbImportRunRepository } from "../repositories/cnbImportRun.repository";
import { roeSettingRepository } from "../repositories/roeSetting.repository";
import type { RoeSettingRecord } from "../schemas/roeSetting.schema";
import { addDays, expectedLatestFixing, isCzechHoliday, isIsoDate, isWeekend, lastDayOfMonth, pragueToday } from "../lib/dates";
import { averageByCurrency, perUnit, periodsOfYear, resolveFixing, round } from "../lib/rates";
import { openAlerts } from "./fxAlert.service";
import type {
  DailyRow, DayKind, FxOverview, ImportRunItem, PeriodAverage, ResolvedRate, RoeChange, RoeInfo, SyncStatus, TodayRate,
} from "../interfaces/interfaces";

// The currencies the company trades in. Every ČNB currency is stored; these are shown first.
export const MAIN_CURRENCIES = ["EUR", "USD"];
export const DEFAULT_ROE_PCT = 100;
const ROE_MIN = 80;
const ROE_MAX = 120;

// Display names by user id; a lookup failure must not fail the read.
async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, u.displayName || u.email || ""]));
  } catch {
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

export const fxRatesService = {
  async overview(companyId: string): Promise<FxOverview> {
    const today = pragueToday();
    const month = today.slice(0, 7);
    const [history, names, monthRows, sync, alerts] = await Promise.all([
      roeSettingRepository.history(companyId),
      userNames(),
      cnbRateRepository.between(`${month}-01`, today, MAIN_CURRENCIES),
      syncStatus(),
      openAlerts(),
    ]);

    const rates: TodayRate[] = [];
    for (const currency of MAIN_CURRENCIES) {
      const [cur, prev] = await cnbRateRepository.lastTwo(currency, today);
      rates.push({
        currency,
        rate: cur ? perUnit(cur) : null,
        fixingDate: cur?.validDate ?? null,
        previousRate: prev ? perUnit(prev) : null,
        previousFixingDate: prev?.validDate ?? null,
      });
    }

    const inForce = history.find((h) => h.effectiveFrom <= today) ?? null;
    const upcoming = history.filter((h) => h.effectiveFrom > today).at(-1) ?? null;
    return {
      today,
      rates,
      roe: roeInfo(inForce, names),
      scheduledRoe: upcoming ? toChange(upcoming, names, inForce, today) : null,
      month,
      monthAverages: averageByCurrency(monthRows, `${month}-01`, today),
      sync,
      alerts,
    };
  },

  async daily(companyId: string, month: string, all: boolean): Promise<{ month: string; currencies: string[]; days: DailyRow[] }> {
    if (!/^\d{4}-\d{2}$/.test(month)) throw APIError.invalidArgument("Month must be YYYY-MM");
    const first = `${month}-01`;
    const last = lastDayOfMonth(month);
    const today = pragueToday();
    const currencies = all ? await cnbRateRepository.currencies() : MAIN_CURRENCIES;
    // A week before the month, so its first days can carry the previous fixing.
    const [rows, history] = await Promise.all([
      cnbRateRepository.between(addDays(first, -10), last, currencies),
      roeSettingRepository.history(companyId),
    ]);
    const byCurrency = new Map<string, typeof rows>();
    for (const r of rows) byCurrency.set(r.currency, [...(byCurrency.get(r.currency) ?? []), r]);
    const fixingNoByDate = new Map(rows.map((r) => [r.validDate, r.fixingNo]));
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

      const dayRates = kind === "future" ? [] : currencies.flatMap((currency) => {
        const res = resolveFixing(byCurrency.get(currency) ?? [], date, today);
        return res ? [{ currency, rate: res.rate, fixingDate: res.fixingDate, carried: res.carried }] : [];
      });
      days.push({ date, kind, fixingNo: fixingNoByDate.get(date) ?? null, roePct: pctOn(history, date), rates: dayRates });
    }
    return { month, currencies, days: days.reverse() };
  },

  async averages(year: number, all: boolean): Promise<{ year: number; currencies: string[]; periods: PeriodAverage[] }> {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw APIError.invalidArgument("Invalid year");
    const today = pragueToday();
    const currencies = all ? await cnbRateRepository.currencies() : MAIN_CURRENCIES;
    const rows = await cnbRateRepository.between(`${year}-01-01`, `${year}-12-31`, currencies);
    const periods = periodsOfYear(year)
      .filter((p) => p.from <= today)
      .map((p) => ({ ...p, final: p.to < today, averages: averageByCurrency(rows, p.from, p.to) }))
      .filter((p) => p.averages.length > 0);
    return { year, currencies, periods };
  },

  async roeHistory(companyId: string): Promise<RoeChange[]> {
    const today = pragueToday();
    const [history, names] = await Promise.all([roeSettingRepository.history(companyId), userNames()]);
    const inForce = history.find((h) => h.effectiveFrom <= today) ?? null;
    return history.map((h) => toChange(h, names, inForce, today));
  },

  async setRoe(companyId: string, userId: string, input: { pct: number; effectiveFrom: string; note: string }): Promise<RoeChange[]> {
    const pct = Number(input.pct);
    if (!Number.isFinite(pct) || pct < ROE_MIN || pct > ROE_MAX) {
      throw APIError.invalidArgument(`The ROE % must be between ${ROE_MIN} and ${ROE_MAX}`);
    }
    if (round(pct, 3) !== pct) throw APIError.invalidArgument("Use at most 3 decimals");
    if (!isIsoDate(input.effectiveFrom)) throw APIError.invalidArgument("Effective from must be a date (YYYY-MM-DD)");
    const note = input.note.trim();
    if (!note) throw APIError.invalidArgument("Add a note saying why the % changes");
    await roeSettingRepository.create({ companyId, pct: pct.toFixed(3), effectiveFrom: input.effectiveFrom, note, changedBy: userId });
    return this.roeHistory(companyId);
  },

  // The ČNB rate for a calendar date, plus the ROE % in force that day (not applied — the
  // caller applies it to a converted amount, and only when it prices a sale).
  async resolve(companyId: string, currencyRaw: string, date: string): Promise<ResolvedRate> {
    const currency = currencyRaw.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw APIError.invalidArgument("Currency must be a 3-letter code");
    if (!isIsoDate(date)) throw APIError.invalidArgument("Date must be YYYY-MM-DD");
    const today = pragueToday();
    const roe = await roeSettingRepository.inForce(companyId, date);
    const roePct = roe ? Number(roe.pct) : DEFAULT_ROE_PCT;
    if (currency === "CZK") {
      return { currency, date, rate: 1, fixingDate: null, carried: false, provisional: false, roePct, reason: "" };
    }
    const [row] = await cnbRateRepository.latestOnOrBefore(date, [currency]);
    const res = row ? resolveFixing([row], date, today) : null;
    if (!res) {
      return { currency, date, rate: null, fixingDate: null, carried: false, provisional: false, roePct, reason: `No ČNB rate for ${currency} on or before ${date}` };
    }
    return { currency, date, rate: res.rate, fixingDate: res.fixingDate, carried: res.carried, provisional: res.provisional, roePct, reason: "" };
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
