import { api, APIError } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { isUuid } from "../../../lib/uuid";
import { invoicingService } from "../services/invoicing.service";

interface ImportQuoteRequest {
  shipmentId: string;
  /** The whole reference of a sales quote, variant suffix included: QCZ20261010001-2 is not QCZ20261010001. */
  quoteNumber: string;
  /** The side of Costs Breakdown that gets the quote's lines: buying, selling, or both when left out. */
  target?: "buy" | "sell" | "both";
  /** Copy although lines of this quote were already copied to that side of this shipment. */
  force?: boolean;
}

interface ImportQuoteResponse {
  /** How many buying rows were added. */
  buying: number;
  /** How many selling rows were added. */
  selling: number;
}

/**
 * Copies the cost lines of a sales quote into a shipment's Costs Breakdown: one buying row per
 * buying line and one selling row per selling line, in the quote's order and each in its own
 * currency, read from the quote as it is stored. All rows or none. The same quote is copied to
 * a side only once - "costs from QCZ... were already copied to this shipment" - unless `force`
 * says to copy it again. Used when a shipment is created from a quote and by "Copy from quote"
 * on the Costs tab.
 */
export const invoicingImportQuote = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/import-quote" },
  async (req: ImportQuoteRequest): Promise<ImportQuoteResponse> => {
    // The id goes into SQL as one: Postgres would answer anything else with an error of its own.
    if (!isUuid(req.shipmentId)) throw APIError.invalidArgument("shipmentId must be the id of a shipment");
    const quoteNumber = (req.quoteNumber ?? "").trim();
    if (!quoteNumber) throw APIError.invalidArgument("quoteNumber is required");
    return invoicingService.importQuote(req.shipmentId, getAuthData()!.companyID, quoteNumber, req.target ?? "both", req.force === true);
  },
);
