import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";

interface QuoteDeleteRequest {
  quoteNumber: string;
}

interface QuoteDeleteResponse {
  ok: boolean;
}

export const quoteDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/quotes/:quoteNumber" },
  async (req: QuoteDeleteRequest): Promise<QuoteDeleteResponse> => {
    await quoteService.softDelete(req.quoteNumber, getAuthData()!.companyID);
    return { ok: true };
  },
);
