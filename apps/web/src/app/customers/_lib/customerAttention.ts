import dayjs from "dayjs";
import type { DocumentItem } from "@/hooks/useCustomerDocuments";
import type { InvoiceItem } from "@/hooks/useCustomerInvoices";
import type { NoteItem } from "@/hooks/useCustomerNotes";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import type { CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import { getNaceInfo, isNewCompany, isRegistryActive, parseNaceCodes } from "./companyAnalysis";
import { daysSince } from "./customerDates";
import { daysOverdue, summarizeInvoices } from "./customerInvoices";
import type { Rates } from "@/lib/fx";
import { fmtMoney, roundCents } from "./customerMoney";

// What on a customer needs somebody's attention right now, for the "Needs attention" list of the Overview.
// Only the customer itself: shipment deadlines (VGM, SI, cut-offs…) and quote validity belong to Shipments and Sales.
// One pure function over data the page has already loaded, so the rules can be read and tested in one place.

// The thresholds the product owner approved.
export const ATTENTION_RULES = {
  // More days than this since the last logged interaction counts as "no contact".
  noContactDays: 30,
  // Document types every customer is expected to have on file.
  requiredDocumentTypes: ["Power of attorney", "Contract"],
} as const;

// The Sales owner input of the CRM card, which the "No sales owner" row opens.
export const SALES_OWNER_FIELD_ID = "customer-sales-owner";

export type AttentionSeverity = "critical" | "warning";

export interface AttentionItem {
  key: string;
  severity: AttentionSeverity;
  // The bold lead of the row: a count or a short finding.
  title: string;
  // Finishes the line.
  detail: string;
  // Right-aligned extra, e.g. an amount.
  meta?: string;
  // Where the row leads: `tab` is a tab of the customer page, `field` the id of a click-to-edit field on the
  // Overview, which the row scrolls to and opens. At most one of them is set; with neither the row is not clickable.
  tab?: string;
  field?: string;
}

export interface AttentionInput {
  customer: CustomerItem;
  invoices: InvoiceItem[];
  contacts: ContactItem[];
  documents: DocumentItem[];
  notes: NoteItem[];
  // Today's exchange rates: invoices in another currency are compared with the limit in the customer's currency.
  rates: Rates;
  // The viewer's clock in milliseconds; given explicitly in tests.
  now?: number;
}

const plural = (count: number, noun: string) => `${count} ${noun}${count === 1 ? "" : "s"}`;

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
  const { customer, invoices, contacts, documents, notes, rates, now = Date.now() } = input;
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
  const summary = summarizeInvoices(invoices, { currency, rates }, now);
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

  // Warnings.
  if (!customer.salesOwner?.trim()) {
    items.push({
      key: "no-sales-owner",
      severity: "warning",
      title: "No sales owner",
      detail: "Assign one in the CRM card.",
      field: SALES_OWNER_FIELD_ID,
    });
  }

  if (contacts.length === 0) {
    items.push({
      key: "no-contact-person",
      severity: "warning",
      title: "No contact person",
      detail: "Add who to call or write to at this customer.",
      tab: "contacts",
    });
  }

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
