import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { extractFromTextByDestination } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractTextRequest {
  text: string & MinLen<10> & MaxLen<1500>;
  destination: string; // "shipment" | "invoicing" | "quote" | "customs" | "booking"
}

export const extractText = api(
  { expose: true, auth: true, method: "POST", path: "/extraction/text" },
  async (req: ExtractTextRequest): Promise<ExtractionResult> => {
    return extractFromTextByDestination(req.text, req.destination);
  },
);
