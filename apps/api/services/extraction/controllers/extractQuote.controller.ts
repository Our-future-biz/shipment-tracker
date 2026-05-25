import { api, APIError } from "encore.dev/api";
import { extractQuoteFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractQuoteRequest {
  fileBase64: string;
  fileName: string;
}

export const extractQuote = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/quote" },
  async (req: ExtractQuoteRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractQuoteFromFile(req.fileBase64, req.fileName);
  },
);
