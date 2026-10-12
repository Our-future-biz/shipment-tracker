import { api, APIError } from "encore.dev/api";
import { extractQuoteFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractQuoteRequest {
  fileBase64: string;
  fileName: string;
}

export const extractQuote = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/quote", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractQuoteRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractQuoteFromFile(req.fileBase64, req.fileName);
  },
);
