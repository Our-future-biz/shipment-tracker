import { addDays, businessDayOf } from "@/lib/date";

// "What we owe" a supplier (Council Outlay 7, step 6b), worked out from its cost lines not yet paid
// (the shipments' Costs Breakdown) and, for a haulier, its Trucking invoices:
//  - owed = received and not paid: a cost line's real cost, an approved haulier invoice's total (E9)
//  - due  = a line's received day + the supplier's payment days; a haulier invoice's own due day.
//    Unknown when the payment days are not set or the line was received before that day was kept
//  - overdue = due before today
//  - expected = a line not received yet (its real cost once typed, else the estimate): shown apart,
//    never in the owed total
// Totals are per currency: nothing is converted. Pure, so it is unit-tested.

export interface OwedCostLine {
  id: string;
  shipmentId: string;
  jobNumber: string;
  description: string;
  category: string;
  invoiceNumber: string;
  received: boolean;
  receivedAt: string | null;
  amount: number | null;
  currency: string;
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
}

export interface OwedItem {
  key: string;
  /** a shipment's cost line, or a Trucking haulier invoice */
  source: "cost" | "haulier-invoice";
  href: string;
  /** the job number, or "Haulier invoice" */
  ref: string;
  /** the charge, as a code or a description */
  category: string;
  description: string;
  invoiceNumber: string;
  /** the day the invoice was received (a haulier invoice: issued); "" when not known */
  receivedOn: string;
  /** "" when not known */
  dueOn: string;
  /** days past the due day; 0 when not overdue or not known */
  overdueDays: number;
  amount: number | null;
  currency: string;
}

export interface OwedTotal {
  currency: string;
  owed: number;
  overdue: number;
  expected: number;
}

export interface SupplierOwed {
  owed: OwedItem[];
  expected: OwedItem[];
  totals: OwedTotal[];
  /** owed lines with no real cost typed: not in the totals */
  withoutAmount: number;
  /** owed items whose due day is not known */
  dueUnknown: number;
}

const DAY_MS = 86_400_000;
const daysAfter = (day: string, today: string) => Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`)) / DAY_MS);

const costHref = (shipmentId: string) => `/shipments/${shipmentId}?tab=costs`;

function costItem(l: OwedCostLine, paymentDays: number | null, today: string): OwedItem {
  const receivedOn = l.received ? businessDayOf(l.receivedAt) : "";
  const dueOn = receivedOn && paymentDays !== null ? addDays(receivedOn, paymentDays) : "";
  return {
    key: `cost:${l.id}`,
    source: "cost",
    href: costHref(l.shipmentId),
    ref: l.jobNumber,
    category: l.category,
    description: l.description,
    invoiceNumber: l.invoiceNumber,
    receivedOn,
    dueOn,
    overdueDays: dueOn && dueOn < today ? daysAfter(dueOn, today) : 0,
    amount: l.amount,
    currency: l.currency,
  };
}

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
    receivedOn: i.issueDate,
    dueOn,
    overdueDays: dueOn && dueOn < today ? daysAfter(dueOn, today) : 0,
    amount: i.totalGross,
    currency: i.currency,
  };
}

// Most overdue first, then by due day (unknown last), then newest received.
const byUrgency = (a: OwedItem, b: OwedItem) =>
  b.overdueDays - a.overdueDays ||
  (a.dueOn || "9999").localeCompare(b.dueOn || "9999") ||
  b.receivedOn.localeCompare(a.receivedOn) ||
  a.ref.localeCompare(b.ref);

const round2 = (n: number) => Math.round(n * 100) / 100;

export function supplierOwed(
  lines: readonly OwedCostLine[],
  haulierInvoices: readonly OwedHaulierInvoice[],
  paymentDays: number | null,
  today: string,
): SupplierOwed {
  const owed = [
    ...lines.filter((l) => l.received).map((l) => costItem(l, paymentDays, today)),
    // What we owe a haulier through Trucking: its approved invoices, until they are paid.
    ...haulierInvoices.filter((i) => i.status === "APPROVED" && !i.payment).map((i) => invoiceItem(i, today)),
  ].sort(byUrgency);
  const expected = lines
    .filter((l) => !l.received)
    .map((l) => costItem(l, paymentDays, today))
    .sort((a, b) => a.ref.localeCompare(b.ref) || a.description.localeCompare(b.description));

  const totals = new Map<string, OwedTotal>();
  const totalOf = (currency: string) => {
    let t = totals.get(currency);
    if (!t) totals.set(currency, (t = { currency, owed: 0, overdue: 0, expected: 0 }));
    return t;
  };
  for (const item of owed) {
    if (item.amount === null) continue;
    const t = totalOf(item.currency);
    t.owed += item.amount;
    if (item.overdueDays > 0) t.overdue += item.amount;
  }
  for (const item of expected) if (item.amount !== null) totalOf(item.currency).expected += item.amount;

  return {
    owed,
    expected,
    totals: [...totals.values()]
      .map((t) => ({ ...t, owed: round2(t.owed), overdue: round2(t.overdue), expected: round2(t.expected) }))
      .sort((a, b) => b.owed - a.owed || b.expected - a.expected || a.currency.localeCompare(b.currency)),
    withoutAmount: owed.filter((i) => i.amount === null).length,
    dueUnknown: owed.filter((i) => !i.dueOn).length,
  };
}
