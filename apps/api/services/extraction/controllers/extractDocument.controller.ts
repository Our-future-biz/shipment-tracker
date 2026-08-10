import { api, APIError } from "encore.dev/api";
import { extractShipmentFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractDocumentRequest {
  fileBase64: string;
  fileName: string;
}

export const extractDocument = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/document" },
  async (req: ExtractDocumentRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractShipmentFromFile(req.fileBase64, req.fileName);
  },
);
