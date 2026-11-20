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
