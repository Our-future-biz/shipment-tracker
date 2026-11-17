import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { haulierInvoiceService } from "../services/haulierInvoice.service";
import type { HaulierInvoiceFact } from "../interfaces/haulierInvoice.interfaces";

interface HaulierInvoiceListRequest {
  /** DRAFT, MATCHED, NEEDS_APPROVAL, APPROVED, BLOCKED, REJECTED as Trucking shows them; none = every invoice */
  statuses?: string[] & MaxLen<10>;
  /** 1 to 1000, 1000 when not given */
  limit?: number;
  /** How many to skip, 0 when not given */
  offset?: number;
}

interface HaulierInvoiceListResponse {
  /** Newest issued first, then by id */
  invoices: HaulierInvoiceFact[];
  /** How many match in all */
  total: number;
  /** More match than were handed */
  truncated: boolean;
}

/**
 * Internal API of the invoicing service's Accounts Payable: the company's haulier invoices, read only (every
 * action stays in Trucking), each with the status Trucking shows, an open one's worked out now.
 */
export const _internalHaulierInvoiceList = api(
  { expose: false, auth: true, method: "POST", path: "/internal/trucking/haulier-invoices" },
  async (req: HaulierInvoiceListRequest): Promise<HaulierInvoiceListResponse> => {
    return haulierInvoiceService.factsOf(getAuthData()!.companyID, req);
  },
);
