import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { haulierInvoiceService } from "../services/haulierInvoice.service";
import type { UnpaidHaulierInvoice } from "../interfaces/haulierInvoice.interfaces";

interface UnpaidHaulierInvoicesRequest {
  customerId: string;
}

interface UnpaidHaulierInvoicesResponse {
  /** The soonest due first */
  invoices: UnpaidHaulierInvoice[];
  /** More than can be handed at once (10,000): the latest due are left out */
  truncated: boolean;
}

/**
 * Internal API of the invoicing service's What we owe (Council Review 5, C-1): a haulier's approved invoices not
 * yet paid, so the Customer Database counts them on the server, all of them, not the newest the list shows.
 */
export const _internalHaulierInvoicesUnpaid = api(
  { expose: false, auth: true, method: "GET", path: "/internal/trucking/hauliers/:customerId/unpaid-invoices" },
  async ({ customerId }: UnpaidHaulierInvoicesRequest): Promise<UnpaidHaulierInvoicesResponse> => {
    return haulierInvoiceService.unpaidOf(getAuthData()!.companyID, customerId);
  },
);
