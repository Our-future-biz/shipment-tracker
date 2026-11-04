// "What we owe" a supplier (Council Outlay 7, step 6b; Council Review 5): the server's view of its cost lines
// in the shipments' Costs Breakdown and, for a haulier, of its approved Trucking invoices not yet paid (totals
// over every open line and invoice, lib/supplierCosts in invoicing), put together for the card:
//  - owed = received and not paid: a cost line's real cost (as typed, without VAT), an approved haulier
//    invoice's total (with VAT, K4); due = a line's received day + the payment days, an invoice's own due day
//  - expected = a line not received yet: shown apart, never in the owed total
//  - before payment tracking = received or approved before payments were noted here: it may have been paid
//    already, so it is listed apart and not counted (K2)
// Totals are per currency, and the shipment costs' (without VAT) and the haulier invoices' (with VAT) are
// shown apart, never added (C-9): nothing is converted. Pure, so it is unit-tested.

export interface OwedCostLine {
  id: string;
  shipmentId: string;
  jobNumber: string;
  description: string;
  category: string;
  invoiceNumber: string;
  kind: "owed" | "expected" | "untracked";
  receivedAt: string | null;
  dueOn: string;
  overdueDays: number;
  amount: number | null;
  currency: string;
}

export interface OwedCostTotal {
  currency: string;
  owed: number;
  overdue: number;
  expected: number;
  untracked: number;
}

export interface OwedHaulierInvoiceLine {
  id: string;
  invoiceNumber: string;
  kind: "owed" | "untracked";
  issueDate: string;
  dueOn: string;
  overdueDays: number;
  amount: number;
  currency: string;
}

export interface OwedHaulierInvoiceTotal {
  currency: string;
  owed: number;
  overdue: number;
  untracked: number;
}

/** Whether a haulier's Trucking invoices are in it; "hidden" for someone who does not see the Trucking Concept. */
export type OwedHaulierInvoicesStatus = "included" | "hidden" | "unavailable" | "none";

export interface OwedCosts {
  owed: readonly OwedCostLine[];
  expected: readonly OwedCostLine[];
  untracked: readonly OwedCostLine[];
  totals: readonly OwedCostTotal[];
  counts: { owed: number; expected: number; untracked: number; withoutAmount: number; dueUnknown: number };
  haulierInvoices: {
    status: OwedHaulierInvoicesStatus;
    owed: readonly OwedHaulierInvoiceLine[];
    untracked: readonly OwedHaulierInvoiceLine[];
    totals: readonly OwedHaulierInvoiceTotal[];
    counts: { owed: number; untracked: number; dueUnknown: number };
    truncated: boolean;
  };
}

export interface OwedItem {
  key: string;
  /** a shipment's cost line, or a Trucking haulier invoice */
  source: "cost" | "haulier-invoice";
  href: string;
  /** the job number, or "Haulier invoice" */
  ref: string;
  /** the charge, as a code; "" for a haulier invoice */
  category: string;
  description: string;
  invoiceNumber: string;
  /** a cost: the moment its invoice was received (ISO); an invoice: its issue day; "" when not known */
  receivedAt: string;
  /** "" when not known */
  dueOn: string;
  overdueDays: number;
  amount: number | null;
  currency: string;
  /** cost lines are as typed in Costs Breakdown (without VAT), a haulier invoice's total is with VAT */
  vat: "without" | "with";
}

export interface OwedFigures {
  owed: number;
  overdue: number;
  untracked: number;
}

/** One currency: the shipment costs' figures (without VAT) and the haulier invoices' (with VAT), each null when none. */
export interface OwedTotal {
  currency: string;
  costs: (OwedFigures & { expected: number }) | null;
  invoices: OwedFigures | null;
}

export interface SupplierOwed {
  owed: OwedItem[];
  expected: OwedItem[];
  untracked: OwedItem[];
  totals: OwedTotal[];
  /** how many there are of each (the lists may show fewer) */
  counts: { owed: number; expected: number; untracked: number };
  /** owed cost lines with no real cost typed: not in the totals */
  withoutAmount: number;
  /** owed cost lines whose due day is not known (no payment days) */
  costsDueUnknown: number;
  /** approved haulier invoices with no due day */
  invoicesDueUnknown: number;
  haulierInvoices: OwedHaulierInvoicesStatus;
  /** more unpaid haulier invoices than Trucking hands at once: the latest due are not in the totals */
  invoicesTruncated: boolean;
}

const costItem = (l: OwedCostLine): OwedItem => ({
  key: `cost:${l.id}`,
  source: "cost",
  href: `/shipments/${l.shipmentId}?tab=costs`,
  ref: l.jobNumber,
  category: l.category,
  description: l.description,
  invoiceNumber: l.invoiceNumber,
  receivedAt: l.receivedAt ?? "",
  dueOn: l.dueOn,
  overdueDays: l.overdueDays,
  amount: l.amount,
  currency: l.currency,
  vat: "without",
});

const invoiceItem = (i: OwedHaulierInvoiceLine): OwedItem => ({
  key: `haulier-invoice:${i.id}`,
  source: "haulier-invoice",
  href: `/trucking/haulier-invoices/${i.id}`,
  ref: "Haulier invoice",
  category: "",
  description: "Trucking",
  invoiceNumber: i.invoiceNumber,
  receivedAt: i.issueDate,
  dueOn: i.dueOn,
  overdueDays: i.overdueDays,
  amount: i.amount,
  currency: i.currency,
  vat: "with",
});

// Most overdue first, then by due day (unknown last), then the oldest.
const byUrgency = (a: OwedItem, b: OwedItem) =>
  b.overdueDays - a.overdueDays || (a.dueOn || "9999").localeCompare(b.dueOn || "9999") || a.receivedAt.localeCompare(b.receivedAt) || a.ref.localeCompare(b.ref);

const biggest = (t: OwedTotal) => Math.max(t.costs?.owed ?? 0, t.invoices?.owed ?? 0);

export function supplierOwed(costs: OwedCosts): SupplierOwed {
  const invoices = costs.haulierInvoices;
  const totals = new Map<string, OwedTotal>();
  const totalOf = (currency: string) => {
    let t = totals.get(currency);
    if (!t) totals.set(currency, (t = { currency, costs: null, invoices: null }));
    return t;
  };
  for (const c of costs.totals) totalOf(c.currency).costs = { owed: c.owed, overdue: c.overdue, expected: c.expected, untracked: c.untracked };
  for (const i of invoices.totals) totalOf(i.currency).invoices = { owed: i.owed, overdue: i.overdue, untracked: i.untracked };

  return {
    owed: [...costs.owed.map(costItem), ...invoices.owed.map(invoiceItem)].sort(byUrgency),
    expected: costs.expected.map(costItem),
    untracked: [...costs.untracked.map(costItem), ...invoices.untracked.map(invoiceItem)],
    totals: [...totals.values()].sort((a, b) => biggest(b) - biggest(a) || a.currency.localeCompare(b.currency)),
    counts: { owed: costs.counts.owed + invoices.counts.owed, expected: costs.counts.expected, untracked: costs.counts.untracked + invoices.counts.untracked },
    withoutAmount: costs.counts.withoutAmount,
    costsDueUnknown: costs.counts.dueUnknown,
    invoicesDueUnknown: invoices.counts.dueUnknown,
    haulierInvoices: invoices.status,
    invoicesTruncated: invoices.truncated,
  };
}
