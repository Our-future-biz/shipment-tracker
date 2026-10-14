import { api, Query } from "encore.dev/api";
import type { Max, MatchesRegexp, Min } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { fxRatesService } from "../services/fxRates.service";
import { startFxScheduler } from "../services/fxScheduler";
import { fxJobRatesService } from "../services/fxJobRates.service";
import type { DailyRow, FxAlertItem, FxOverview, JobRates, RatesOnDate, ImportRunItem, PeriodAverage, ResolvedRate, RoeChange } from "../interfaces/interfaces";

type IsoDate = string & MatchesRegexp<"^\\d{4}-\\d{2}-\\d{2}$">;

// Loading this module (as Encore does at startup) starts the local import timers.
startFxScheduler();

export const fxOverview = api(
  { expose: true, auth: true, method: "GET", path: "/fx/overview" },
  async (): Promise<FxOverview> => fxRatesService.overview(getAuthData()!.companyID),
);

interface DailyRequest {
  month: Query<string & MatchesRegexp<"^\\d{4}-(0[1-9]|1[0-2])$">>; // YYYY-MM
  all?: Query<boolean>; // every ČNB currency, not only EUR and USD
}

interface DailyResponse {
  month: string;
  currencies: string[];
  days: DailyRow[];
}

export const fxDaily = api(
  { expose: true, auth: true, method: "GET", path: "/fx/daily" },
  async (req: DailyRequest): Promise<DailyResponse> => fxRatesService.daily(getAuthData()!.companyID, req.month, req.all ?? false),
);

interface AveragesRequest {
  year: Query<number & Min<2000> & Max<2100>>;
  all?: Query<boolean>;
}

interface AveragesResponse {
  year: number;
  currencies: string[];
  periods: PeriodAverage[];
}

export const fxAverages = api(
  { expose: true, auth: true, method: "GET", path: "/fx/averages" },
  async (req: AveragesRequest): Promise<AveragesResponse> => fxRatesService.averages(req.year, req.all ?? false),
);

interface RoeListResponse {
  changes: RoeChange[];
}

export const fxRoeList = api(
  { expose: true, auth: true, method: "GET", path: "/fx/roe" },
  async (): Promise<RoeListResponse> => ({ changes: await fxRatesService.roeHistory(getAuthData()!.companyID) }),
);

interface ResolveRequest {
  currency: Query<string & MatchesRegexp<"^[A-Za-z]{3}$">>;
  date: Query<IsoDate>;
}

export const fxResolve = api(
  { expose: true, auth: true, method: "GET", path: "/fx/resolve" },
  async (req: ResolveRequest): Promise<ResolvedRate> => fxRatesService.resolve(getAuthData()!.companyID, req.currency, req.date),
);

interface ImportRunsRequest {
  limit?: Query<number & Min<1> & Max<200>>;
}

interface ImportRunsResponse {
  runs: ImportRunItem[];
}

export const fxImportRuns = api(
  { expose: true, auth: true, method: "GET", path: "/fx/import-runs" },
  async (req: ImportRunsRequest): Promise<ImportRunsResponse> => ({ runs: await fxRatesService.importRuns(req.limit ?? 50) }),
);

interface AlertsResponse {
  alerts: FxAlertItem[];
}

// Open "ČNB rates missing" alerts for the bell — admins only; everyone else gets none.
export const fxAlerts = api(
  { expose: true, auth: true, method: "GET", path: "/fx/alerts" },
  async (): Promise<AlertsResponse> => ({ alerts: await fxRatesService.alertsFor(getAuthData()!.role) }),
);

interface JobRatesRequest {
  shipmentId: string;
}

// The rates a job is valued at: locked at its ATA (import) / ATD (export), provisional by
// ETA/ETD until then. Reading it is what locks a job whose ATA/ATD has passed.
export const fxJobRates = api(
  { expose: true, auth: true, method: "GET", path: "/fx/job-rates/:shipmentId" },
  async (req: JobRatesRequest): Promise<JobRates> => fxJobRatesService.forShipment(getAuthData()!.companyID, req.shipmentId),
);

interface RatesOnRequest {
  date?: Query<IsoDate>; // today (Prague) when left out
}

// Every ČNB rate for a date plus the company ROE % — used to price quotes.
export const fxRatesOn = api(
  { expose: true, auth: true, method: "GET", path: "/fx/rates" },
  async (req: RatesOnRequest): Promise<RatesOnDate> => fxRatesService.ratesOn(getAuthData()!.companyID, req.date),
);
