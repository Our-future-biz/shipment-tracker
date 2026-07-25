import { api, APIError } from "encore.dev/api";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem } from "../interfaces/interfaces";

interface InvoiceCreateRequest {
  customerId: string;
  invoiceNumber: string;
  amount?: number;
  dueDate?: string;
  status?: string;
  issuedAt?: string;
}

interface InvoiceCreateResponse {
  invoice: InvoiceItem;
}

export const invoiceCreate = api(
  { expose: true, auth: false, method: "POST", path: "/customers/:customerId/invoices" },
  async (req: InvoiceCreateRequest): Promise<InvoiceCreateResponse> => {
    if (!req.invoiceNumber) {
      throw APIError.invalidArgument("invoiceNumber is required");
    }
    const { customerId, ...input } = req;
    const invoice = await invoiceService.create(customerId, input);
    return { invoice: invoice as unknown as InvoiceItem };
  },
);
