import { api } from "encore.dev/api";
import type { MinLen } from "encore.dev/validate";
import { extractInvoiceFromFile } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractInvoiceRequest {
  fileBase64: string & MinLen<1>;
  fileName: string & MinLen<1>;
}

export const extractInvoice = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/invoice", bodyLimit: 50 * 1024 * 1024 },
  async (req: ExtractInvoiceRequest): Promise<ExtractionResult> => {
    return extractInvoiceFromFile(req.fileBase64, req.fileName);
  },
);
