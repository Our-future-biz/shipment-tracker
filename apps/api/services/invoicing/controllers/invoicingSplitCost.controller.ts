import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { invoicingService } from "../services/invoicing.service";
import type { CostSplitLine, CostSplitResultLine, InvoiceLinesInput, InvoiceLinesRow } from "../interfaces/interfaces";

interface SplitCostRequest {
  /** the charge code the parts are posted under */
  category: string & MinLen<1> & MaxLen<200>;
  /** the invoice total, a decimal string ("1250.50") */
  total: string & MinLen<1> & MaxLen<20>;
  currency: string & MinLen<1> & MaxLen<10>;
  invoiceNumber: string & MinLen<1> & MaxLen<100>;
  /** who issued the invoice, recorded on each part */
  vendor?: string & MaxLen<200>;
  lines: CostSplitLine[];
  /** shipments whose real cost of the code is replaced; the others keep theirs */
  overwriteShipmentIds?: string[];
  /** only answer the split, write nothing */
  dryRun?: boolean;
  /** the supplier picked from the Customer Database: every part links it and is booked Received (Accounts Payable) */
  supplierCustomerId?: string & MaxLen<64>;
  /** refuse the post without a supplier picked */
  requireSupplier?: boolean;
  /** as read from the document (yyyy-mm-dd; a decimal string), kept on its Accounts Payable record */
  issueDate?: string & MaxLen<20>;
  dueDate?: string & MaxLen<20>;
  totalGross?: string & MaxLen<20>;
}

interface SplitCostResponse {
  lines: CostSplitResultLine[];
  /** the supplier invoice on Accounts Payable the parts are booked on; null for a dry run */
  supplierInvoiceId: string | null;
}

/**
 * Splits one vendor invoice over shipments by weight - a master job's invoice by each
 * shipment's freight tons - so the parts add up to the total to the cent, and posts each part
 * as the real cost of the shipment's line of the charge code. With `dryRun` it only answers the
 * split and the real cost each shipment already has, for the review before posting.
 */
export const invoicingSplitCost = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/cost-split" },
  async (req: SplitCostRequest): Promise<SplitCostResponse> => {
    const lines = await invoicingService.splitCost(getAuthData()!.companyID, req, getAuthData()!.userID);
    const supplierInvoiceId = req.dryRun ? null : await invoicingService.bookedSplit(getAuthData()!.companyID, req);
    return { lines, supplierInvoiceId };
  },
);

/**
 * Posts an invoice read line by line as buying rows: each line on the shipment its B/L names, any other
 * shared out over the master job's shipments. A shipment's real cost of a charge goes onto its estimate
 * of that charge while it has no real cost or invoice yet, else onto a new row; a credit note is always
 * a new minus row. With dryRun, makes the same checks and only answers what it comes to.
 */
export const invoicingPostInvoiceLines = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/invoice-lines" },
  async (req: InvoiceLinesInput): Promise<{ rows: InvoiceLinesRow[]; supplierInvoiceId: string | null }> =>
    invoicingService.postInvoiceLines(getAuthData()!.companyID, req, getAuthData()!.userID),
);
