import { api } from "encore.dev/api";
import { getAuthData } from "~encore/auth";
import { invoiceService } from "../services/invoice.service";

interface InvoiceDeleteRequest {
  id: string;
}

interface InvoiceDeleteResponse {
  ok: boolean;
}

export const invoiceDelete = api(
  { expose: true, auth: true, method: "DELETE", path: "/customer-invoices/:id" },
  async (req: InvoiceDeleteRequest): Promise<InvoiceDeleteResponse> => {
    await invoiceService.softDelete(req.id, getAuthData()!.companyID);
    return { ok: true };
  },
);
