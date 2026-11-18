// Accounts Receivable step 7 (18 Nov 2026): issued invoices and credit notes handed to the accounting system, Pohoda
// (Stormware), as its XML import file. One way only: payments come into the app from the bank statement, never back
// from Pohoda (D26: one source of Paid). Managers export; everyone sees the list of exports.

/** A document of the period that is not in the file, and why. */
export interface PohodaExportSkipped {
  number: string;
  kind: "invoice" | "credit_note";
  issueDate: string;
  reason: string;
}

/** A document in the file the accountant should look at after the import (it goes as issued). */
export interface PohodaExportNote {
  number: string;
  note: string;
}

export interface PohodaExportResponse {
  /** The export's record (accounting_export) */
  exportId: string;
  fileName: string;
  /** The file's bytes, Windows-1250 encoded XML, as base64 */
  contentBase64: string;
  contentType: string;
  encoding: "windows-1250";
  /** The SHA-256 of the file's bytes, as recorded */
  fileSha256: string;
  /** The issue days covered (yyyy-mm-dd) */
  from: string;
  to: string;
  /** How many documents are in the file, and their numbers in the file's order */
  documents: number;
  invoices: number;
  creditNotes: number;
  numbers: string[];
  /** Documents of the period left out: cancelled ones, ones exported before (unless included again), ones whose own figures do not add up */
  skipped: PohodaExportSkipped[];
  /** Per document, what to check in Pohoda after the import */
  notes: PohodaExportNote[];
  /** About the whole file (credit notes whose invoice Pohoda may not have, documents sent again) */
  warnings: string[];
}

export interface AccountingExportSummary {
  id: string;
  system: "pohoda";
  from: string;
  to: string;
  documents: number;
  fileName: string;
  fileSha256: string;
  createdBy: string;
  createdAt: string;
}

export interface AccountingExportsResponse {
  /** The newest first (at most 200) */
  exports: AccountingExportSummary[];
  /** A manager: may export */
  canExport: boolean;
}
