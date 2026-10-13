import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { extractBookingFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractBookingRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export const extractBooking = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/booking", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractBookingRequest): Promise<ExtractionResult> => {
    return extractBookingFromFile(req.fileBase64, req.fileName);
  },
);
