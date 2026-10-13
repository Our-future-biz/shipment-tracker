import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { invoiceDocumentService } from "../services/invoiceDocument.service";
import type { InvoiceDocItem, InvoicePreviewItem } from "../interfaces/interfaces";

/**
 * Tax documents of a shipment: preview (nothing stored), issue, list, detail and credit
 * note. Every role may issue and credit (owner's decision, 2026-10-13).
 */

interface PreviewRequest {
  shipmentId: string;
  /** Defaults to the customer linked to the shipment */
  customerId?: string;
  /** YYYY-MM-DD; defaults to ETA (import) / ETD (export) / today */
  duzp?: string;
}

interface PreviewResponse {
  preview: InvoicePreviewItem;
}

export const invoiceDocPreview = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/invoices/preview" },
  async (req: PreviewRequest): Promise<PreviewResponse> => {
    const actor = requireRole();
    const { shipmentId, ...params } = req;
    return { preview: await invoiceDocumentService.preview(shipmentId, actor.companyID, params) };
  },
);

interface IssueRequest {
  shipmentId: string;
  customerId?: string;
  duzp?: string;
  note?: string;
  /** Sent again on retry / double click: returns the invoice already issued instead of a second one */
  idempotencyKey?: string;
}

interface InvoiceDocResponse {
  invoice: InvoiceDocItem;
}

export const invoiceDocIssue = api(
  { expose: true, auth: true, method: "POST", path: "/invoicing/:shipmentId/invoices" },
  async (req: IssueRequest): Promise<InvoiceDocResponse> => {
    const actor = requireRole();
    const { shipmentId, ...params } = req;
    return { invoice: await invoiceDocumentService.issue(shipmentId, actor.companyID, actor.userID, params) };
  },
);

interface ListRequest {
  shipmentId: string;
}

interface ListResponse {
  invoices: InvoiceDocItem[];
}

export const invoiceDocList = api(
  { expose: true, auth: true, method: "GET", path: "/invoicing/:shipmentId/invoices" },
  async (req: ListRequest): Promise<ListResponse> => {
    const actor = requireRole();
    return { invoices: await invoiceDocumentService.list(req.shipmentId, actor.companyID) };
  },
);

interface GetRequest {
  invoiceId: string;
}

export const invoiceDocGet = api(
  { expose: true, auth: true, method: "GET", path: "/invoices/:invoiceId" },
  async (req: GetRequest): Promise<InvoiceDocResponse> => {
    const actor = requireRole();
    return { invoice: await invoiceDocumentService.get(req.invoiceId, actor.companyID) };
  },
);

interface CreditRequest {
  invoiceId: string;
  reason: string;
  idempotencyKey?: string;
}

export const invoiceDocCredit = api(
  { expose: true, auth: true, method: "POST", path: "/invoices/:invoiceId/credit-note" },
  async (req: CreditRequest): Promise<InvoiceDocResponse> => {
    const actor = requireRole();
    return { invoice: await invoiceDocumentService.credit(req.invoiceId, actor.companyID, actor.userID, req.reason, req.idempotencyKey) };
  },
);
