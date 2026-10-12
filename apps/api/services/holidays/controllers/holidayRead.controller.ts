import { api, APIError } from "encore.dev/api";
import { readHolidayFile } from "../services/holidayReader";
import type { HolidayRowInput } from "../interfaces/interfaces";

interface HolidayReadRequest {
  fileBase64: string;
  fileName: string;
}

interface HolidayReadResponse {
  rows: HolidayRowInput[];
  // "spreadsheet" when the file's columns matched and were read directly, "ai" otherwise.
  method: string;
  warning?: string;
}

// Reads holidays out of an uploaded file for review; nothing is saved yet.
export const holidayRead = api(
  { expose: true, auth: true, method: "POST", path: "/holidays/read" },
  async (req: HolidayReadRequest): Promise<HolidayReadResponse> => {
    if (!req.fileBase64 || !req.fileName) throw APIError.invalidArgument("fileBase64 and fileName are required");
    return readHolidayFile(req.fileBase64, req.fileName);
  },
);
