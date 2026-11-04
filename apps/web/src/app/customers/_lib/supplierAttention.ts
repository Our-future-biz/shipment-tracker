import type { interfaces } from "@/lib/api/client";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import type { DocumentItem } from "@/hooks/useCustomerDocuments";
import type { CustomerItem } from "@/hooks/useCustomers";
import { formatDate } from "@/lib/date";
import type { AttentionItem } from "./customerAttention";
import { DATED_DOCUMENT_TYPES } from "./constants";
import { hasSupplierRole } from "./customerListViews";
import { REASON_REQUIRED_UP_TO } from "./supplierRatingScale";

// What on a supplier needs attention (Council Outlay 7, step 4): its Trucking check as Trucking makes it
// (not worked out again), its rating, its tariffs, its papers and who takes its orders. One pure function
// over what the page has loaded; the Needs attention card shows these beside the customer rules.

export const SUPPLIER_RULES = {
  // A rating set longer ago than this is rated again.
  ratingStaleMonths: 12,
  // Tariffs, insurance, a licence or a certificate ending within this many days are named.
  endingWithinDays: 30,
  dispatchRole: "Dispatch / Operations",
} as const;

/** What Tariffs holds from the supplier under one of its roles. */
export interface SupplierTariffSummary {
  role: interfaces.CustomerRole;
  label: string;
  href: string;
  tariffCount: number;
  /** Versions that price today. */
  activeCount: number;
  /** The soonest end of a version that prices today (YYYY-MM-DD); null when none ends. */
  activeUntil: string | null;
}

export interface SupplierAttentionInput {
  customer: CustomerItem;
  /** The haulier's Trucking check; null when it is no haulier, or the check is not known. */
  haulierIssues: interfaces.HaulierIssue[] | null;
  /** Null while not loaded (or failed): no tariff finding is made then. */
  tariffs: SupplierTariffSummary[] | null;
  /** Null when they could not be read: no "missing" finding is made then. */
  contacts: ContactItem[] | null;
  documents: DocumentItem[] | null;
  /** Today, YYYY-MM-DD (the company's day); given in tests. */
  today: string;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const addMonths = (iso: string, months: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
};

export function buildSupplierAttention(input: SupplierAttentionInput): AttentionItem[] {
  const { customer, haulierIssues, tariffs, contacts, documents, today } = input;
  if (!hasSupplierRole(customer.roles)) return [];
  const critical: AttentionItem[] = [];
  const warnings: AttentionItem[] = [];
  const soon = addDays(today, SUPPLIER_RULES.endingWithinDays);

  // Trucking's own check of a haulier: what blocks a trip is critical, what is about to is a warning.
  for (const issue of haulierIssues ?? []) {
    (issue.severity === "block" ? critical : warnings).push({
      key: `haulier-${issue.code}`,
      severity: issue.severity === "block" ? "critical" : "warning",
      title: issue.code === "blocked" ? "Blocked in Trucking" : "Trucking",
      detail: issue.message,
    });
  }

  const rating = customer.supplierRating;
  if (rating === null) {
    warnings.push({ key: "not-rated", severity: "warning", title: "Not rated", detail: "Rate this supplier at the top of the page." });
  } else {
    if (rating <= REASON_REQUIRED_UP_TO) {
      warnings.push({
        key: "low-rating",
        severity: "warning",
        title: `Rated ${rating} of 5`,
        detail: customer.supplierRatingReason || "Use another supplier where there is one.",
      });
    }
    const ratedOn = customer.supplierRatingAt?.slice(0, 10) ?? "";
    if (ratedOn && addMonths(ratedOn, SUPPLIER_RULES.ratingStaleMonths) < today) {
      warnings.push({ key: "rating-stale", severity: "warning", title: "Rating is over a year old", detail: `Rated on ${formatDate(ratedOn)}. Rate it again.` });
    }
  }

  for (const t of tariffs ?? []) {
    if (t.activeCount === 0) {
      warnings.push({
        key: `no-tariff-${t.role}`,
        severity: "warning",
        title: "No valid tariff",
        detail: t.tariffCount === 0 ? `No ${t.label.toLowerCase()} on file yet.` : `None of its ${t.label.toLowerCase()} prices today.`,
      });
    } else if (t.activeUntil && t.activeUntil <= soon) {
      warnings.push({ key: `tariff-ending-${t.role}`, severity: "warning", title: "Tariffs ending", detail: `Its ${t.label.toLowerCase()} end on ${formatDate(t.activeUntil)}.` });
    }
  }

  for (const doc of (documents ?? []).filter((d) => DATED_DOCUMENT_TYPES.includes(d.type) && d.validTo)) {
    if (doc.validTo < today) {
      warnings.push({ key: `document-expired-${doc.id}`, severity: "warning", title: `${doc.type} expired`, detail: `${doc.name}: valid to ${formatDate(doc.validTo)}.`, tab: "documents" });
    } else if (doc.validTo <= soon) {
      warnings.push({ key: `document-ending-${doc.id}`, severity: "warning", title: `${doc.type} ending`, detail: `${doc.name}: valid to ${formatDate(doc.validTo)}.`, tab: "documents" });
    }
  }

  if (contacts && !contacts.some((c) => c.role === SUPPLIER_RULES.dispatchRole)) {
    warnings.push({ key: "no-dispatch-contact", severity: "warning", title: "No dispatch contact", detail: "Add who takes the orders (Dispatch / Operations).", tab: "contacts" });
  }

  return [...critical, ...warnings];
}
