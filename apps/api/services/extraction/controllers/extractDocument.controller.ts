import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { extractShipmentFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractDocumentRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export const extractDocument = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/document", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractDocumentRequest): Promise<ExtractionResult> => {
    return extractShipmentFromFile(req.fileBase64, req.fileName);
  },
);
