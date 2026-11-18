import type { PillTone } from "@/components/Pill";
import type { ChipItem } from "@/components/finance/ChipList";
import { formatDate } from "@/lib/date";

// Finance → Accounts Receivable (Council Outlay 10, D3): the words and links every page uses for what customers owe -
// the Accounts Receivable page, the customer's Finance tab, the job's invoice panel, the bell and the warnings. One
// invoice reads the same everywhere. "Paid" here means paid by the customer; in Accounts Payable it means paid by us.

export type ReceivableStatus = "unpaid" | "part_paid" | "paid" | "written_off" | "credited" | "cancelled";
export type ReceivableMark =
  | "overdue"
  | "part_credited"
  | "to_refund"
  | "prepayment"
  | "promised"
  | "promise_broken"
  | "disputed"
  | "reminded"
  | "not_in_customer_list"
  | "write_off_waiting"
  | "part_written_off"
  | "bank_charge";

/** The Accounts Receivable page opened on one customer invoice. */
export const arInvoiceHref = (invoiceId: string): string => `/accounts-receivable?invoice=${encodeURIComponent(invoiceId)}`;

const STATUS: Record<ReceivableStatus, { label: string; tone: PillTone; title: string }> = {
  unpaid: { label: "Unpaid", tone: "indigo", title: "Nothing paid by the customer yet" },
  part_paid: { label: "Part paid", tone: "amber", title: "The customer paid part of it" },
  paid: { label: "Paid", tone: "green", title: "Paid by the customer" },
  written_off: { label: "Written off", tone: "slate", title: "Closed by a write-off a second manager confirmed: nothing was paid" },
  credited: { label: "Credited", tone: "slate", title: "Cancelled by a credit note" },
  cancelled: { label: "Cancelled", tone: "slate", title: "Withdrawn on its issue day and issued again under a new number" },
};

export const statusLabel = (s: ReceivableStatus): string => STATUS[s]?.label ?? s;
export const statusTone = (s: ReceivableStatus): PillTone => STATUS[s]?.tone ?? "slate";
export const statusTitle = (s: ReceivableStatus): string => STATUS[s]?.title ?? "";

/** What the marks beside the status need from the row. */
export interface MarkFacts {
  marks: readonly ReceivableMark[];
  daysOverdue: number;
  leftToPay: number;
  currency: string;
  promisedOn: string | null;
  reminderLevel: number;
  lastRemindedOn: string | null;
}

/** "2026-11-25" → "25.11." (the year is left out on a chip). */
const dayMonth = (ymd: string | null): string => (ymd ? formatDate(ymd).replace(/\d{4}$/, "") : "");

/** One chip per mark, in the order the eye needs them: overdue first, the notes after. */
export function markChips(r: MarkFacts): ChipItem[] {
  const has = (m: ReceivableMark) => r.marks.includes(m);
  const chips: ChipItem[] = [];
  if (has("overdue")) chips.push({ key: "overdue", label: `${r.daysOverdue} day${r.daysOverdue === 1 ? "" : "s"} overdue`, tone: "red", title: "Past its due day, by the day in Prague" });
  if (has("promise_broken")) chips.push({ key: "promise_broken", label: "Promise passed", tone: "red", title: `The customer promised to pay by ${formatDate(r.promisedOn)}` });
  if (has("promised")) chips.push({ key: "promised", label: `Promised till ${dayMonth(r.promisedOn)}`, tone: "slate", title: `The customer promised to pay by ${formatDate(r.promisedOn)}` });
  if (has("disputed")) chips.push({ key: "disputed", label: "Disputed", tone: "amber", title: "The customer disputes it: it stays owed, and no reminder goes out" });
  if (has("to_refund")) chips.push({ key: "to_refund", label: "To refund", tone: "amber", title: `Credited after it was paid: we owe the customer ${Math.abs(r.leftToPay).toFixed(2)} ${r.currency}` });
  if (has("part_credited")) chips.push({ key: "part_credited", label: "Part credited", tone: "amber", title: "A credit note lowered it" });
  if (has("prepayment")) chips.push({ key: "prepayment", label: "Prepayment", tone: "indigo", title: "The customer's terms are prepayment: due on the day it was issued" });
  if (has("reminded")) chips.push({ key: "reminded", label: `Reminded ${dayMonth(r.lastRemindedOn)}`, tone: "slate", title: `Reminder ${r.reminderLevel}${r.reminderLevel >= 3 ? " (final notice)" : ""} sent ${formatDate(r.lastRemindedOn)}` });
  if (has("write_off_waiting")) chips.push({ key: "write_off_waiting", label: "Waiting for a second manager", tone: "amber", title: "A write-off or bank charge counts only once another manager confirms it" });
  if (has("part_written_off")) chips.push({ key: "part_written_off", label: "Part written off", tone: "slate", title: "Part of it was closed by a confirmed write-off" });
  if (has("bank_charge")) chips.push({ key: "bank_charge", label: "Bank charge", tone: "slate", title: "The bank's charge was closed as a bank charge, confirmed by a second manager" });
  if (has("not_in_customer_list")) chips.push({ key: "not_in_customer_list", label: "Not in the customer's list", tone: "red", title: "The invoice did not reach the customer's Finance tab: a manager can send it again" });
  return chips;
}

export const AGING_LABEL: Record<"current" | "1-30" | "31-60" | "61-90" | "90+", string> = {
  current: "Current",
  "1-30": "1–30 days",
  "31-60": "31–60 days",
  "61-90": "61–90 days",
  "90+": "90+ days",
};

export const REMINDER_LEVEL_LABEL: Record<1 | 2 | 3, string> = { 1: "Reminder 1", 2: "Reminder 2", 3: "Final notice" };
