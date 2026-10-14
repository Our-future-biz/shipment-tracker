import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { quoteService } from "../services/quote.service";

interface QuoteAllocateRefRequest {
  quoteNumber: string;
}

interface QuoteAllocateRefResponse {
  ref: string;
}

export const quoteAllocateRef = api(
  { expose: true, auth: true, method: "POST", path: "/quotes/:quoteNumber/allocate-ref" },
  async (req: QuoteAllocateRefRequest): Promise<QuoteAllocateRefResponse> => {
    return { ref: await quoteService.allocateSubLineRef(req.quoteNumber, getAuthData()!.companyID) };
  },
);
