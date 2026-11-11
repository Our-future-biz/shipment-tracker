import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { holidaysService } from "../services/holidays.service";
import type { HolidayImportResult, HolidayRowInput } from "../interfaces/interfaces";

interface HolidayImportRequest {
  rows: HolidayRowInput[];
  source: string;
}

export const holidayImport = api(
  { expose: true, auth: true, method: "POST", path: "/holidays/import" },
  async (req: HolidayImportRequest): Promise<HolidayImportResult> => {
    // Managers only: the company's holidays move every lead time in Trucking.
    return holidaysService.import(requireRole("superadmin", "admin", "manager").companyID, req.rows, req.source);
  },
);
