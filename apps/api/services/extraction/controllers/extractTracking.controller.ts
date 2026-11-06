import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import type { MinLen } from "encore.dev/validate";
import { chargeReading } from "../lib/readingBudget";
import { extractTrackingFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractTrackingRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

// A notice about where a cargo is, for a shipment's Tracking tab.
export const extractTracking = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/tracking", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractTrackingRequest): Promise<ExtractionResult> => {
    // One paid Claude read: counted against the user's hourly reading budget.
    chargeReading(getAuthData()!.userID, 1);
    return extractTrackingFromFile(req.fileBase64, req.fileName);
  },
);
