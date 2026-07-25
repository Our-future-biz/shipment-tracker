import { api, APIError } from "encore.dev/api";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem } from "../interfaces/interfaces";

interface InvoiceUpdateRequest {
  id: string;
  invoiceNumber?: string;
  amount?: number;
  dueDate?: string;
  status?: string;
  issuedAt?: string;
}

interface InvoiceUpdateResponse {
  invoice: InvoiceItem;
}

export const invoiceUpdate = api(
  { expose: true, auth: false, method: "PATCH", path: "/customer-invoices/:id" },
  async (req: InvoiceUpdateRequest): Promise<InvoiceUpdateResponse> => {
    const { id, ...input } = req;
    const invoice = await invoiceService.update(id, input);
    if (!invoice) {
      throw APIError.notFound("Invoice not found");
    }
    return { invoice: invoice as unknown as InvoiceItem };
  },
);
