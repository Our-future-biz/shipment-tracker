import type { HaulierDetail } from "@/hooks/useTrucking";
import type { HaulierInvoice, HaulierInvoiceStatus, InvoiceCandidate } from "@/hooks/useTruckingMoney";
import { bankAccountProblem, isPublishedAccount } from "./bankAccounts";
import type { StatusChip } from "./consignments";
import { formatMoney } from "./tariffs";
import { round2 } from "@/lib/money";

// Haulier invoices: matched line by line against what the trips and partner legs should cost.
// Exact match only — any difference waits for a manager. Never approved while the haulier or its
// bank account fails the VAT-register check (joint VAT liability). Tested in haulierInvoices.test.ts.

export const INVOICE_STATUS_CHIP: Record<HaulierInvoiceStatus, StatusChip> = {
  DRAFT: { label: "Draft", tone: "", hint: "Entered, not matched yet" },
  MATCHED: { label: "Matched", tone: "i", hint: "Every line matches exactly" },
  NEEDS_APPROVAL: { label: "Needs approval", tone: "a", hint: "A line or the total differs — a manager approves it with a reason, or rejects it" },
  APPROVED: { label: "Approved", tone: "g", hint: "Approved for payment; the real cost is on the jobs" },
  BLOCKED: { label: "Blocked", tone: "r", hint: "Fails the VAT-register check — cannot be approved by anyone until fixed" },
  REJECTED: { label: "Rejected", tone: "r", hint: "Rejected by a manager, with a reason" },
};

export const INVOICE_STATUS_ORDER: HaulierInvoiceStatus[] = ["BLOCKED", "NEEDS_APPROVAL", "DRAFT", "MATCHED", "APPROVED", "REJECTED"];

export const TARGET_KIND_LABELS: Record<InvoiceCandidate["kind"], string> = { TRIP: "Trip", PARTNER_LEG: "Partner delivery" };


/** What a line is off by: invoiced − expected (expected is already net of claims); + = the haulier asks more. */
export const lineDifference = (invoiced: number | null, expected: number) => round2((invoiced ?? 0) - expected);

/** "+250 CZK" / "−100 CZK" / "Exact": the difference of a line or invoice in words. */
export function differenceText(difference: number, currency: string): string {
  const d = round2(difference);
  if (d === 0) return "Exact";
  return `${d > 0 ? "+" : ""}${formatMoney(d, currency)}`;
}

export interface EntryLine {
  target: InvoiceCandidate;
  invoiced: number | null;
  note: string;
}

export interface EntryHeader {
  invoiceNumber: string;
  issueDate: string | null;
  currency: "CZK" | "EUR";
  totalNet: number | null;
  vatAmount: number | null;
  totalGross: number | null;
  bankAccount: string;
}

/** The sum of the invoiced amounts of the lines. */
export const linesTotal = (lines: readonly EntryLine[]) => round2(lines.reduce((sum, l) => sum + (l.invoiced ?? 0), 0));

/** What the entry dialog shows before saving: the difference of every line and of the whole. */
export function entrySummary(lines: readonly EntryLine[], header: Pick<EntryHeader, "totalNet">) {
  const expected = round2(lines.reduce((sum, l) => sum + l.target.expected, 0));
  const invoiced = linesTotal(lines);
  const netDiffers = header.totalNet != null && round2(header.totalNet) !== invoiced;
  const difference = round2(invoiced - expected);
  return { expected, invoiced, difference, netDiffers, exact: difference === 0 && !netDiffers && lines.every((l) => lineDifference(l.invoiced, l.target.expected) === 0) };
}

/** Why an invoice cannot be saved yet, one line per problem. */
export function entryProblems(haulierCustomerId: string | null, header: EntryHeader, lines: readonly EntryLine[]): string[] {
  const out: string[] = [];
  if (!haulierCustomerId) out.push("Choose the haulier");
  if (!header.invoiceNumber.trim()) out.push("Enter the invoice number");
  if (!header.issueDate) out.push("Enter the issue date");
  if (!lines.length) out.push("Tick at least one trip or partner delivery");
  if (lines.some((l) => l.invoiced == null)) out.push("Enter the invoiced amount of every line");
  if (lines.some((l) => l.target.currency !== header.currency)) out.push(`Every line must be in ${header.currency}, the invoice currency`);
  if (header.totalNet == null || header.vatAmount == null || header.totalGross == null) out.push("Enter net, VAT and gross totals");
  else if (round2(header.totalNet + header.vatAmount) !== round2(header.totalGross)) out.push("Net + VAT does not give the gross total");
  const bank = bankAccountProblem(header.bankAccount);
  if (bank) out.push(bank);
  return out;
}

type ProfileChecks = Pick<HaulierDetail["profile"], "vatUnreliable" | "bankAccountPublished" | "bankAccounts" | "blocked">;

/**
 * What would block this invoice with this haulier, before it is saved (the server decides): the
 * same four checks as BLOCKED, each with how to fix it.
 */
export function vatBlockers(profile: ProfileChecks, bankAccount: string): { problem: string; fix: string }[] {
  const out: { problem: string; fix: string }[] = [];
  if (profile.blocked) out.push({ problem: "The haulier is blocked", fix: "A manager unblocks it on the haulier page once the reason is cleared" });
  if (profile.vatUnreliable) {
    out.push({
      problem: "The haulier is an unreliable VAT payer",
      fix: "Check the VAT register; switch “Unreliable VAT payer” off in the haulier's VAT register card only when it is no longer listed",
    });
  }
  if (!profile.bankAccountPublished) {
    out.push({
      problem: "The haulier's bank account is not published in the VAT register",
      fix: "Check the VAT register; switch on “Bank account published” in the VAT register card when it is",
    });
  }
  if (bankAccount.trim() && !isPublishedAccount(bankAccount, profile.bankAccounts)) {
    out.push({
      problem: "The invoice's bank account is not one of the haulier's published accounts",
      fix: "If the VAT register lists it, add it to “Published bank accounts” on the haulier page; otherwise ask the haulier for an invoice to a published account",
    });
  }
  return out;
}

/** Who may approve or reject an invoice now, and why not. */
export function invoiceDecisionState(invoice: Pick<HaulierInvoice, "status">, manager: boolean): { approve: string | null; reject: string | null } {
  const notManager = "Only a manager approves or rejects a haulier invoice";
  if (invoice.status === "BLOCKED") return { approve: "Blocked — fix the reasons below first; nobody can approve it until then", reject: manager ? null : notManager };
  if (invoice.status === "APPROVED" || invoice.status === "REJECTED") return { approve: "Already decided", reject: "Already decided" };
  if (invoice.status !== "NEEDS_APPROVAL") return { approve: "Nothing to approve — it matches exactly or is not matched yet", reject: manager ? null : notManager };
  if (!manager) return { approve: notManager, reject: notManager };
  return { approve: null, reject: null };
}

export const haulierInvoiceHref = (id: string) => `/trucking/haulier-invoices/${id}`;

/** The haulier page at its VAT register card, where the block reasons are fixed. */
export const haulierVatCardHref = (customerId: string) => `/trucking/hauliers/${customerId}#vat-register`;
