import { api } from "encore.dev/api";
import { invoiceService } from "../services/invoice.service";
import type { InvoiceItem } from "../interfaces/interfaces";

interface InvoiceListRequest {
  customerId: string;
}

interface InvoiceListResponse {
  data: InvoiceItem[];
}

export const invoiceList = api(
  { expose: true, auth: false, method: "GET", path: "/customers/:customerId/invoices" },
  async (req: InvoiceListRequest): Promise<InvoiceListResponse> => {
    const data = await invoiceService.listByCustomer(req.customerId);
    return { data: data as unknown as InvoiceItem[] };
  },
);
