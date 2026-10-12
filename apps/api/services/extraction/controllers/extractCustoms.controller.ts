import { api, APIError } from "encore.dev/api";
import { extractCustomsFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractCustomsRequest {
  fileBase64: string;
  fileName: string;
}

export const extractCustoms = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/customs", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractCustomsRequest): Promise<ExtractionResult> => {
    if (!req.fileBase64 || !req.fileName) {
      throw APIError.invalidArgument("fileBase64 and fileName are required");
    }
    return extractCustomsFromFile(req.fileBase64, req.fileName);
  },
);
