// Rates are CZK per 1 unit of the currency, as plain numbers.

export type SyncTrigger = "startup" | "schedule" | "cron" | "manual" | "backfill";

// running → ok (new fixings stored) | no_new_data | failed
export type ImportRunStatus = "running" | "ok" | "no_new_data" | "failed";

// A job's rates follow its tax date: ATA (import) or ATD (export).
export type LockBasis = "ata" | "atd";

export interface SyncResult {
  skipped: boolean; // another import was running, or one ran in the last few minutes
  status?: "ok" | "no_new_data" | "failed";
  rowsAdded?: number;
  latestValidDate?: string | null;
  error?: string;
}

export interface TodayRate {
  currency: string;
  rate: number | null;
  fixingDate: string | null;
  previousRate: number | null;
  previousFixingDate: string | null;
}

export interface RoeInfo {
  pct: number; // 100 = pure ČNB
  effectiveFrom: string | null; // null when never set
  changedByName: string;
  changedAt: string | null;
  note: string;
}

export interface RoeChange extends RoeInfo {
  id: string;
  effectiveFrom: string;
  changedAt: string;
  current: boolean;
  scheduled: boolean; // effective date still ahead
}

// ok: up to date · waiting: the expected fixing is not stored yet (ČNB late, or the next
// pull is due) · failed: the last import failed and data is behind · empty: nothing yet.
export type SyncState = "ok" | "waiting" | "failed" | "empty";

export interface SyncStatus {
  state: SyncState;
  latestFixing: string | null;
  expectedFixing: string;
  lastRunAt: string | null;
  lastRunStatus: ImportRunStatus | null;
  lastSuccessAt: string | null;
  lastError: string;
}

export interface AverageItem {
  currency: string;
  /** CZK per 1 unit, unrounded (IDR ≈ 0.00119) — for converting amounts */
  average: number;
  /** Units ČNB quotes the currency for (1, 100, 1000) and the average per that many, 3 dp — for display */
  amount: number;
  quoted: number;
  fixingDays: number;
}

// A fixing still missing after the 16:00 pull; open until the fixing is imported.
export interface FxAlertItem {
  id: string;
  fixingDate: string;
  reason: string;
  raisedAt: string;
  emailedAt: string | null;
  emailError: string; // why the e-mail was not sent, "" when it was
}

export interface FxOverview {
  today: string;
  rates: TodayRate[];
  roe: RoeInfo;
  scheduledRoe: RoeChange | null;
  month: string;
  monthAverages: AverageItem[];
  sync: SyncStatus;
  alerts: FxAlertItem[];
}

// fixing: ČNB published that day · weekend · no_fixing: a Czech public holiday (no fixing)
// · missing: expected but not imported · pending: today before the 15:00 pull · future.
export type DayKind = "fixing" | "weekend" | "no_fixing" | "missing" | "pending" | "future";

export interface DayRate {
  currency: string;
  rate: number;
  fixingDate: string;
  carried: boolean;
}

export interface DailyRow {
  date: string;
  kind: DayKind;
  fixingNo: number | null;
  roePct: number;
  rates: DayRate[];
}

export interface PeriodAverage {
  type: "month" | "quarter" | "year";
  key: string;
  from: string;
  to: string;
  final: boolean; // the period has ended; otherwise the average so far (provisional)
  averages: AverageItem[];
}

export interface ImportRunItem {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  trigger: SyncTrigger;
  status: ImportRunStatus;
  rowsAdded: number;
  latestValidDate: string | null;
  error: string;
}

export interface ResolvedRate {
  currency: string;
  date: string;
  rate: number | null; // null when there is no fixing that old — never treat as 1
  fixingDate: string | null;
  carried: boolean;
  provisional: boolean;
  /** A newer fixing should already be stored but isn't (import failed): the rate is stale — don't use it */
  missing: boolean;
  roePct: number;
  reason: string;
}

// The rates a job is valued at. locked: fixed at the job's ATA (import) / ATD (export).
// provisional: the job has no ATA/ATD yet, or ČNB has not published that day's fixing —
// valued by ETA/ETD (or today when that is blank too) and still moving.
export interface JobRates {
  shipmentId: string;
  direction: "import" | "export";
  directionAssumed: boolean; // trade direction blank — treated as import
  status: "locked" | "provisional";
  /** The tax-date fixing should be stored but isn't (import failed), so the job can't lock yet */
  ratesMissing: boolean;
  basis: "ata" | "atd" | "eta" | "etd" | "today";
  rateDate: string; // the date the rates are for
  lockedAt: string | null;
  previousRateDate: string | null; // the date it was locked at before ATA/ATD changed
  rates: { currency: string; rate: number; fixingDate: string }[];
}

// Every ČNB rate valid on a date plus the company ROE % in force — what a quote is priced
// with (live until it is sent, then stored on the quote).
export interface RatesOnDate {
  date: string;
  fixingDate: string | null; // the ČNB fixing used (the date's own, or the one carried to it)
  provisional: boolean; // a later fixing may still replace it (today before 15:00, future)
  /** A fixing for the date should already be stored but isn't (import failed): don't price or invoice with it */
  missing: boolean;
  roePct: number;
  rates: { currency: string; rate: number }[];
  /** Currencies ČNB no longer publishes on the date (BGN after 2025-12-31): no rate, not missing */
  retired: RetiredCurrencyItem[];
}

export interface RetiredCurrencyItem {
  currency: string;
  lastFixingDate: string; // its last ČNB fixing
}
