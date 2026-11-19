import { api } from "encore.dev/api";
import type { MaxLen } from "encore.dev/validate";
import { requireRole } from "../../../lib/rbac";
import { bankStatementService } from "../services/bankStatement.service";
import type { BankStatementDetailResponse, BankStatementListResponse } from "../interfaces/bankStatement";

// Finance → Accounts Receivable → Bank statements (step 7): a manager reads a CAMT.053 file; each incoming entry waits
// with the invoices it may pay until a manager confirms it as payments or sets it aside (services/bankStatement).
// Managers only, reading too (mock test council X6): a statement shows every line of the account.

interface ImportRequest {
  fileName: string & MaxLen<300>;
  /** The file, base64 (a data URL is taken too); at most 10 MB */
  contentBase64: string;
}

export const bankStatementImport = api(
  // 10 MB of file is ~13.4 MB as base64: above Encore's 2 MiB default.
  { expose: true, auth: true, method: "POST", path: "/receivables/bank-statements", bodyLimit: 16 * 1024 * 1024 },
  async (input: ImportRequest): Promise<BankStatementDetailResponse> => bankStatementService.importFile(requireRole(), input),
);

export const bankStatementList = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/bank-statements" },
  async (): Promise<BankStatementListResponse> => bankStatementService.list(requireRole()),
);

export const bankStatementGet = api(
  { expose: true, auth: true, method: "GET", path: "/receivables/bank-statements/:id" },
  async ({ id }: { id: string }): Promise<BankStatementDetailResponse> => bankStatementService.detail(requireRole(), id),
);

interface ConfirmRequest {
  id: string;
  entryId: string;
  /** The entry's version the manager saw */
  version: number;
  /** The invoices it pays: amounts in the entry's currency, together at most the entry */
  items: { invoiceId: string & MaxLen<64>; receivableVersion: number; amount: number }[] & MaxLen<100>;
}

export const bankStatementConfirm = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/bank-statements/:id/entries/:entryId/confirm" },
  async ({ id, entryId, version, items }: ConfirmRequest): Promise<BankStatementDetailResponse> =>
    bankStatementService.confirm(requireRole(), id, entryId, { version, items }),
);

interface IgnoreRequest {
  id: string;
  entryId: string;
  version: number;
  reason: string & MaxLen<1000>;
}

export const bankStatementIgnore = api(
  { expose: true, auth: true, method: "POST", path: "/receivables/bank-statements/:id/entries/:entryId/ignore" },
  async ({ id, entryId, version, reason }: IgnoreRequest): Promise<BankStatementDetailResponse> =>
    bankStatementService.ignore(requireRole(), id, entryId, { version, reason }),
);
