import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { supplierInvoiceService } from "../services/supplierInvoice.service";

interface PaidSupplierInvoicesRequest {
  shipmentId: string & MaxLen<64>;
}

interface PaidSupplierInvoicesResponse {
  /** The numbers of the supplier invoices marked paid that bill a line of the job */
  invoiceNumbers: string[];
}

// Internal API of the shipments service: a job whose costs are on a supplier invoice marked paid can't be
// deleted, as a paid invoice's lines stay as paid (Finance → Accounts Payable). Company from the caller's auth.
export const _internalPaidSupplierInvoices = api(
  { expose: false, auth: true, method: "GET", path: "/internal/invoicing/paid-supplier-invoices/:shipmentId" },
  async ({ shipmentId }: PaidSupplierInvoicesRequest): Promise<PaidSupplierInvoicesResponse> => ({
    invoiceNumbers: await supplierInvoiceService.paidInvoicesOfShipment(getAuthData()!.companyID, shipmentId),
  }),
);
