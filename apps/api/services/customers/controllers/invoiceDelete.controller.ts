import { api } from "encore.dev/api";
import { invoiceService } from "../services/invoice.service";

interface InvoiceDeleteRequest {
  id: string;
}

interface InvoiceDeleteResponse {
  ok: boolean;
}

export const invoiceDelete = api(
  { expose: true, auth: false, method: "DELETE", path: "/customer-invoices/:id" },
  async (req: InvoiceDeleteRequest): Promise<InvoiceDeleteResponse> => {
    await invoiceService.softDelete(req.id);
    return { ok: true };
  },
);
