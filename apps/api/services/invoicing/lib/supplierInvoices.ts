import { addDays, businessDay } from "../../../lib/businessDate";
import { invoiceNumberKey } from "./invoiceLines";
import { qtyOrOne, round2 } from "./invoiceCalc";
import { nameKey } from "./supplierCosts";

/**
 * Accounts Payable's rules for a supplier invoice (Council Outlay 9, 17 Nov 2026), kept pure so they can be
 * tested on their own: how lines are matched to an invoice, its due day, its marks, and who may approve it.
 */

/** Who an invoice is from, as its lines are matched: a Customer Database supplier, a haulier, or a typed name. */
export function supplierKeyOf(line: { supplierCustomerId: string | null; haulierId: string | null; vendor: string }): string {
  if (line.supplierCustomerId) return `c:${line.supplierCustomerId.toLowerCase()}`;
  if (line.haulierId) return `h:${line.haulierId.toLowerCase()}`;
  return `n:${nameKey(line.vendor)}`;
}

/** The invoice a line belongs to: its supplier and number; null for a line with no invoice number. */
export function invoiceKeyOf(line: { invoiceNumber: string; supplierCustomerId: string | null; haulierId: string | null; vendor: string }): string | null {
  const numberKey = invoiceNumberKey(line.invoiceNumber);
  return numberKey ? `${supplierKeyOf(line)}|${numberKey}` : null;
}

export { invoiceNumberKey };

/** A master job's line as its siblings are matched: the master job, its supplier text and its number. */
export const masterSiblingKey = (l: { masterJobId: string; vendor: string; invoiceNumber: string }): string =>
  `${l.masterJobId}|${supplierKeyOf({ supplierCustomerId: null, haulierId: null, vendor: l.vendor })}|${invoiceNumberKey(l.invoiceNumber)}`;

/**
 * The invoices a master job's lines are on once linked to a supplier, by masterSiblingKey. A master job's line
 * names its supplier by text only: a new line of the same master job, supplier text and number joins that invoice,
 * instead of being booked as a second record by the text (one supplier bill, one row on Accounts Payable).
 */
export function linkedMasterSiblings<T extends { id: string; numberKey: string; supplierKey: string }>(
  lines: readonly { masterJobId: string; vendor: string; invoiceNumber: string; supplierInvoiceId: string | null }[],
  invoices: ReadonlyMap<string, T>,
): Map<string, T> {
  const out = new Map<string, T>();
  for (const l of lines) {
    const h = l.supplierInvoiceId ? invoices.get(l.supplierInvoiceId) : undefined;
    if (!h || h.supplierKey.startsWith("n:") || h.numberKey !== invoiceNumberKey(l.invoiceNumber)) continue;
    out.set(masterSiblingKey(l), h);
  }
  return out;
}

/** A line's amount as the invoice bills it: unit amount × quantity (none = 1). */
export const lineAmount = (amount: string | number | null, qty: string | number | null): number => round2(Number(amount ?? 0) * qtyOrOne(qty));

/** Amounts per currency, each rounded, in a stable order (largest first). */
export function sumByCurrency(items: { amount: number; currency: string }[]): { currency: string; amount: number }[] {
  const sums = new Map<string, number>();
  for (const i of items) sums.set(i.currency || "CZK", round2((sums.get(i.currency || "CZK") ?? 0) + i.amount));
  return [...sums.entries()].map(([currency, amount]) => ({ currency, amount })).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount) || a.currency.localeCompare(b.currency));
}

export type DueSource = "invoice" | "terms" | "none";

/**
 * When the invoice is due: the date on the invoice; else the day it was booked plus the supplier's payment
 * days; else not known. A credit note is never due.
 */
export function dueDayOf(
  invoice: { dueDate: string | null; receivedAt: Date | string | null; kind: string },
  paymentDays: number | null,
): { due: string | null; source: DueSource } {
  if (invoice.kind === "credit_note") return { due: null, source: "none" };
  if (invoice.dueDate) return { due: invoice.dueDate, source: "invoice" };
  if (invoice.receivedAt && paymentDays !== null && paymentDays !== undefined) {
    return { due: addDays(businessDay(new Date(invoice.receivedAt)), paymentDays), source: "terms" };
  }
  return { due: null, source: "none" };
}

/** Days past the due day (0 when not overdue or not known). */
export function daysOverdue(due: string | null, today: string): number {
  if (!due || due >= today) return 0;
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
}

/** What a supplier's record in the Customer Database says (customers _internalSupplierFacts). */
export interface SupplierFactsLike {
  dic: string;
  country: string;
  paymentDays: number | null;
  vatUnreliable: boolean;
  bankAccountPublished: boolean;
  /** When the VAT register was last asked (null: never - then "not published" only means "not known") */
  vatCheckedAt: string | null;
  bankAccountsChangedAt: string | null;
  approvalStatus: string;
  rating: number | null;
}

export type PayableMark =
  | "not_linked"
  | "vat_unreliable"
  | "account_not_published"
  | "bank_changed"
  | "supplier_pending"
  | "supplier_declined"
  | "low_rating"
  | "no_terms"
  | "same_number_other_supplier";

/** A Czech VAT payer: the one the VAT register checks (ručení za DPH) apply to. */
export const isCzechVatPayer = (facts: Pick<SupplierFactsLike, "dic">) => /^CZ/i.test(facts.dic.trim());

/**
 * The VAT register said the supplier's bank account is not published: only once it was asked. A supplier never
 * checked is not known either way, and is not stopped for it (D14 stops on what the register says).
 */
const accountNotPublished = (facts: Pick<SupplierFactsLike, "dic" | "bankAccountPublished" | "vatCheckedAt">) =>
  isCzechVatPayer(facts) && !!facts.vatCheckedAt && !facts.bankAccountPublished;

const BANK_CHANGE_DAYS = 30;

/** The marks a row shows, from what the Customer Database knows of its supplier and the other invoices. */
export function marksOf(
  invoice: { supplierCustomerId: string | null; haulierId: string | null; dueDate: string | null; kind: string },
  facts: SupplierFactsLike | null,
  sameNumberElsewhere: boolean,
  now: Date,
): PayableMark[] {
  const marks: PayableMark[] = [];
  if (!invoice.supplierCustomerId && !invoice.haulierId) marks.push("not_linked");
  if (facts) {
    if (facts.vatUnreliable) marks.push("vat_unreliable");
    if (accountNotPublished(facts)) marks.push("account_not_published");
    if (facts.bankAccountsChangedAt && now.getTime() - Date.parse(facts.bankAccountsChangedAt) < BANK_CHANGE_DAYS * 86_400_000) marks.push("bank_changed");
    if (facts.approvalStatus === "pending") marks.push("supplier_pending");
    if (facts.approvalStatus === "declined") marks.push("supplier_declined");
    if (facts.rating !== null && facts.rating <= 2) marks.push("low_rating");
    if (facts.paymentDays === null && !invoice.dueDate && invoice.kind !== "credit_note") marks.push("no_terms");
  } else if (!invoice.dueDate && invoice.kind !== "credit_note") {
    marks.push("no_terms");
  }
  if (sameNumberElsewhere) marks.push("same_number_other_supplier");
  return marks;
}

/**
 * Why this manager may not approve the invoice, or null (D8, D9, D13, D14). `enteredByUserId` is null for an
 * invoice gathered from lines, whose enterer is not known. Returns whether the approval is the enterer's own.
 */
export function approvalProblem(input: {
  status: string;
  linked: boolean;
  facts: SupplierFactsLike | null;
  enteredByUserId: string | null;
  approverUserId: string;
  anotherManager: boolean;
}): { problem: string | null; selfDecision: boolean } {
  if (input.status === "approved") return { problem: "This invoice is approved already", selfDecision: false };
  if (input.status === "refused") return { problem: "This invoice was refused: the corrected invoice is booked as a new one", selfDecision: false };
  if (!input.linked) return { problem: "Link the supplier first: an invoice is approved only for a supplier of the Customer Database", selfDecision: false };
  if (input.facts && isCzechVatPayer(input.facts)) {
    if (input.facts.vatUnreliable) return { problem: "The supplier is an unreliable VAT payer: its invoice can't be approved", selfDecision: false };
    if (accountNotPublished(input.facts)) {
      return { problem: "The supplier's bank account is not published in the VAT register: its invoice can't be approved", selfDecision: false };
    }
  }
  const own = !!input.enteredByUserId && input.enteredByUserId === input.approverUserId;
  if (own && input.anotherManager) return { problem: "You entered this invoice: another manager approves it", selfDecision: false };
  return { problem: null, selfDecision: own };
}

/** A cost claim as the shipments service answers it (_internalCostClaims). */
export interface CostClaimLike {
  id: string;
  shipmentId: string;
  supplierInvoiceId: string | null;
  invoiceNumber: string;
  status: string;
}

/**
 * The cost claims that dispute an invoice: those tied to it, and - for claims typed before they could be - one on
 * a job of the invoice that names its number.
 */
export function claimsOf<T extends CostClaimLike>(invoice: { id: string; numberKey: string; shipmentIds: readonly string[] }, claims: readonly T[]): T[] {
  return claims.filter(
    (c) => c.supplierInvoiceId === invoice.id || (!c.supplierInvoiceId && invoice.shipmentIds.includes(c.shipmentId) && invoiceNumberKey(c.invoiceNumber) === invoice.numberKey),
  );
}

/** Whether an open claim holds the payment (D15). */
export const holdsPayment = (claims: readonly { status: string }[]) => claims.some((c) => c.status === "open");

/** Why the invoice may not be marked paid on `day`, or null (D11, D15). */
export function paymentProblem(input: { status: string; paidOn: string | null; day: string; today: string; bookedOn: string | null; openClaim: boolean }): string | null {
  if (input.status !== "approved") return "Approve the invoice first: only an approved invoice is paid";
  if (input.paidOn) return `This invoice is marked paid already (${input.paidOn})`;
  if (input.openClaim) return "A claim on this invoice is open: settle or withdraw it before paying";
  if (input.day > input.today) return "The day it was paid cannot be after today";
  if (input.bookedOn && input.day < input.bookedOn) return `The day it was paid cannot be before it was booked (${input.bookedOn})`;
  return null;
}
