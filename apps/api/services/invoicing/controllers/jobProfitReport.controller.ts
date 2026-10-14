import { api, Query } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { jobProfitReport, type JobProfitReport } from "../services/jobProfitReport.service";

interface JobProfitReportRequest {
  from: Query<string>; // YYYY-MM
  to: Query<string>; // YYYY-MM
}

// Job revenue, cost and profit in CZK at each month's fixed ČNB average (Shipment Reports).
export const jobProfitReportGet = api(
  { expose: true, auth: true, method: "GET", path: "/reports/job-profit" },
  async (req: JobProfitReportRequest): Promise<JobProfitReport> => jobProfitReport(getAuthData()!.companyID, req.from, req.to),
);
