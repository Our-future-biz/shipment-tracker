import { api } from "encore.dev/api";
import { requireRole } from "../../../lib/rbac";
import { mainSearchInput } from "../../../lib/mainSearch";
import { invoiceDocumentService } from "../services/invoiceDocument.service";
import type { SearchInvoicesRequest, SearchInvoicesResponse } from "../interfaces/interfaces";

/**
 * The main search (the top bar) in Invoicing: the company's issued invoices and credit notes whose
 * number, customer (name, IČO) or job number - as printed on them - hold every word typed, newest
 * issue date first, and how many match in all. Every signed-in role, as for the invoice list and
 * the Invoicing queue. Fewer than 2 characters give nothing.
 */
export const searchInvoices = api(
  { expose: true, auth: true, method: "GET", path: "/search/invoices" },
  async (req: SearchInvoicesRequest): Promise<SearchInvoicesResponse> => {
    const actor = requireRole();
    const input = mainSearchInput(req.q, req.limit);
    if (!input) return { items: [], total: 0 };
    return invoiceDocumentService.searchMain(actor.companyID, input.q, input.limit);
  },
);
