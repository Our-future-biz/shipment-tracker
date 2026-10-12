import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { holidaysService } from "../services/holidays.service";
import type { HolidayRowInput } from "../interfaces/interfaces";

interface HolidayImportRequest {
  rows: HolidayRowInput[];
  source: string;
}

interface HolidayImportResponse {
  added: number;
  skipped: number;
}

export const holidayImport = api(
  { expose: true, auth: true, method: "POST", path: "/holidays/import" },
  async (req: HolidayImportRequest): Promise<HolidayImportResponse> => {
    return holidaysService.import(getAuthData()!.companyID, req.rows ?? [], (req.source ?? "").trim());
  },
);
