import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { QuoteImportResult, QuoteImportTarget } from "../interfaces/interfaces";

interface ImportQuoteRequest {
  shipmentId: string;
  /** The whole reference of a sales quote, variant suffix included: QCZ20261010001-2 is not QCZ20261010001. */
  quoteNumber: string & MinLen<1> & MaxLen<50>;
  /** The side of Costs Breakdown that gets the quote's lines: buying, selling, or both when left out. */
  target?: QuoteImportTarget;
  /** Copy although lines of this quote were already copied to that side of this shipment. */
  force?: boolean;
}

/**
 * Copies the cost lines of a sales quote into a shipment's Costs Breakdown: one buying row per
 * buying line and one selling row per selling line, in the quote's order and each in its own
 * currency, read from the quote as it is stored. All rows or none. The same quote is copied to
 * a side only once - "Costs from QCZ... were already copied to this shipment" - unless `force`
 * says to copy it again. Used when a shipment is created from a quote and by "Copy from quote"
 * on the Costs tab.
 */
export const invoicingImportQuote = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/import-quote" },
  async (req: ImportQuoteRequest): Promise<QuoteImportResult> => {
    return invoicingService.importQuote(req.shipmentId, getAuthData()!.companyID, req.quoteNumber.trim(), req.target ?? "both", req.force === true);
  },
);
