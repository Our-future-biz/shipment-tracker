import { api, APIError } from "encore.dev/api";
import { extractBookingFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractBookingRequest {
  fileBase64: string;
  fileName: string;
}

export const extractBooking = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/booking", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractBookingRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractBookingFromFile(req.fileBase64, req.fileName);
  },
);
