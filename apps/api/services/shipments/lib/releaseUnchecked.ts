// A release let through while part of the prepayment stop could not be asked (mock test council
// P10): Invoicing found work not yet invoiced but could not read the customer's terms in the Customer
// Database (its release check's prepaymentUninvoicedUnchecked). The stop before any invoice is then
// left out and the release goes through - and the job's history says so, in the release's write.

/** The history entry's field. */
export const PREPAYMENT_UNCHECKED_FIELD = "prepaymentUnchecked";

/** The history entry's text. */
export const PREPAYMENT_UNCHECKED_LINE = "Prepayment not checked: the Customer Database could not be read";
