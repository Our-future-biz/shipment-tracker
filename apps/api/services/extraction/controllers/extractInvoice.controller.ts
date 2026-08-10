import { api, APIError } from "encore.dev/api";
import { extractInvoiceFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractInvoiceRequest {
  fileBase64: string;
  fileName: string;
}

export const extractInvoice = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/invoice" },
  async (req: ExtractInvoiceRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractInvoiceFromFile(req.fileBase64, req.fileName);
  },
);
