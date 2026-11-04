// "What we owe" a supplier (Council Outlay 7, step 6b; Council Review 5): the server's view of its cost
// lines in the shipments' Costs Breakdown (totals over every open line, lib/supplierCosts in invoicing),
// joined here with a haulier's Trucking invoices:
//  - owed = received and not paid: a cost line's real cost (as typed, without VAT), an approved haulier
//    invoice's total (with VAT, K4); due = a line's received day + the payment days, an invoice's own due day
//  - expected = a line not received yet: shown apart, never in the owed total
//  - before payment tracking = received or approved before payments were noted here: it may have been paid
//    already, so it is listed apart and not counted (K2)
// Totals are per currency: nothing is converted. Pure, so it is unit-tested.

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

export interface OwedCosts {
  owed: readonly OwedCostLine[];
  expected: readonly OwedCostLine[];
  untracked: readonly OwedCostLine[];
  totals: readonly OwedCostTotal[];
  counts: { owed: number; expected: number; untracked: number; withoutAmount: number; dueUnknown: number };
}

export interface OwedHaulierInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  totalGross: number;
  currency: string;
  payment: unknown | null;
  paymentTracked: boolean;
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
  /** a cost: the day its invoice was received (from receivedAt); an invoice: its issue day; "" when not known */
  receivedAt: string;
  /** "" when not known */
  dueOn: string;
  overdueDays: number;
  amount: number | null;
  currency: string;
  /** cost lines are as typed in Costs Breakdown (without VAT), a haulier invoice's total is with VAT */
  vat: "without" | "with";
}

export interface OwedTotal {
  currency: string;
  owed: number;
  overdue: number;
  /** the owed part from cost lines (without VAT) and from haulier invoices (with VAT) */
  fromCosts: number;
  fromInvoices: number;
  expected: number;
  untracked: number;
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
}

const DAY_MS = 86_400_000;
const daysAfter = (day: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);

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

function invoiceItem(i: OwedHaulierInvoice, today: string): OwedItem {
  const dueOn = i.dueDate ?? "";
  return {
    key: `haulier-invoice:${i.id}`,
    source: "haulier-invoice",
    href: `/trucking/haulier-invoices/${i.id}`,
    ref: "Haulier invoice",
    category: "",
    description: "Trucking",
    invoiceNumber: i.invoiceNumber,
    receivedAt: i.issueDate,
    dueOn,
    overdueDays: dueOn && dueOn < today ? daysAfter(dueOn, today) : 0,
    amount: i.totalGross,
    currency: i.currency,
    vat: "with",
  };
}

// Most overdue first, then by due day (unknown last), then the oldest.
const byUrgency = (a: OwedItem, b: OwedItem) =>
  b.overdueDays - a.overdueDays || (a.dueOn || "9999").localeCompare(b.dueOn || "9999") || a.receivedAt.localeCompare(b.receivedAt) || a.ref.localeCompare(b.ref);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function supplierOwed(costs: OwedCosts, haulierInvoices: readonly OwedHaulierInvoice[], today: string): SupplierOwed {
  const unpaid = haulierInvoices.filter((i) => i.status === "APPROVED" && !i.payment);
  const tracked = unpaid.filter((i) => i.paymentTracked).map((i) => invoiceItem(i, today));
  const untrackedInvoices = unpaid.filter((i) => !i.paymentTracked).map((i) => ({ ...invoiceItem(i, today), overdueDays: 0 }));

  const totals = new Map<string, OwedTotal>();
  const totalOf = (currency: string) => {
    let t = totals.get(currency);
    if (!t) totals.set(currency, (t = { currency, owed: 0, overdue: 0, fromCosts: 0, fromInvoices: 0, expected: 0, untracked: 0 }));
    return t;
  };
  for (const c of costs.totals) {
    const t = totalOf(c.currency);
    t.owed += c.owed;
    t.fromCosts += c.owed;
    t.overdue += c.overdue;
    t.expected += c.expected;
    t.untracked += c.untracked;
  }
  for (const i of tracked) {
    const t = totalOf(i.currency);
    t.owed += i.amount ?? 0;
    t.fromInvoices += i.amount ?? 0;
    if (i.overdueDays > 0) t.overdue += i.amount ?? 0;
  }
  for (const i of untrackedInvoices) totalOf(i.currency).untracked += i.amount ?? 0;

  return {
    owed: [...costs.owed.map(costItem), ...tracked].sort(byUrgency),
    expected: costs.expected.map(costItem),
    untracked: [...costs.untracked.map(costItem), ...untrackedInvoices],
    totals: [...totals.values()]
      .map((t) => ({ ...t, owed: round2(t.owed), overdue: round2(t.overdue), fromCosts: round2(t.fromCosts), fromInvoices: round2(t.fromInvoices), expected: round2(t.expected), untracked: round2(t.untracked) }))
      .sort((a, b) => b.owed - a.owed || b.expected - a.expected || a.currency.localeCompare(b.currency)),
    counts: { owed: costs.counts.owed + tracked.length, expected: costs.counts.expected, untracked: costs.counts.untracked + untrackedInvoices.length },
    withoutAmount: costs.counts.withoutAmount,
    costsDueUnknown: costs.counts.dueUnknown,
    invoicesDueUnknown: tracked.filter((i) => !i.dueOn).length,
  };
}
