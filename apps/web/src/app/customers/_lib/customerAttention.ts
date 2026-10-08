import dayjs from "dayjs";
import { validityInfo } from "@/app/sales/_lib/salesQuote";
import type { SalesQuote } from "@/app/sales/_lib/salesQuote";
import type { DocumentItem } from "@/hooks/useCustomerDocuments";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import type { CustomerItem } from "@/hooks/useCustomers";
import type { ShipmentDueItem } from "@/hooks/useShipmentsNeedingAttention";
import { formatDate } from "@/lib/date";
import { deadlineDayLabel, deadlineLabel } from "@/lib/shipmentDeadlines";
import { getNaceInfo, isNewCompany, isRegistryActive, parseNaceCodes } from "./companyAnalysis";
import { daysSince } from "./customerDates";
import { daysOverdue, summarizeInvoices } from "./customerInvoices";
import { fmtMoney, roundCents } from "./customerMoney";
import { quoteBucket, quoteHref } from "./customerQuotes";

// What on a customer needs somebody's attention right now, for the "Needs attention" list of the Overview.
// One pure function over data the page has already loaded, so the rules can be read and tested in one place.

// The thresholds the product owner approved.
export const ATTENTION_RULES = {
  // More days than this since the last logged interaction counts as "no contact".
  noContactDays: 30,
  // An open quote is listed once its validity ends within this many days.
  quoteExpiryDays: 7,
  // Document types every customer is expected to have on file.
  requiredDocumentTypes: ["Power of attorney", "Contract"],
} as const;

export type AttentionSeverity = "critical" | "warning";

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  // The bold lead of the row: a count, a job number, a quote number.
  title: string;
  // Finishes the line.
  detail: string;
  // Right-aligned extra, e.g. an amount.
  meta?: string;
  // Where the row leads: `tab` is a tab of the customer page, `href` another page. At most one of them is set;
  // with neither the row is not clickable.
  tab?: string;
  href?: string;
}

export interface AttentionInput {
  customer: CustomerItem;
  invoices: InvoiceItem[];
  // Ids of this customer's shipments: the two "due" lists below cover the whole company.
  shipmentIds: ReadonlySet<string>;
  dueWithin24h: ShipmentDueItem[];
  dueWithin48h: ShipmentDueItem[];
  quotes: SalesQuote[];
  documents: DocumentItem[];
  notes: NoteItem[];
  // The viewer's clock in milliseconds; given explicitly in tests.
  now?: number;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

// A shipment with dates in both windows is on both lists, so the window is part of the key.
function shipmentItems(
  due: ShipmentDueItem[],
  shipmentIds: ReadonlySet<string>,
  severity: AttentionSeverity,
  window: string,
): AttentionItem[] {
  return due
    .filter((shipment) => shipmentIds.has(shipment.id))
    .map((shipment) => ({
      key: `shipment-${window}-${shipment.id}`,
      severity,
      title: shipment.jobNumber || "Shipment",
      detail: shipment.deadlines.map((deadline) => `${deadlineLabel(deadline.field)} ${deadlineDayLabel(deadline.daysLeft)}`).join(", "),
      href: `/shipments/${shipment.id}`,
    }));
}

// The day a quote's validity ends ("YYYY-MM-DD"), or null when it is not known. validityInfo throws on a
// quote whose stored send date is unreadable; one such quote must not take the whole list down with it.
function quoteValidityDate(quote: SalesQuote): string | null {
  try {
    return validityInfo(quote.data).date;
  } catch {
    return null;
  }
}

// Whole calendar days from today to a date on the viewer's clock — negative once the date has passed —
// so a quote valid until today stays "today" until midnight. Null when the date is unreadable.
function daysUntil(date: string, now: number): number | null {
  const day = dayjs(date);
  if (!day.isValid()) return null;
  // Rounded, not truncated, as daysSince does: across a DST change two local midnights are 23 or 25 hours apart.
  return Math.round(day.startOf("day").diff(dayjs(now).startOf("day"), "day", true));
}

function validityDetail(date: string, daysLeft: number): string {
  if (daysLeft < 0) return `Validity ended ${formatDate(date)}.`;
  if (daysLeft === 0) return "Valid until today.";
  if (daysLeft === 1) return "Valid until tomorrow.";
  return `Valid for ${daysLeft} more days.`;
}

// Open quotes whose validity has ended or is about to, soonest first.
function quoteItems(quotes: SalesQuote[], now: number): AttentionItem[] {
  return quotes
    .flatMap((quote) => {
      if (quoteBucket(quote) !== "open") return [];
      const date = quoteValidityDate(quote);
      const daysLeft = date ? daysUntil(date, now) : null;
      if (!date || daysLeft === null || daysLeft > ATTENTION_RULES.quoteExpiryDays) return [];
      return [{ quote, date, daysLeft }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .map(({ quote, date, daysLeft }) => ({
      key: `quote-${quote.quoteNumber}`,
      severity: "warning",
      title: quote.quoteNumber,
      detail: validityDetail(date, daysLeft),
      href: quoteHref(quote.quoteNumber),
    }));
}

function contactItem(notes: NoteItem[], now: number): AttentionItem | null {
  if (notes.length === 0) {
    return {
      key: "no-interaction",
      severity: "warning",
      title: "No interaction logged",
      detail: "Nothing has been recorded with this customer yet.",
      tab: "communication",
    };
  }
  // The API sends notes newest first, but the newest is picked by its own date, so the order is not relied on.
  let newest: NoteItem | null = null;
  let newestTime = -Infinity;
  for (const note of notes) {
    // An unreadable date gives NaN, which compares false, so such a note is never picked.
    const time = note.createdAt ? dayjs(note.createdAt).valueOf() : NaN;
    if (time > newestTime) {
      newest = note;
      newestTime = time;
    }
  }
  const days = newest ? daysSince(newest.createdAt, now) : null;
  if (!newest || days === null || days <= ATTENTION_RULES.noContactDays) return null;
  return {
    key: "no-contact",
    severity: "warning",
    title: `No contact for ${plural(days, "day")}`,
    detail: `Last: ${newest.type || "Note"} on ${formatDate(newest.createdAt)}.`,
    tab: "communication",
  };
}

const documentTypeKey = (type: string) => type.trim().toLowerCase();

// Everything that needs attention, most serious first: all critical items, then all warnings,
// each group in a fixed order of rules.
export function buildCustomerAttention(input: AttentionInput): AttentionItem[] {
  const { customer, invoices, shipmentIds, dueWithin24h, dueWithin48h, quotes, documents, notes, now = Date.now() } = input;
  const { creditLimit, currency } = customer;
  const items: AttentionItem[] = [];

  // Critical.
  if (!isRegistryActive(customer.companyStatus)) {
    items.push({
      key: "registry",
      severity: "critical",
      title: `Registry status: ${customer.companyStatus.trim()}`,
      detail: "Verify the company is still trading before quoting.",
    });
  }

  // The same summary the Finance tab shows, so the count and the amount match its Overdue tile.
  const summary = summarizeInvoices(invoices, now);
  if (summary.overdueCount > 0) {
    // 0 when every overdue invoice was only marked so by hand (no due date, or one not passed yet).
    const oldestDays = invoices.reduce((max, invoice) => Math.max(max, daysOverdue(invoice, now)), 0);
    items.push({
      key: "invoices-overdue",
      severity: "critical",
      title: `${plural(summary.overdueCount, "invoice")} overdue`,
      detail: oldestDays > 0 ? `Oldest is ${plural(oldestDays, "day")} past due.` : "Marked overdue.",
      meta: fmtMoney(summary.overdueAmount, currency),
      tab: "finance",
    });
  }

  // Compared in whole cents, as the Credit card does: a sum of invoices can land a hair above the limit
  // and would otherwise read "0 over".
  const overLimit = roundCents(summary.outstanding - creditLimit);
  if (creditLimit > 0 && overLimit > 0) {
    items.push({
      key: "credit-limit",
      severity: "critical",
      title: "Credit limit exceeded",
      detail: `Outstanding is ${fmtMoney(overLimit, currency)} over the ${fmtMoney(creditLimit, currency)} limit.`,
      tab: "finance",
    });
  }

  items.push(...shipmentItems(dueWithin24h, shipmentIds, "critical", "24h"));

  // Warnings.
  items.push(...shipmentItems(dueWithin48h, shipmentIds, "warning", "48h"));
  items.push(...quoteItems(quotes, now));

  const typesOnFile = new Set(documents.map((document) => documentTypeKey(document.type)));
  const missingTypes = ATTENTION_RULES.requiredDocumentTypes.map(documentTypeKey).filter((type) => !typesOnFile.has(type));
  if (missingTypes.length > 0) {
    items.push({
      key: "documents-missing",
      severity: "warning",
      title: "Missing documents",
      detail: `No ${missingTypes.join(" or ")} on file.`,
      tab: "documents",
    });
  }

  const contact = contactItem(notes, now);
  if (contact) items.push(contact);

  if (isNewCompany(customer.registrationDate, now)) {
    items.push({
      key: "new-company",
      severity: "warning",
      title: "New company",
      detail: "Registered less than 2 years ago — consider prepayment terms.",
    });
  }

  const { primary } = getNaceInfo(parseNaceCodes(customer.nace));
  if (primary?.risk === "High") {
    items.push({
      key: "high-risk-industry",
      severity: "warning",
      title: "High-risk industry",
      detail: `${primary.label} — review before extending credit.`,
    });
  }

  return items;
}
