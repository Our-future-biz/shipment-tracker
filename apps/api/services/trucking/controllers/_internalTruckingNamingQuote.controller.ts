import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { consignmentService } from "../services/consignment.service";

interface TruckingNamingQuoteRequest {
  /** A sales quote reference. */
  reference: string & MinLen<1> & MaxLen<50>;
}

interface TruckingNamingQuoteResponse {
  /** The refs (TCZ…) of the caller's company's consignments that name the quote, the oldest first. */
  consignments: string[];
}

/**
 * Internal API of the quotes service: which trucking jobs name a quote - priced from it, or with
 * its number typed. A quote a trucking job names must not be deleted.
 */
export const _internalTruckingNamingQuote = api(
  { expose: false, auth: true, method: "POST", path: "/internal/trucking/naming-quote" },
  async (req: TruckingNamingQuoteRequest): Promise<TruckingNamingQuoteResponse> => {
    return { consignments: await consignmentService.refsNamingQuote(getAuthData()!.companyID, req.reference) };
  },
);
