import type { interfaces } from "@/lib/api/client";
import type { PillTone } from "@/components/Pill";
import { chargeLabel } from "@/lib/chargeCodes";
import { fold } from "@/lib/fold";
import { round2 } from "@/lib/money";
import type { Amounts } from "@/lib/amounts";
import type { CheckDef } from "@/lib/tableModel";
import { formatDate } from "@/lib/date";
import { INVOICE_STATUS_CHIP } from "@/app/trucking/_lib/haulierInvoices";
// A haulier invoice opens in Trucking, where approving and paying it stay (D17).
export { haulierInvoiceHref } from "@/app/trucking/_lib/haulierInvoices";
import type { HaulierInvoiceStatus } from "@/hooks/useTruckingMoney";

// Finance → Accounts Payable (Council Outlay 9, D1–D20 as the chair recommended, 17 Nov 2026): what the page
// shows of a supplier invoice, which tab it is in, what it may be done to and how it is exported - kept pure so
// it can be tested on its own. The server decides every action again; these rules only keep the page from
// offering what it would refuse.

export type PayableInvoice = interfaces.PayableInvoiceItem;
export type PayableHaulier = interfaces.PayableHaulierItem;
export type PayableExpected = interfaces.PayableExpectedItem;
export type PayableMark = interfaces.PayableMarkItem;

/** A row of the invoices table: one supplier invoice (D1), or a haulier invoice from Trucking, read-only (D17). */
export type PayableRow = { source: "ap"; key: string; invoice: PayableInvoice } | { source: "haulier"; key: string; haulier: PayableHaulier };

export const apRow = (invoice: PayableInvoice): PayableRow => ({ source: "ap", key: `ap:${invoice.id}`, invoice });
export const haulierRow = (haulier: PayableHaulier): PayableRow => ({ source: "haulier", key: `h:${haulier.id}`, haulier });

/**
 * The table's rows, newest first: supplier invoices in the server's order (newest booked first), haulier invoices
 * placed among them by their issue day, the closest Trucking has to a booked day.
 */
export function mergeRows(invoices: readonly PayableInvoice[], hauliers: readonly PayableHaulier[]): PayableRow[] {
  const rows = invoices.map(apRow);
  if (!hauliers.length) return rows;
  const dayOf = (r: PayableRow) => (r.source === "ap" ? r.invoice.bookedOn : (r.haulier.issueDate ?? r.haulier.dueDate ?? ""));
  // A stable sort keeps the server's order among invoices of one day.
  return [...rows, ...hauliers.map(haulierRow)].sort((a, b) => dayOf(b).localeCompare(dayOf(a)));
}

// ── Tabs ──

export type PayableTab = "all" | "to_pay" | "overdue" | "to_approve" | "refused" | "claimed" | "paid" | "expected";

export const PAYABLE_TABS: { key: PayableTab; label: string; count: keyof interfaces.PayableCounts; dividerBefore?: boolean }[] = [
  { key: "all", label: "All", count: "all" },
  { key: "to_pay", label: "To pay", count: "toPay", dividerBefore: true },
  { key: "overdue", label: "Overdue", count: "overdue" },
  { key: "to_approve", label: "To approve", count: "toApprove" },
  { key: "refused", label: "Refused", count: "refused" },
  { key: "claimed", label: "Claimed", count: "claimed" },
  { key: "paid", label: "Paid", count: "paid" },
  // Not invoices: estimates still waiting for one, the month-end accrual list.
  { key: "expected", label: "Expected", count: "expected", dividerBefore: true },
];

export const isPayableTab = (v: string | null): v is PayableTab => PAYABLE_TABS.some((t) => t.key === v);

/**
 * Whether a row belongs in a tab, as the server counts them (services/supplierInvoice payables). To pay: approved,
 * not paid, an invoice (a credit note is not paid out). Overdue: past its due day (the server gives 0 once paid or
 * refused). Haulier invoices only in All, To pay, Overdue and Paid: approval, refusal and claims stay in Trucking (D17).
 */
export function inTab(row: PayableRow, tab: PayableTab): boolean {
  if (tab === "all") return true;
  if (row.source === "haulier") {
    const h = row.haulier;
    if (tab === "to_pay") return h.status === "APPROVED" && !h.paidOn;
    if (tab === "overdue") return h.daysOverdue > 0;
    if (tab === "paid") return !!h.paidOn;
    return false;
  }
  const i = row.invoice;
  switch (tab) {
    case "to_pay":
      return i.status === "approved" && !i.paidOn && i.kind === "invoice";
    case "overdue":
      return i.daysOverdue > 0;
    case "to_approve":
      return i.status === "booked";
    case "refused":
      return i.status === "refused";
    case "claimed":
      return i.claimed;
    case "paid":
      return !!i.paidOn;
    default:
      return false;
  }
}

/** A tab's count: the server's for supplier invoices, and the haulier invoices the tab lists beside them. */
export function tabCount(tab: PayableTab, counts: interfaces.PayableCounts, hauliers: readonly PayableHaulier[]): number {
  const own = counts[PAYABLE_TABS.find((t) => t.key === tab)!.count];
  if (tab === "expected") return own;
  return own + hauliers.filter((h) => inTab(haulierRow(h), tab)).length;
}

// ── Status and marks ──

export interface Chip {
  label: string;
  tone: PillTone;
  tip: string;
}

/**
 * The status in the user's words (D3): Booked, Approved, Refused, and Paid once the payment is noted. Claimed and
 * Overdue are marks beside it, not statuses: an invoice can be approved and claimed at once.
 */
export function statusChip(i: Pick<PayableInvoice, "status" | "paidOn">): Chip {
  if (i.paidOn) return { label: "Paid", tone: "green", tip: `Paid on ${formatDate(i.paidOn)}, as the accounting system paid it` };
  if (i.status === "approved") return { label: "Approved", tone: "indigo", tip: "Approved by a manager: to be paid" };
  if (i.status === "refused") return { label: "Refused", tone: "red", tip: "Refused by a manager: its lines left the jobs and its number is free again" };
  return { label: "Booked", tone: "amber", tip: "Booked on the jobs: waiting for a manager's approval" };
}

const TRUCKING_TONE: Record<string, PillTone> = { "": "slate", i: "indigo", a: "amber", g: "green", r: "red" };

/** A haulier invoice keeps Trucking's own chip (D3), Paid once Trucking noted it paid. */
export function haulierChip(h: Pick<PayableHaulier, "status" | "paidOn">): Chip {
  if (h.paidOn) return { label: "Paid", tone: "green", tip: `Paid on ${formatDate(h.paidOn)} (noted in Trucking)` };
  const chip = INVOICE_STATUS_CHIP[h.status as HaulierInvoiceStatus];
  if (!chip) return { label: h.status || "—", tone: "slate", tip: "Trucking's status" };
  return { label: chip.label, tone: TRUCKING_TONE[chip.tone] ?? "slate", tip: `${chip.hint} (Trucking)` };
}

/** The warning marks from the Customer Database and the other invoices, in plain words (D14). */
export const MARK_CHIPS: Record<PayableMark, Chip> = {
  not_linked: { label: "Not linked", tone: "amber", tip: "The supplier is only typed: link it to a company of the Customer Database before it is approved" },
  vat_unreliable: { label: "Unreliable VAT payer", tone: "red", tip: "The VAT register lists the supplier as an unreliable payer: a Czech VAT payer's invoice can't be approved" },
  account_not_published: {
    label: "Account not published",
    tone: "red",
    tip: "The supplier's bank account is not published in the VAT register: a Czech VAT payer's invoice can't be approved",
  },
  bank_changed: { label: "Bank account changed", tone: "amber", tip: "The supplier's bank account changed in the last 30 days: check it before paying" },
  supplier_pending: { label: "Supplier not approved yet", tone: "amber", tip: "The supplier waits for a manager's approval in the Customer Database" },
  supplier_declined: { label: "Supplier declined", tone: "red", tip: "A manager declined the supplier in the Customer Database" },
  low_rating: { label: "Low rating", tone: "amber", tip: "The supplier is rated 2 stars or fewer in the Customer Database" },
  no_terms: { label: "No payment terms", tone: "slate", tip: "Neither the invoice nor the supplier gives a due day: the supplier has no payment days in the Customer Database" },
  same_number_other_supplier: {
    label: "Number used twice",
    tone: "amber",
    tip: "Another supplier's invoice has the same number: maybe one invoice booked twice",
  },
};

/** Every mark a row shows: the server's codes, then what the invoice itself says (overdue, claimed, above estimate…). */
export function rowMarks(i: PayableInvoice): (Chip & { key: string })[] {
  const out: (Chip & { key: string })[] = [];
  if (i.daysOverdue > 0) out.push({ key: "overdue", label: `${i.daysOverdue} ${i.daysOverdue === 1 ? "day" : "days"} overdue`, tone: "red", tip: `Due on ${formatDate(i.due)} and not paid` });
  if (i.claimed) out.push({ key: "claimed", label: "Claimed", tone: "red", tip: "An open cost claim disputes it: its payment is held until the claim is settled or withdrawn (D15)" });
  for (const m of i.marks) out.push({ key: m, ...(MARK_CHIPS[m] ?? { label: m, tone: "slate", tip: "" }) });
  if (i.aboveEstimate) out.push({ key: "above", label: "Above estimate", tone: "amber", tip: "A line bills more than its job estimated" });
  if (i.jobBilled) out.push({ key: "billed", label: "Job billed", tone: "slate", tip: "One of its jobs is invoiced to the customer already: a late cost changes the job's profit" });
  if (i.selfDecision) out.push({ key: "self", label: "Self-approval", tone: "slate", tip: "Approved by the manager who entered it: no other manager could (D9)" });
  return out;
}

// ── Figures ──

// amountsText and sumAmounts (one figure per currency, never converted) are in @/lib/amounts, shared with Accounts Receivable.

export const haulierAmounts = (h: PayableHaulier): Amounts => [{ currency: h.currency, amount: h.gross }];

// ── Filters ──

export interface PayableFilters {
  search: string;
  onlyMine: boolean;
  /** supplierKey of the chosen supplier; "" for any */
  supplier: string;
}

/** Who a row is from, as the supplier filter tells them apart: the Customer Database company, else the name. */
export const supplierKeyOf = (row: PayableRow): string =>
  row.source === "haulier" ? `c:${row.haulier.haulierCustomerId}` : row.invoice.supplierCustomerId || row.invoice.haulierId ? `c:${row.invoice.supplierCustomerId ?? row.invoice.haulierId}` : `n:${fold(row.invoice.supplier.trim())}`;

export const supplierNameOf = (row: PayableRow): string => (row.source === "haulier" ? row.haulier.haulierName : row.invoice.supplier);

/** The suppliers to pick from, by name. */
export function supplierOptions(rows: readonly PayableRow[], expected: readonly PayableExpected[] = []): { value: string; label: string }[] {
  const by = new Map<string, string>();
  for (const r of rows) if (!by.has(supplierKeyOf(r))) by.set(supplierKeyOf(r), supplierNameOf(r) || "—");
  for (const e of expected) {
    const key = expectedSupplierKey(e);
    if (key && !by.has(key)) by.set(key, e.vendor || "—");
  }
  return [...by.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
}

const expectedSupplierKey = (e: PayableExpected): string => (e.supplierCustomerId ? `c:${e.supplierCustomerId}` : e.vendor.trim() ? `n:${fold(e.vendor.trim())}` : "");

const hasWords = (haystack: string, search: string) => {
  const words = fold(search).split(/\s+/).filter(Boolean);
  const text = fold(haystack);
  return words.every((w) => text.includes(w));
};

/**
 * Search (supplier, number, job), Only my jobs and the supplier. A haulier invoice carries no Person in Charge
 * here, so Only my jobs leaves it out.
 */
export function matchesFilters(row: PayableRow, f: PayableFilters): boolean {
  if (f.supplier && supplierKeyOf(row) !== f.supplier) return false;
  if (row.source === "haulier") {
    if (f.onlyMine) return false;
    const h = row.haulier;
    return !f.search.trim() || hasWords(`${h.haulierName} ${h.invoiceNumber} ${h.refs.join(" ")}`, f.search);
  }
  const i = row.invoice;
  if (f.onlyMine && !i.mine) return false;
  return !f.search.trim() || hasWords(`${i.supplier} ${i.vendor} ${i.invoiceNumber} ${i.jobs.join(" ")}`, f.search);
}

export function expectedMatches(e: PayableExpected, f: PayableFilters): boolean {
  if (f.supplier && expectedSupplierKey(e) !== f.supplier) return false;
  if (f.onlyMine && !e.mine) return false;
  return !f.search.trim() || hasWords(`${e.vendor} ${e.jobNumber} ${e.customer} ${chargeLabel(e.category)} ${e.description}`, f.search);
}

// ── The operator's checks (the page: "differs from estimate, arrived on a job not yet billed to the customer, job
// billed and cost still expected, arrived after billing") ──

/** One of its lines bills another figure than its job estimated: a difference the server could work out, not 0. */
export const differsFromEstimate = (i: Pick<PayableInvoice, "lines">): boolean => i.lines.some((l) => l.difference !== null && round2(l.difference) !== 0);

/** None of its jobs is invoiced to the customer yet, so the cost can still go on the customer's invoice. A refused
 * invoice is off the jobs (D12): it arrived on none. */
export const arrivedOnUnbilledJob = (i: Pick<PayableInvoice, "jobBilled" | "status">): boolean => !i.jobBilled && i.status !== "refused";

export type InvoiceCheck = "differs" | "unbilled_job" | "after_billing";
export type ExpectedCheck = "job_billed";

export const INVOICE_CHECKS: CheckDef<InvoiceCheck>[] = [
  { key: "differs", label: "Differs from estimate", tip: "A line bills more or less than its job estimated" },
  { key: "unbilled_job", label: "Arrived on a job not yet billed", tip: "None of its jobs is invoiced to the customer yet: the cost can still be billed on" },
  {
    key: "after_billing",
    label: "Arrived after billing",
    tip: "Booked on or after the day one of its jobs was first invoiced to the customer: a cost that came after billing",
  },
];

export const EXPECTED_CHECKS: CheckDef<ExpectedCheck>[] = [
  { key: "job_billed", label: "Job billed, cost still expected", tip: "The job is invoiced to the customer already and this estimated cost has no invoice yet" },
];

/**
 * Whether a row passes one check. A haulier invoice carries no estimate nor the job's billing here, so a check
 * leaves it out, as Only my jobs does.
 */
export function invoiceCheck(row: PayableRow, check: InvoiceCheck): boolean {
  if (row.source === "haulier") return false;
  const i = row.invoice;
  if (check === "differs") return differsFromEstimate(i);
  if (check === "unbilled_job") return arrivedOnUnbilledJob(i);
  return i.arrivedAfterBilling;
}

export const expectedCheck = (e: PayableExpected, check: ExpectedCheck): boolean => (check === "job_billed" ? e.jobBilled : false);

// ── What may be done to an invoice ──

export const MIN_REASON = 3;
export const reasonOk = (reason: string) => reason.trim().length >= MIN_REASON;

export interface ActionState {
  /** offered at all */
  shown: boolean;
  /** why it can't be done now ("" when it can) */
  blocked: string;
}

export interface PayableActions {
  approve: ActionState;
  refuse: ActionState;
  takeBackApproval: ActionState;
  markPaid: ActionState;
  takeBackPayment: ActionState;
  linkSupplier: ActionState;
  editDetails: ActionState;
}

const off: ActionState = { shown: false, blocked: "" };
const on = (blocked = ""): ActionState => ({ shown: true, blocked });

/**
 * What the drawer offers (services/supplierInvoice): approving, refusing, paying and linking are for managers
 * (D5, D8, D11, D13); the details are anyone's while the invoice waits for approval and a manager's once approved,
 * never once paid or refused.
 */
export function actionsFor(i: PayableInvoice, canDecide: boolean): PayableActions {
  const paid = !!i.paidOn;
  const notLinked = !i.supplierCustomerId && !i.haulierId;
  const vatStop = i.marks.includes("vat_unreliable")
    ? MARK_CHIPS.vat_unreliable.tip
    : i.marks.includes("account_not_published")
      ? MARK_CHIPS.account_not_published.tip
      : "";
  return {
    approve: canDecide && i.status === "booked" ? on(notLinked ? "Link the supplier first: an invoice is approved only for a supplier of the Customer Database (D13)" : vatStop) : off,
    refuse: canDecide && i.status !== "refused" && !paid ? on() : off,
    takeBackApproval: canDecide && i.status === "approved" && !paid ? on() : off,
    markPaid: canDecide && i.status === "approved" && !paid ? on(i.claimed ? "A claim on this invoice is open: settle or withdraw it before paying (D15)" : "") : off,
    takeBackPayment: canDecide && paid ? on() : off,
    linkSupplier: canDecide && i.status === "booked" ? on() : off,
    editDetails: i.status !== "refused" && !paid && (i.status === "booked" || canDecide) ? on() : off,
  };
}

/**
 * Why the payment can't be noted on that day, or "" (the server's paymentProblem, for the day only): not before the
 * invoice's paidNotBefore - its received day, not its booked one; null for one never stamped received, which may be
 * noted paid on any past day.
 */
export function paidDayProblem(day: string, today: string, invoice: Pick<PayableInvoice, "paidNotBefore">): string {
  const notBefore = invoice.paidNotBefore;
  if (!day) return "Pick the day it was paid";
  if (day > today) return "The day it was paid cannot be after today";
  if (notBefore && day < notBefore) return `The day it was paid cannot be before it was booked (${formatDate(notBefore)})`;
  return "";
}

// ── Raise a claim (build step 5, D15) ──

/** A job a claim on the invoice can be raised on: a claim belongs to one shipment, as on the job's Claims tab. */
export interface ClaimJob {
  shipmentId: string;
  jobNumber: string;
}

/**
 * The shipments its lines are on, once each, in the order of the lines. A master job's line names no shipment (it
 * is shared out to its jobs), so it gives none.
 */
export function claimJobs(i: Pick<PayableInvoice, "lines">): ClaimJob[] {
  const by = new Map<string, ClaimJob>();
  for (const l of i.lines) if (l.kind === "job" && l.shipmentId && !by.has(l.shipmentId)) by.set(l.shipmentId, { shipmentId: l.shipmentId, jobNumber: l.jobNumber });
  return [...by.values()];
}

/**
 * Whether the drawer offers Raise a claim, and why it can't be used now ("" when it can). Anyone may raise one, as
 * on the job's Claims tab; a refused invoice is off the jobs (D12), so there is nothing left to dispute.
 */
export function raiseClaimState(i: Pick<PayableInvoice, "status" | "lines">): ActionState {
  if (i.status === "refused") return off;
  return on(claimJobs(i).length ? "" : "Its lines are on a master job only: raise the claim on the Claim tab of one of the master job's shipments");
}

/** What the claim starts with: the invoice it disputes, its supplier as the lines name it, its number and currency. */
export function claimStart(i: Pick<PayableInvoice, "id" | "vendor" | "supplier" | "invoiceNumber" | "currency" | "amounts">) {
  const supplier = (i.vendor || i.supplier).trim();
  const currency = i.currency || i.amounts[0]?.currency || "";
  return {
    values: { supplierInvoiceId: i.id, supplier, invoiceNumber: i.invoiceNumber, claimCurrency: currency },
    // The dialog's invoice select names it as the job's Claims tab does: "Supplier · number".
    option: { value: i.id, label: [supplier, i.invoiceNumber].filter(Boolean).join(" · ") || "Supplier invoice", vendor: supplier, invoiceNumber: i.invoiceNumber, currency },
  };
}

// ── History ──

export const EVENT_LABELS: Record<string, string> = {
  booked: "Booked",
  approved: "Approved",
  approval_taken_back: "Approval taken back",
  refused: "Refused",
  paid: "Marked paid",
  payment_taken_back: "Payment taken back",
  line_changed: "A line changed: back to approval",
  details_changed: "Details changed",
};

export const SOURCE_LABELS: Record<PayableInvoice["source"], string> = {
  reading: "Document / Text Reading",
  typed: "Typed in Costs Breakdown",
  master_job: "A master job's costs",
  backfill: "Gathered from lines entered before",
};

// ── CSV (D20) ──

const plain = (n: number) => round2(n).toFixed(2);

/**
 * The rows of the tab as a CSV, the list finance takes to the bank (D20). One line per invoice and currency, so a
 * spreadsheet can add the amounts up: an invoice billing in two currencies takes two lines.
 */
export function invoicesCsv(rows: readonly PayableRow[]): string[][] {
  const head = ["Source", "Supplier", "Invoice number", "Kind", "Jobs", "Booked on", "Issue date", "Due", "Due from", "Days overdue", "Amount", "Currency", "VAT", "Status", "Marks", "Paid on"];
  const out: string[][] = [head];
  for (const r of rows) {
    if (r.source === "haulier") {
      const h = r.haulier;
      out.push(["Trucking", h.haulierName, h.invoiceNumber, "invoice", h.refs.join(" "), "", h.issueDate ?? "", h.dueDate ?? "", h.dueDate ? "invoice" : "", String(h.daysOverdue || ""), plain(h.gross), h.currency, "with VAT", haulierChip(h).label, h.claimed ? "Claimed" : "", h.paidOn ?? ""]);
      continue;
    }
    const i = r.invoice;
    const marks = rowMarks(i).map((m) => m.label).join("; ");
    const amounts = i.amounts.length ? i.amounts : [{ currency: i.currency, amount: 0 }];
    for (const a of amounts) {
      out.push([
        "Accounts Payable",
        i.supplier,
        i.invoiceNumber,
        i.kind === "credit_note" ? "credit note" : "invoice",
        i.jobs.join(" "),
        i.bookedOn,
        i.issueDate ?? "",
        i.due ?? "",
        i.dueSource === "none" ? "" : i.dueSource,
        String(i.daysOverdue || ""),
        plain(a.amount),
        a.currency,
        "without VAT",
        statusChip(i).label,
        marks,
        i.paidOn ?? "",
      ]);
    }
  }
  return out;
}

export function expectedCsv(rows: readonly PayableExpected[]): string[][] {
  return [
    ["Job", "Customer", "Charge", "Description", "Vendor", "Estimate", "Currency", "Job status", "Created on"],
    ...rows.map((e) => [e.jobNumber, e.customer, e.category ? chargeLabel(e.category) : "", e.description, e.vendor, plain(e.estimate), e.currency, e.jobStatus, e.createdOn]),
  ];
}

// ── Links ──

/** A line's job: a shipment opens on its Costs Breakdown, a master job on the master jobs page. */
export function lineHref(l: Pick<interfaces.PayableLineItem, "kind" | "shipmentId" | "masterJobId">): string | null {
  if (l.kind === "master_job") return l.masterJobId ? `/master-jobs?open=${encodeURIComponent(l.masterJobId)}` : null;
  return l.shipmentId ? `/shipments/${encodeURIComponent(l.shipmentId)}?tab=costs` : null;
}
