import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { fxRatesService } from "../services/fxRates.service";
import { startFxScheduler } from "../services/fxScheduler";
import { openAlerts } from "../services/fxAlert.service";
import { isAdminLevel } from "../../../lib/rbac";
import type { DailyRow, FxAlertItem, FxOverview, ImportRunItem, PeriodAverage, ResolvedRate, RoeChange } from "../interfaces/interfaces";

// Loading this module (as Encore does at startup) starts the local import timers.
startFxScheduler();

export const fxOverview = api(
  { expose: true, auth: true, method: "GET", path: "/fx/overview" },
  async (): Promise<FxOverview> => fxRatesService.overview(getAuthData()!.companyID),
);

interface DailyRequest {
  month: Query<string>; // YYYY-MM
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
  year: Query<number>;
  all?: Query<boolean>;
}

interface AveragesResponse {
  year: number;
  currencies: string[];
  periods: PeriodAverage[];
}

export const fxAverages = api(
  { expose: true, auth: true, method: "GET", path: "/fx/averages" },
  async (req: AveragesRequest): Promise<AveragesResponse> => fxRatesService.averages(Number(req.year), req.all ?? false),
);

interface RoeListResponse {
  changes: RoeChange[];
}

export const fxRoeList = api(
  { expose: true, auth: true, method: "GET", path: "/fx/roe" },
  async (): Promise<RoeListResponse> => ({ changes: await fxRatesService.roeHistory(getAuthData()!.companyID) }),
);

interface ResolveRequest {
  currency: Query<string>;
  date: Query<string>; // YYYY-MM-DD
}

export const fxResolve = api(
  { expose: true, auth: true, method: "GET", path: "/fx/resolve" },
  async (req: ResolveRequest): Promise<ResolvedRate> => fxRatesService.resolve(getAuthData()!.companyID, req.currency, req.date),
);

interface ImportRunsRequest {
  limit?: Query<number>;
}

interface ImportRunsResponse {
  runs: ImportRunItem[];
}

export const fxImportRuns = api(
  { expose: true, auth: true, method: "GET", path: "/fx/import-runs" },
  async (req: ImportRunsRequest): Promise<ImportRunsResponse> => ({ runs: await fxRatesService.importRuns(Number(req.limit ?? 50)) }),
);

interface AlertsResponse {
  alerts: FxAlertItem[];
}

// Open "ČNB rates missing" alerts for the bell — admins only; everyone else gets none.
export const fxAlerts = api(
  { expose: true, auth: true, method: "GET", path: "/fx/alerts" },
  async (): Promise<AlertsResponse> => ({ alerts: isAdminLevel(getAuthData()!.role) ? await openAlerts() : [] }),
);
