import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { chargeReading } from "../lib/readingBudget";
import type { MinLen } from "encore.dev/validate";
import { extractCustomsFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractCustomsRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export const extractCustoms = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/customs", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractCustomsRequest): Promise<ExtractionResult> => {
    // One paid Claude read: counted against the user's hourly reading budget.
    chargeReading(getAuthData()!.userID, 1);
    return extractCustomsFromFile(req.fileBase64, req.fileName);
  },
);
