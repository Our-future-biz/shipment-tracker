import { api, APIError } from "encore.dev/api";
import { extractFromTextByDestination } from "../services/extraction.service";
import type { ExtractionResult } from "../interfaces/interfaces";

interface ExtractTextRequest {
  text: string;
  destination: string; // "shipment" | "invoicing" | "quote"
}

export const extractText = api(
  { expose: true, auth: false, method: "POST", path: "/extraction/text" },
  async (req: ExtractTextRequest): Promise<ExtractionResult> => {
    if (!req.text || req.text.length < 10) {
      throw APIError.invalidArgument("text must be at least 10 characters");
    }
    if (req.text.length > 1500) {
      throw APIError.invalidArgument("text must be at most 1500 characters");
    }
    return extractFromTextByDestination(req.text, req.destination);
  },
);
