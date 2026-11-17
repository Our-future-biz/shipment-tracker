import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { assertSupplierCompany } from "../services/invoicing.service";
import { supplierInvoiceService } from "../services/supplierInvoice.service";
import type { PayableDetailResponse, PayablesForMeResponse, PayablesResponse } from "../interfaces/interfaces";

// Finance → Accounts Payable (Council Outlay 9): the invoices suppliers sent, one row each. Everyone reads them;
// managers approve, refuse and note them paid (services/supplierInvoice).

/** The page: every supplier invoice, the estimates still waiting for one, Trucking's for superadmins. */
export const supplierInvoiceList = api(
  { expose: true, auth: true, method: "GET", path: "/supplier-invoices" },
  async (): Promise<PayablesResponse> => supplierInvoiceService.payables(getAuthData()!),
);

/** The bell: how many wait for a manager's approval, and invoices booked on the user's jobs. */
export const supplierInvoiceForMe = api(
  { expose: true, auth: true, method: "GET", path: "/supplier-invoices/for-me" },
  async (): Promise<PayablesForMeResponse> => supplierInvoiceService.forMe(getAuthData()!),
);

export const supplierInvoiceSeen = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/seen" },
  async ({ ids }: { ids: string[] & MaxLen<200> }): Promise<void> => {
    await supplierInvoiceService.seen(getAuthData()!, ids);
  },
);

export const supplierInvoiceGet = api(
  { expose: true, auth: true, method: "GET", path: "/supplier-invoices/:id" },
  async ({ id }: { id: string }): Promise<PayableDetailResponse> => supplierInvoiceService.detail(getAuthData()!, id),
);

interface VersionRequest {
  id: string;
  /** The version the user saw: a change since is refused, to be looked at again */
  version: number;
}

interface ReasonRequest extends VersionRequest {
  reason: string & MaxLen<1000>;
}

export const supplierInvoiceApprove = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/approve" },
  async ({ id, version }: VersionRequest): Promise<PayableDetailResponse> => supplierInvoiceService.approve(getAuthData()!, id, version),
);

/** Refuses it with a reason: its lines leave the jobs (an estimate goes back to it), and the number is free again. */
export const supplierInvoiceRefuse = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/refuse" },
  async ({ id, version, reason }: ReasonRequest): Promise<PayableDetailResponse> => supplierInvoiceService.refuse(getAuthData()!, id, version, reason),
);

export const supplierInvoiceTakeBackApproval = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/take-back-approval" },
  async ({ id, version, reason }: ReasonRequest): Promise<PayableDetailResponse> => supplierInvoiceService.takeBackApproval(getAuthData()!, id, version, reason),
);

interface PaidRequest extends VersionRequest {
  /** The day it was paid (yyyy-mm-dd) */
  paidOn: string & MaxLen<20>;
}

export const supplierInvoicePaid = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/paid" },
  async ({ id, version, paidOn }: PaidRequest): Promise<PayableDetailResponse> => supplierInvoiceService.markPaid(getAuthData()!, id, version, paidOn),
);

export const supplierInvoiceTakeBackPayment = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/take-back-payment" },
  async ({ id, version, reason }: ReasonRequest): Promise<PayableDetailResponse> => supplierInvoiceService.takeBackPayment(getAuthData()!, id, version, reason),
);

interface LinkSupplierRequest extends VersionRequest {
  supplierCustomerId: string & MaxLen<64>;
}

/** Links an invoice booked under a typed name to its supplier in the Customer Database. */
export const supplierInvoiceLinkSupplier = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/link-supplier" },
  async ({ id, version, supplierCustomerId }: LinkSupplierRequest): Promise<PayableDetailResponse> =>
    supplierInvoiceService.linkSupplier(getAuthData()!, id, version, supplierCustomerId, (supplierId) => assertSupplierCompany(supplierId, null)),
);

interface DetailsRequest extends VersionRequest {
  /** yyyy-mm-dd; "" clears */
  issueDate?: string & MaxLen<20>;
  dueDate?: string & MaxLen<20>;
  /** decimal strings; "" clears */
  totalNet?: string & MaxLen<20>;
  vatAmount?: string & MaxLen<20>;
  totalGross?: string & MaxLen<20>;
  currency?: string & MaxLen<10>;
  kind?: "invoice" | "credit_note";
}

export const supplierInvoiceDetails = api(
  { expose: true, auth: true, method: "PATCH", path: "/supplier-invoices/:id" },
  async ({ id, version, ...input }: DetailsRequest): Promise<PayableDetailResponse> => supplierInvoiceService.setDetails(getAuthData()!, id, version, input),
);

interface DocumentRequest {
  id: string;
  /** The shipment the read document is kept on, and its attachment there */
  shipmentId: string & MaxLen<64>;
  attachmentId: string & MaxLen<64>;
  name: string & MaxLen<300>;
}

/** Keeps the read document with the invoice (D18). */
export const supplierInvoiceDocument = api(
  { expose: true, auth: true, method: "POST", path: "/supplier-invoices/:id/document" },
  async ({ id, ...doc }: DocumentRequest): Promise<void> => {
    await supplierInvoiceService.attachDocument(getAuthData()!, id, doc);
  },
);
