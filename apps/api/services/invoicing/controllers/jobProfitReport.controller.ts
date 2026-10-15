import { api, Query } from "encore.dev/api";
import type { MatchesRegexp } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { jobProfitReportService } from "../services/jobProfitReport.service";
import type { JobProfitReport } from "../interfaces/interfaces";

interface JobProfitReportRequest {
  /** First month, YYYY-MM */
  from: Query<string & MatchesRegexp<"^\\d{4}-(0[1-9]|1[0-2])$">>;
  /** Last month, YYYY-MM */
  to: Query<string & MatchesRegexp<"^\\d{4}-(0[1-9]|1[0-2])$">>;
}

// Job revenue, cost and profit in CZK at each month's fixed ČNB average (Shipment Reports).
export const jobProfitReportGet = api(
  { expose: true, auth: true, method: "GET", path: "/reports/job-profit" },
  async (req: JobProfitReportRequest): Promise<JobProfitReport> =>
    jobProfitReportService.build(getAuthData()!.companyID, req.from, req.to),
);
