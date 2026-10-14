// Rates are CZK per 1 unit of the currency, as plain numbers.

export type SyncTrigger = "startup" | "schedule" | "cron" | "manual" | "backfill";

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
  lastRunStatus: string | null;
  lastSuccessAt: string | null;
  lastError: string;
}

export interface AverageItem {
  currency: string;
  average: number;
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
  trigger: string;
  status: string;
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
  basis: "ata" | "atd" | "eta" | "etd" | "today";
  rateDate: string; // the date the rates are for
  lockedAt: string | null;
  previousRateDate: string | null; // the date it was locked at before ATA/ATD changed
  rates: { currency: string; rate: number; fixingDate: string }[];
}
