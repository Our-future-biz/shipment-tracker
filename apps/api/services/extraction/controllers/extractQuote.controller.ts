import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { chargeReading } from "../lib/readingBudget";
import type { MinLen } from "encore.dev/validate";
import { extractQuoteFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractQuoteRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export const extractQuote = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/quote", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractQuoteRequest): Promise<ExtractionResult> => {
    // One paid Claude read: counted against the user's hourly reading budget.
    chargeReading(getAuthData()!.userID, 1);
    return extractQuoteFromFile(req.fileBase64, req.fileName);
  },
);
