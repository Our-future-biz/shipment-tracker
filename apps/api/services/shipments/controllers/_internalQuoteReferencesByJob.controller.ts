import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { shipmentService } from "../services/shipment.service";

interface QuoteReferencesByJobRequest {
  /** Part of a job number, as typed in the Quotes list's "Shipment (job no.)" filter. */
  jobNumber: string & MinLen<1> & MaxLen<200>;
}

interface QuoteReferencesByJobResponse {
  /** The quote references (Sales Number) of the caller's company's live shipments whose job number contains it. */
  references: string[];
}

/**
 * Internal API of the quotes service: a quote lists all the shipments that name it, but keeps only
 * the first one's job number - its "Shipment (job no.)" filter asks here for the others.
 */
export const _internalQuoteReferencesByJob = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/quote-references-by-job" },
  async (req: QuoteReferencesByJobRequest): Promise<QuoteReferencesByJobResponse> => {
    return { references: await shipmentService.quoteReferencesByJobNumber(getAuthData()!.companyID, req.jobNumber) };
  },
);
