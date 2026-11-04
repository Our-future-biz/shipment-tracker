import type { interfaces } from "@/lib/api/client";
import type { ContactItem } from "@/hooks/useCustomerContacts";
import type { DocumentItem } from "@/hooks/useCustomerDocuments";
import type { CustomerItem } from "@/hooks/useCustomers";
import { businessDayOf, formatDate } from "@/lib/date";
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
  // A VAT register check longer ago than this is done again (Trucking asks a haulier's every 30 days itself).
  vatCheckStaleMonths: 6,
  // An account added this recently: a payment to it is looked at twice (Trucking's hold on a haulier's invoices).
  bankAddedWithinDays: 30,
  // A low rating is said for a supplier put on a job this recently: it is in use, and may be picked again.
  lowRatingUsedWithinDays: 30,
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
  /**
   * The last day it has a tariff pricing without a gap, versions that start later counted (YYYY-MM-DD);
   * null when one never ends. "Tariffs ending" is judged on this (K12).
   */
  coveredUntil: string | null;
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
  /** Whether the user may rate it (a manager): only they are told to (m20). */
  canRate?: boolean;
  /**
   * When it was last put on a job (ISO), null when never; undefined when not known (not loaded, or failed).
   * A low rating is said for a supplier used in the last 30 days, or when this is not known (m21).
   */
  lastUsedAt?: string | null;
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
  const { customer, haulierIssues, tariffs, contacts, documents, today, canRate = true, lastUsedAt } = input;
  const recentlyUsed = lastUsedAt === undefined || (lastUsedAt !== null && addDays(businessDayOf(lastUsedAt), SUPPLIER_RULES.lowRatingUsedWithinDays) > today);
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
    warnings.push({ key: "not-rated", severity: "warning", title: "Not rated", detail: canRate ? "Rate this supplier at the top of the page." : "A manager rates suppliers: ask one to rate it." });
  } else {
    if (rating <= REASON_REQUIRED_UP_TO && recentlyUsed) {
      warnings.push({
        key: "low-rating",
        severity: "warning",
        title: `Rated ${rating} of 5`,
        detail: customer.supplierRatingReason || "Use another supplier where there is one.",
      });
    }
    // The day on the company's (Prague) calendar, as the rest of the page shows it (m19).
    const ratedOn = businessDayOf(customer.supplierRatingAt);
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
    } else if (t.coveredUntil && t.coveredUntil <= soon) {
      // Only when nothing carries on after the last day (R8): a follow-on version is not an ending.
      warnings.push({ key: `tariff-ending-${t.role}`, severity: "warning", title: "Tariffs ending", detail: `Its ${t.label.toLowerCase()} end on ${formatDate(t.coveredUntil)}, with no version after them.` });
    }
  }

  // Of each kind of paper only the newest counts (R9): a renewed certificate puts an end to the old one.
  const newest = new Map<string, DocumentItem>();
  for (const d of (documents ?? []).filter((d) => DATED_DOCUMENT_TYPES.includes(d.type) && d.validTo)) {
    const kept = newest.get(d.type);
    if (!kept || d.validTo > kept.validTo) newest.set(d.type, d);
  }
  for (const doc of newest.values()) {
    if (doc.validTo < today) {
      warnings.push({ key: `document-expired-${doc.id}`, severity: "warning", title: `${doc.type} expired`, detail: `${doc.name}: valid to ${formatDate(doc.validTo)}.`, tab: "documents" });
    } else if (doc.validTo <= soon) {
      warnings.push({ key: `document-ending-${doc.id}`, severity: "warning", title: `${doc.type} ending`, detail: `${doc.name}: valid to ${formatDate(doc.validTo)}.`, tab: "documents" });
    }
  }

  // The VAT register checks before we pay it (step 6b): for a haulier Trucking already says whether it is an
  // unreliable payer and when its check is due, so only what Trucking does not say is added for one.
  const terms = customer.supplierTerms;
  const haulier = customer.roles.includes("haulier");
  if (!haulier && terms.vatUnreliable) {
    critical.push({ key: "vat-unreliable", severity: "critical", title: "Unreliable VAT payer", detail: "Paying it can make us liable for its VAT. Check the VAT register before paying.", tab: "finance" });
  }
  if (!haulier && !terms.vatCheckedAt) {
    warnings.push({ key: "vat-not-checked", severity: "warning", title: "VAT register not checked", detail: "Check it in the VAT register and note it under Finance → Terms and checks.", tab: "finance" });
  } else if (!haulier && addMonths(terms.vatCheckedAt, SUPPLIER_RULES.vatCheckStaleMonths) < today) {
    warnings.push({ key: "vat-check-old", severity: "warning", title: "VAT check is over 6 months old", detail: `Last checked on ${formatDate(terms.vatCheckedAt)}.`, tab: "finance" });
  }
  // Only once checked: never checked is said above (or by Trucking), and an unknown account is no finding.
  if (terms.vatCheckedAt && (!terms.bankAccountPublished || terms.bankAccounts.length === 0)) {
    warnings.push({
      key: "no-published-account",
      severity: "warning",
      title: "No published bank account",
      detail: terms.bankAccounts.length === 0 ? "No account from the VAT register is listed: a payment has nowhere checked to go." : "Its account is not published in the VAT register.",
      tab: "finance",
    });
  }
  const added = businessDayOf(terms.bankAccountsChangedAt);
  if (added && addDays(added, SUPPLIER_RULES.bankAddedWithinDays) > today) {
    warnings.push({
      key: "bank-account-added",
      severity: "warning",
      title: "Bank account added recently",
      detail: `On ${formatDate(added)}${terms.bankAccountsChangedBy ? ` by ${terms.bankAccountsChangedBy}` : ""}: check a payment to it twice.`,
      tab: "finance",
    });
  }

  if (contacts && !contacts.some((c) => c.role === SUPPLIER_RULES.dispatchRole)) {
    warnings.push({ key: "no-dispatch-contact", severity: "warning", title: "No dispatch contact", detail: "Add who takes the orders (Dispatch / Operations).", tab: "contacts" });
  }

  return [...critical, ...warnings];
}
