import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { readHolidayFile } from "../services/holidayReader.service";
import type { HolidayReadResult } from "../interfaces/interfaces";

interface HolidayReadRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

// Reads holidays out of an uploaded file for review; nothing is saved yet.
export const holidayRead = api(
  { expose: true, auth: true, method: "POST", path: "/holidays/read" },
  async (req: HolidayReadRequest): Promise<HolidayReadResult> => {
    return readHolidayFile(req.fileBase64, req.fileName);
  },
);
