import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";

interface InvoiceDeleteRequest {
  id: string;
}

interface InvoiceDeleteResponse {
  ok: boolean;
}

// Refused for an invoice Invoicing posted, to everyone; a typed one only by a manager (Council Outlay 10 D9).
export const invoiceDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-invoices/:id" },
  async (req: InvoiceDeleteRequest): Promise<InvoiceDeleteResponse> => {
    await invoiceService.softDelete(req.id, getAuthData()!);
    return { ok: true };
  },
);
