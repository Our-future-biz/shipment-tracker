// Phase 6 B: haulier invoices (the haulier's bill for trips and partner deliveries), matched
// exactly against what we expect to pay, and the VAT bank-account check (ručení za DPH).

export type HaulierInvoiceStatus = "DRAFT" | "MATCHED" | "NEEDS_APPROVAL" | "APPROVED" | "BLOCKED" | "REJECTED";
export type HaulierInvoiceTargetKind = "TRIP" | "PARTNER_LEG";

export interface HaulierInvoiceLine {
  id: string;
  /** ref: the trip ref (LCZ…) or "TCZ… partner delivery" */
  target: { kind: HaulierInvoiceTargetKind; id: string; ref: string };
  /** The target's cost less what is claimed against the haulier */
  expected: number;
  claimed: number;
  invoiced: number;
  /** invoiced − expected */
  difference: number;
  currency: "CZK" | "EUR";
  note: string;
}

export interface HaulierInvoice {
  id: string;
  haulierCustomerId: string;
  haulierName: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string | null;
  /** Datum uskutečnění zdanitelného plnění */
  duzp: string | null;
  currency: "CZK" | "EUR";
  totalNet: number;
  vatAmount: number;
  totalGross: number;
  /** As on the invoice, normalised "123456789/0800" (a CZ IBAN is shown so too) or an IBAN */
  bankAccount: string;
  /** Against the haulier profile (manual list for now) */
  bankAccountCheck: { published: boolean | null; checkedAt: string | null; note: string };
  lines: HaulierInvoiceLine[];
  /** totalNet − Σ expected */
  difference: number;
  status: HaulierInvoiceStatus;
  /** Why payment may not be approved (BLOCKED); nobody can override these */
  blockReasons: string[];
  /** Why an exact match was not approved automatically (NEEDS_APPROVAL): a recent bank-account change, the same user, a repriced trip; a manager decides */
  holdReasons: string[];
  approval: { byName: string; at: string; reason: string } | null;
  /** When it was paid (YYYY-MM-DD), who noted it and when; null while unpaid. Only an approved invoice is paid. */
  payment: { paidOn: string; byName: string; at: string } | null;
  /**
   * False for an approved invoice not paid here that was approved before payments were noted in this system
   * (Council Review 5, K2): it may have been paid already, so What we owe lists it apart instead of counting it.
   */
  paymentTracked: boolean;
  fileName: string | null;
  createdAt: string;
  createdBy: string;
  version: number;
}

/**
 * An approved invoice not noted as paid, as the Customer Database's What we owe reads it (Council Review 5, C-1):
 * no lines, only what is owed and when.
 */
export interface UnpaidHaulierInvoice {
  id: string;
  invoiceNumber: string;
  /** YYYY-MM-DD */
  issueDate: string;
  dueDate: string | null;
  /** With VAT */
  totalGross: number;
  currency: "CZK" | "EUR";
  /** False when it was approved before payments were noted here: it may have been paid already (K2) */
  paymentTracked: boolean;
}

/** A line as entered: the trip or partner delivery and what the haulier invoiced for it. */
export interface HaulierInvoiceLineInput {
  targetKind: HaulierInvoiceTargetKind;
  targetId: string;
  invoiced: number;
  note: string;
}

export interface HaulierInvoiceInput {
  haulierCustomerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string | null;
  duzp: string | null;
  currency: "CZK" | "EUR";
  totalNet: number;
  vatAmount: number;
  totalGross: number;
  bankAccount: string;
  /** Optional copy of the invoice (PDF or photo, 10 MB) */
  fileName?: string;
  fileBase64?: string;
  lines: HaulierInvoiceLineInput[];
}

/** A trip or partner delivery of a haulier that may be invoiced. */
export interface HaulierInvoiceCandidate {
  kind: HaulierInvoiceTargetKind;
  id: string;
  ref: string;
  /** YYYY-MM-DD: the trip's planned pick-up / the delivery day */
  date: string;
  expected: number;
  claimed: number;
  currency: "CZK" | "EUR";
  /** Already on another invoice that is not rejected (and not approved yet) */
  alreadyInvoiced: boolean;
}
