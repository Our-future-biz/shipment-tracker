import { api, APIError } from "encore.dev/api";
import { extractQuoteFromFile } from "../services/extraction.service";
import { detectMediaType, isImageType, isPdfType } from "../lib/pdf";
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
    // A type the reader cannot open is refused by name, not answered as a document with nothing in it.
    const mediaType = detectMediaType(req.fileName);
    if (!isImageType(mediaType) && !isPdfType(mediaType)) {
      throw APIError.invalidArgument("This file type cannot be read - only PDF, JPG and PNG files can. Save the email as PDF or paste its text.");
    }
    return extractQuoteFromFile(req.fileBase64, req.fileName);
  },
);
