// Finance → Accounts Receivable → Bank statements (step 7): what the endpoints answer. A statement's file is never
// kept, only what was read from it (fileKept is always false: the screen says so).

export type BankEntryStatusWord = "proposed" | "no_match" | "confirmed" | "ignored" | "not_incoming";

export interface BankStatementCounts {
  /** Money in still to be decided (proposed + no match) */
  toDecide: number;
  proposed: number;
  noMatch: number;
  confirmed: number;
  ignored: number;
  notIncoming: number;
  /** Entries of this file that were read before from another file (shown under this one, decided there) */
  seenBefore: number;
}

export interface BankStatementSummary {
  id: string;
  fileName: string;
  /** e.g. camt.053 */
  format: string;
  /** The statement's own id (Stmt/Id; several joined when the file holds more than one) */
  statementRef: string;
  accountIban: string;
  currency: string;
  fromDate: string | null;
  toDate: string | null;
  /** Booked entries in the file */
  entries: number;
  importedBy: string;
  importedAt: string;
  counts: BankStatementCounts;
}

/** An invoice the entry may pay, as it is now (re-worked whenever the statement is opened). */
export interface BankEntryCandidateItem {
  invoiceId: string;
  number: string;
  customer: string;
  jobNumber: string;
  leftToPay: number;
  currency: string;
  dueDate: string;
  reasons: string[];
  score: number;
  /** The receivable's version: sent back as receivableVersion on confirm */
  version: number;
}

export interface BankEntryAllocationItem {
  invoiceId: string;
  number: string;
  amount: number;
  paymentId: string;
  /** The payment was taken back on the invoice since: it no longer counts, and the entry may be confirmed again for it */
  takenBack: boolean;
}

export interface BankStatementEntryItem {
  id: string;
  /** The bank's reference of the entry (with the account): the bank reference on the payments noted from it */
  entryKey: string;
  bookingDate: string | null;
  valueDate: string | null;
  amount: number;
  currency: string;
  credit: boolean;
  variableSymbol: string;
  constantSymbol: string;
  specificSymbol: string;
  endToEndId: string;
  counterpartyName: string;
  counterpartyAccount: string;
  message: string;
  status: BankEntryStatusWord;
  /** For an open entry: worked out now; for a decided one: as they were when it was read */
  candidates: BankEntryCandidateItem[];
  allocations: BankEntryAllocationItem[];
  /**
   * Confirmed: the amount not put on any invoice (an overpayment, money for something else). Reopened: what is free to
   * confirm again (the entry's amount less its payments not taken back).
   */
  unallocated: number;
  /**
   * Confirmed before, and a payment it noted was taken back since: shown as to decide again (status proposed or
   * no_match, candidates worked out for what is free) - a manager confirms it again or sets the rest aside.
   */
  reopened: boolean;
  decidedAt: string | null;
  decidedBy: string;
  decisionReason: string;
  version: number;
  /** Read first from another file (and decided there, if it was): that statement */
  firstReadIn: { statementId: string; fileName: string } | null;
}

export interface BankStatementDetailResponse {
  statement: BankStatementSummary;
  entries: BankStatementEntryItem[];
  /** A manager: may confirm and set aside */
  canAct: boolean;
  /** The file itself is not kept, only what was read from it */
  fileKept: boolean;
  /** More invoices are owed than the matching looked at (2000): an invoice may be missing from the candidates */
  candidatesCapped: boolean;
  today: string;
}

export interface BankStatementListResponse {
  statements: BankStatementSummary[];
  canAct: boolean;
}
