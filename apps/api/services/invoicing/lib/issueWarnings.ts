import { outsideEuVat } from "./invoiceCalc";

// What the clerk should know about the customer before issuing (user council B6, 20 Nov 2026). Warnings
// only, never a block, as the bank-account one: a customer who is no VAT payer has no DIČ, a Prospect may
// be billed for a first job. The job's own Credit Check is left out: every new job starts Red until someone sets
// it, so it would show on almost every invoice; overdue invoices and the credit limit come from the customer's
// credit warning instead.

export interface IssueCustomerFacts {
  dic: string;
  country: string;
  /** The Customer Database status: Active, Prospect or Inactive. */
  status: string;
}

/**
 * The customer's warnings: no DIČ (only for a customer in the EU or of a country not known - outside the
 * EU there is none to have), and still a Prospect.
 */
export function customerIssueWarnings(customer: IssueCustomerFacts | null): string[] {
  const warnings: string[] = [];
  if (customer) {
    if (!customer.dic.trim() && !outsideEuVat(customer.country)) warnings.push("The customer has no DIČ in the Customer Database");
    if (customer.status === "Prospect") warnings.push("The customer is still a Prospect");
  }
  return warnings;
}

/**
 * The hint when the job has no Customer Reference (mock council R2, B17 kept as built): the invoice prints "Your ref."
 * from the Customer Reference only - the Personal Reference stays internal - so a PO typed there would be lost from
 * the invoice without a word. Never a block; null when there is a reference.
 */
export function customerReferenceHint(customerReference: string | null | undefined): string | null {
  if ((customerReference ?? "").trim()) return null;
  return "The job has no Customer Reference: the invoice prints no \"Your ref.\" (the Personal Reference stays internal). If the customer gave an order number, type it in the job's Customer Reference first";
}

/** A line of the invoice as the duty warning reads it: its charge code and its printed text. */
export interface DutyLineFacts {
  category: string;
  description: string;
}

// A duty or import VAT line: the duty-advancement charge, or a text naming the duty ("duty", "duties", Czech "clo",
// "cla") or the import VAT ("import VAT", "DPH z dovozu"). Not a bare "VAT" or "DPH": every invoice line's VAT is
// named so, and a freight line "incl. VAT" is no duty (system-21 mock council review).
const DUTY_TEXT = /\b(duty|duties|clo|cla|import\s+vat|dph\s+z\s+dovozu)\b/i;
const isDutyLine = (l: DutyLineFacts) => l.category === "duty_advancement" || DUTY_TEXT.test(l.description);

/**
 * The warning when the job's approved Import Instructions say we pay the duty and VAT and invoice them to the
 * customer, and the invoice has no duty or VAT line (mock council R3: the Customs tab shows it, Billing has to see
 * it too). Never a block - the duty may be billed on an invoice of its own; null otherwise.
 */
export function dutyVatWarning(dutyPaidBy: string, lines: readonly DutyLineFacts[]): string | null {
  if (dutyPaidBy !== "us" || lines.some(isDutyLine)) return null;
  return "The Import Instructions say we pay the duty and VAT and invoice them to the customer, but this invoice has no duty or VAT line";
}
