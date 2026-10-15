import { api, type Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { reportsService } from "../services/reports.service";
import type { FileDownload } from "../interfaces/interfaces";
import type { TruckingReport } from "../interfaces/reports.interfaces";

interface TruckingReportRequest {
  /** YYYY-MM-DD (Prague), first day included; default 6 days before `to`. */
  from?: Query<string>;
  /** YYYY-MM-DD (Prague), last day included; default today. At most 366 days. */
  to?: Query<string>;
}

// Reports tab: the KPIs of the period (delivered date, Prague), the margin tables, the haulier
// scorecard, the coverage gaps and the department result. Any logged-in user of the company (all
// users see buy prices).
export const truckingReport = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/reports" },
  async ({ from, to }: TruckingReportRequest): Promise<{ report: TruckingReport }> => ({
    report: await reportsService.report(getAuthData()!.companyID, { from, to }),
  }),
);

// The same report as an Excel workbook (sheets KPIs, Margin by customer / lane / service level,
// Hauliers, Coverage gaps, Department).
export const truckingReportExport = api(
  { expose: true, auth: true, method: "GET", path: "/trucking/reports/export" },
  async ({ from, to }: TruckingReportRequest): Promise<{ file: FileDownload }> => ({
    file: await reportsService.exportReport(getAuthData()!.companyID, { from, to }),
  }),
);
