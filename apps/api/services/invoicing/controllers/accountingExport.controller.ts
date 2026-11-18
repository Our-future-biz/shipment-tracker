import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { accountingExportService } from "../services/accountingExport.service";
import type { AccountingExportsResponse, PohodaExportResponse } from "../interfaces/accountingExport";

// Accounts Receivable step 7: the issued invoices and credit notes of a period as a Pohoda XML import file
// (services/accountingExport). Managers export, and each export is recorded; everyone sees the list of exports.

interface PohodaExportRequest {
  /** The first and the last issue day (yyyy-mm-dd), both in */
  from: string & MaxLen<20>;
  to: string & MaxLen<20>;
  /** Also the documents exported before (Pohoda refuses a number it already has) */
  includeExported?: boolean;
  /** One per export the manager starts: the same key again answers that export (the same file and documents), recording nothing more */
  idempotencyKey?: string & MaxLen<200>;
}

/**
 * The file (Windows-1250 XML, base64), what was left out and why; records the export and its documents. A POST: it
 * records something, so a re-fetch never makes a second export; the same idempotency key answers the first one again.
 */
export const receivablePohodaExport = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/export/pohoda" },
  async (req: PohodaExportRequest): Promise<PohodaExportResponse> => accountingExportService.exportPohoda(requireRole(), req),
);

export const receivableAccountingExports = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/exports" },
  async (): Promise<AccountingExportsResponse> => accountingExportService.list(requireRole()),
);
