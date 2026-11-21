import { APIError } from "encore.dev/api";
import type { BuyingCostInput } from "../interfaces/interfaces";
import { invoiceRepository } from "../repositories/invoice.repository";
import { supplierInvoiceRepository } from "../repositories/supplierInvoice.repository";

// A shipment with an issued invoice is billed (owner's decision): what is invoiced stays as it was
// invoiced until the invoice is credited, not the whole shipment.
//  - Selling: a row on an issued invoice is part of a tax document and is refused any change
//    (sellingCostRepository.writeUnlessInvoiced, sellingAmountRequestRepository); every other row -
//    one added after the billing (a late demurrage, storage) or one left off the invoice - is edited
//    and deleted as on any shipment, and goes on the next invoice.
//  - Buying, its estimates above all, stays as it was billed: no row is added, changed or deleted by
//    hand, nor copied from a quote. What goes on regardless is not a change of a cost by hand: a
//    supplier's invoice posted through document reading or a master job (upsertCost, splitCost,
//    postInvoiceLines) - as a new row where the shipment's row of the charge has a real cost
//    already, never over it - a Trucking push, noting that a received invoice was paid, and linking a
//    cost to the supplier who sent it, and a supplier's invoice typed by hand on the line it bills: its
//    number, and its real cost while the line has none or it is a late one not yet approved
//    (billedBuyingProblem) - a line on a supplier invoice approved or paid keeps its number and supplier
//    (keepsItsInvoice). A master job's split leaves a billed shipment as it is.

export const BILLED = "This shipment is billed: its buying costs can't be changed. Credit the invoice first";

// The supplier links change no amount: a supplier invoice posted after the billing is still linked
// to its supplier, so it counts in what the company owes them (lib/supplierCosts). Its invoice number
// changes no amount either: a supplier's invoice that comes after the billing is booked on the line it
// bills, which then counts in Accounts Payable (Council Outlay 9, D6) - with its real cost (below). A line on a
// supplier invoice approved or paid keeps both, so it stays on that invoice (keepsItsInvoice).
const BUYING_STILL_OPEN = new Set(["sortOrder", "received", "paidOn", "supplierCustomerId", "haulierId", "invoiceNumber"]);

// A supplier's invoice that comes after the billing and is typed by hand brings its amount: the real cost
// (quantity, amount, currency) goes in together with its number, on a line that has one, so the invoice
// reaches Accounts Payable with what is owed (owner's answer to the User Council, Q1). On a line that has no
// real cost yet; and a late one stays open until its supplier invoice is approved or paid (mock council M1):
// the line's real amount came after the shipment's first invoice that stands (invoice_cost.real_cost_at), and while
// nobody has approved its supplier invoice a typo in the amount, a currency picked after the amount (the row reads
// Qty, Real Cost, Cur) or a wrong quantity is put right on the job. A real cost that was on the line when the
// customer was billed stays as billed (the owner's rule) - also when its number is typed after the billing, or its
// supplier invoice record is made later (the Accounts Payable backfill, a supplier relinked): when the real cost
// came is the line's own stamp, never its invoice record's (system-21 mock council review). A late one once approved
// or paid stays too: that is put right on Finance → Accounts Payable, by taking the approval back or refusing the
// invoice. The estimate stays as it was billed, and no row is added or deleted by hand.
const REAL_COST = ["realQty", "realAmount", "realCurrency"];
const BUYING_OPEN_WITH_NUMBER = new Set([...BUYING_STILL_OPEN, ...REAL_COST]);

export const BILLED_NUMBER_FIRST =
  "This shipment is billed: a real cost goes in only with the supplier's invoice number. Fill in the invoice number first";
export const BILLED_REAL_COST_IN =
  "This shipment is billed: a real cost already on the line stays as billed. Credit the invoice first";
export const BILLED_LATE_DECIDED =
  "This shipment is billed: the supplier invoice of this real cost is approved or paid, so the real cost stays as it is. Put it right on Finance → Accounts Payable";
/** Two people typed the late real cost of one billed line at once: the later save is refused (mock council S1-06). */
export const BILLED_REAL_COST_CHANGED =
  "This line's real cost was changed meanwhile by someone else: reload the job to see it, then type yours again if it is still needed";

/**
 * How a billed line's real cost came, from when it came on the line, its supplier invoice and the moment the shipment
 * was first billed: "open" - came after the billing and its invoice still waits for approval, so it is put right on
 * the job; "decided" - came after the billing and its invoice is approved or paid since; null - none, one with no
 * invoice, or one that was on the line when the shipment was billed (mock council M1).
 */
export type LateRealCost = "open" | "decided" | null;

/** The supplier invoice a billed line is on, as lateRealCostOf reads it. */
export interface LateInvoice {
  status: string;
  paidOn: string | null;
}

/**
 * `realCostAt` is when the line's real amount came (invoice_cost.real_cost_at): null for one there before it was
 * kept, so read as there before the billing. The invoice record's own date says nothing of it: the record is made
 * again by a backfill or a relink, and for a number typed after the billing on an amount that was there before.
 */
export function lateRealCostOf(realCostAt: Date | null | undefined, invoice: LateInvoice | null | undefined, billedAt: Date | null): LateRealCost {
  if (!realCostAt || !invoice || !billedAt || invoice.status === "refused" || realCostAt <= billedAt) return null;
  return invoice.status === "booked" && !invoice.paidOn ? "open" : "decided";
}

// What a line is matched to its supplier invoice by (repositories/supplierInvoice sync): its number and its supplier link.
const INVOICE_KEYS = ["invoiceNumber", "supplierCustomerId", "haulierId"] as const;
type InvoiceKeys = Partial<Record<(typeof INVOICE_KEYS)[number], string | null>>;
/** A number or link as Accounts Payable compares it when a line changes: blank is none, the rest as typed. */
const keyText = (v: string | null | undefined) => ((v ?? "").trim() ? String(v) : "");

/** Whether a change gives a line another invoice number or supplier link than it has, so it leaves the supplier invoice it is on. */
export const leavesItsInvoice = (changes: InvoiceKeys, current: InvoiceKeys) =>
  INVOICE_KEYS.some((k) => changes[k] !== undefined && keyText(changes[k]) !== keyText(current[k]));

/**
 * Whether a billed job's line keeps the supplier invoice it is on, and its number and supplier with it: one approved
 * or paid (system-21 review). Moved off it, the invoice would go back to be approved from the job page and the line,
 * booked on a new record, have its late real cost open on the job again - an approval taken back is put right on
 * Finance → Accounts Payable, as the late real cost is (BILLED_LATE_DECIDED). A refused invoice's line moves (its
 * corrected invoice is booked as a new one), and so does one of an invoice still waiting for approval.
 */
export const keepsItsInvoice = (invoice: LateInvoice | null | undefined) =>
  !!invoice && invoice.status !== "refused" && (invoice.status !== "booked" || !!invoice.paidOn);

const only = (input: object, open: Set<string>) => Object.entries(input).every(([key, value]) => value === undefined || open.has(key));

/** Whether a buying row's change leaves its cost alone: its place in the list, that it was received or paid, or its supplier link. */
export const leavesBuyingCostAlone = (input: object) => only(input, BUYING_STILL_OPEN);

/** Whether a change touches a buying row's real cost (quantity, amount or currency). */
export const touchesRealCost = (input: object) => Object.entries(input).some(([key, value]) => value !== undefined && REAL_COST.includes(key));

/** Whether a billed shipment's buying row refuses the change whatever invoice number the line has. */
export const billedRefusesOutright = (input: object) =>
  !leavesBuyingCostAlone(input) && (!only(input, BUYING_OPEN_WITH_NUMBER) || !touchesRealCost(input));

/**
 * Why a billed shipment's buying row refuses a change, or null when it goes on: what leaves the cost alone
 * always does; its real cost does on a line that has none yet (no real amount), or a late one still waiting for
 * approval (`late`, lateRealCostOf), and carries a supplier's invoice number - the one sent with the change, else
 * the one it has - when nothing else of the row changes with it. The web reads the same (costRowRules billedRealCostOpen).
 */
export function billedBuyingProblem(
  input: BuyingCostInput,
  current: { invoiceNumber?: string | null; realAmount?: string | null } | null,
  late: LateRealCost = null,
): string | null {
  if (leavesBuyingCostAlone(input)) return null;
  if (billedRefusesOutright(input)) return BILLED;
  if (current?.realAmount != null && late !== "open") return late === "decided" ? BILLED_LATE_DECIDED : BILLED_REAL_COST_IN;
  const number = input.invoiceNumber !== undefined ? input.invoiceNumber : (current?.invoiceNumber ?? "");
  return number.trim() ? null : BILLED_NUMBER_FIRST;
}

/** A line as the late real cost rule reads it: its real amount, when that came, and its supplier invoice. */
export interface LateLine {
  realAmount: string | null;
  realCostAt: Date | null;
  supplierInvoiceId: string | null;
}

/** Whether a line could have a late real cost at all: a real cost that came at a known moment, on a supplier invoice. */
const mayBeLate = (l: LateLine) => l.realAmount != null && !!l.realCostAt && !!l.supplierInvoiceId;

/**
 * How a billed shipment's line's real cost came (lateRealCostOf): only a line with a real cost that came at a known
 * moment, on a supplier invoice, asks; then the moment of the first billing is read, and the invoice only when the
 * real cost came after it.
 */
export async function lateRealCost(shipmentId: string, companyId: string, line: LateLine): Promise<LateRealCost> {
  if (!mayBeLate(line)) return null;
  const billedAt = await invoiceRepository.firstBilledAt(shipmentId, companyId);
  if (!billedAt || (line.realCostAt as Date) <= billedAt) return null;
  const invoice = await supplierInvoiceRepository.byId(companyId, line.supplierInvoiceId as string);
  return lateRealCostOf(line.realCostAt, invoice, billedAt);
}

/**
 * The lines of a shipment whose late real cost is still open (lateRealCostOf "open"), for Costs Breakdown to keep
 * their real cost open as the write above does. Nothing is read when no line has a real cost that came at a known
 * moment on a supplier invoice, and an invoice only for a line whose real cost came after the billing.
 */
export async function billedLateRealCosts(shipmentId: string, companyId: string, lines: ({ id: string } & LateLine)[]): Promise<Set<string>> {
  const asking = lines.filter(mayBeLate);
  if (!asking.length) return new Set();
  const billedAt = await invoiceRepository.firstBilledAt(shipmentId, companyId);
  if (!billedAt) return new Set();
  const late = asking.filter((l) => (l.realCostAt as Date) > billedAt);
  const ids = [...new Set(late.map((l) => l.supplierInvoiceId as string))];
  const invoices = new Map(await Promise.all(ids.map(async (id) => [id, await supplierInvoiceRepository.byId(companyId, id)] as const)));
  return new Set(late.filter((l) => lateRealCostOf(l.realCostAt, invoices.get(l.supplierInvoiceId as string), billedAt) === "open").map((l) => l.id));
}

/** Whether the shipment has an issued invoice that was not credited. */
export async function isBilled(shipmentId: string, companyId: string): Promise<boolean> {
  return (await invoiceRepository.countOpenInvoices(shipmentId, companyId)) > 0;
}

/** Refuses a change of a shipment's buying costs once it has an issued invoice that was not credited. */
export async function assertNotBilled(shipmentId: string, companyId: string): Promise<void> {
  if (await isBilled(shipmentId, companyId)) throw APIError.failedPrecondition(BILLED);
}
