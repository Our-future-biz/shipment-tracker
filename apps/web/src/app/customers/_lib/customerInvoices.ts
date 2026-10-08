import dayjs from "dayjs";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";

// One definition of "unpaid", "overdue" and the aging buckets for every tile, bar and column
// of the Finance tab. An invoice is overdue when it is marked so by hand or when it is unpaid
// and its due date has passed — whichever comes first.

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export interface AgingBucket {
  key: string;
  label: string;
  amount: number;
  count: number;
  // Buckets old enough to be shown as a problem.
  critical: boolean;
}

export interface InvoiceSummary {
  outstanding: number;
  openAmount: number;
  openCount: number;
  overdueAmount: number;
  overdueCount: number;
  aging: AgingBucket[];
}

export function isPaid(invoice: InvoiceItem): boolean {
  return invoice.status === "Paid";
}

// Whole calendar days past the due date on the viewer's clock (the one the Due column is shown in);
// 0 when paid, not yet due, or the date is missing/unreadable.
export function daysOverdue(invoice: InvoiceItem, now = Date.now()): number {
  if (isPaid(invoice) || !ISO_DATE.test(invoice.dueDate)) return 0;
  const due = dayjs(invoice.dueDate.slice(0, 10));
  if (!due.isValid()) return 0;
  // Rounded, not truncated: across a DST change two local midnights are 23 or 25 hours apart.
  return Math.max(0, Math.round(dayjs(now).startOf("day").diff(due, "day", true)));
}

export function isOverdue(invoice: InvoiceItem, now = Date.now()): boolean {
  return !isPaid(invoice) && (invoice.status === "Overdue" || daysOverdue(invoice, now) > 0);
}

// The status to display: an unpaid invoice past its due date reads "Overdue" even if nobody re-labelled it.
export function effectiveStatus(invoice: InvoiceItem, now = Date.now()): string {
  return isOverdue(invoice, now) ? "Overdue" : invoice.status;
}

const AGING_LIMITS: { key: string; label: string; maxDays: number; critical: boolean }[] = [
  { key: "current", label: "Current", maxDays: 0, critical: false },
  { key: "1-30", label: "1–30 days", maxDays: 30, critical: false },
  { key: "31-60", label: "31–60 days", maxDays: 60, critical: false },
  { key: "61-90", label: "61–90 days", maxDays: 90, critical: true },
  { key: "90+", label: "90+ days", maxDays: Infinity, critical: true },
];

export function summarizeInvoices(invoices: InvoiceItem[], now = Date.now()): InvoiceSummary {
  const aging: AgingBucket[] = AGING_LIMITS.map(({ key, label, critical }) => ({ key, label, critical, amount: 0, count: 0 }));
  const summary: InvoiceSummary = { outstanding: 0, openAmount: 0, openCount: 0, overdueAmount: 0, overdueCount: 0, aging };

  for (const invoice of invoices) {
    if (isPaid(invoice)) continue;
    const amount = invoice.amount ?? 0;
    summary.outstanding += amount;
    const overdue = isOverdue(invoice, now);
    if (overdue) {
      summary.overdueAmount += amount;
      summary.overdueCount += 1;
    } else {
      summary.openAmount += amount;
      summary.openCount += 1;
    }
    // Marked overdue by hand with no elapsed days (no due date, or one not yet passed): its age is
    // unknown, so it goes to the youngest past-due bucket — "Current" always equals the Open tile.
    const days = Math.max(daysOverdue(invoice, now), overdue ? 1 : 0);
    const bucket = aging[AGING_LIMITS.findIndex((limit) => days <= limit.maxDays)];
    if (bucket) {
      bucket.amount += amount;
      bucket.count += 1;
    }
  }
  return summary;
}
