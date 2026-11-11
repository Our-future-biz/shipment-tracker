import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { readHolidayFile } from "../services/holidayReader.service";
import type { HolidayReadResult } from "../interfaces/interfaces";

interface HolidayReadRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

// Reads holidays out of an uploaded file for review; nothing is saved yet. Managers only: the
// holidays move every lead time in Trucking, and reading a file is a paid AI call.
export const holidayRead = api(
  { expose: true, auth: true, method: "POST", path: "/holidays/read" },
  async (req: HolidayReadRequest): Promise<HolidayReadResult> => {
    requireRole("superadmin", "admin", "manager");
    return readHolidayFile(req.fileBase64, req.fileName);
  },
);
