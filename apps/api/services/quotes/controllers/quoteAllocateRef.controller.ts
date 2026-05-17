import { api, APIError } from "encore.dev/api";
import { quoteService } from "../services/quote.service";

interface QuoteAllocateRefRequest {
  quoteNumber: string;
}

interface QuoteAllocateRefResponse {
  ref: string;
}

export const quoteAllocateRef = api(
  { expose: true, auth: false, method: "POST", path: "/quotes/:quoteNumber/allocate-ref" },
  async (req: QuoteAllocateRefRequest): Promise<QuoteAllocateRefResponse> => {
    if (!req.quoteNumber) {
      throw APIError.invalidArgument("quoteNumber is required");
    }
    const ref = await quoteService.allocateSubLineRef(req.quoteNumber);
    return { ref };
  },
);
