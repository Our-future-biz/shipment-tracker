// The prepayment stop (Accounts Receivable step 7, D20's later yes, 18 Nov 2026): a job on prepayment is not
// released before it is paid. When the job has an invoice with something left to pay and that invoice is on
// prepayment - or, since the mock test council (L3, 19 Nov 2026), its customer is on prepayment and it has selling
// not yet invoiced (Invoicing's _internalReleaseCheck says prepaymentUnpaid either way), a person's House BoL release and a person's
// Warehouse Released set from empty are refused for a user; a manager may release it all the same with a reason
// (at least 3 characters), which is recorded. When Invoicing can't be asked, the release is refused too - and a
// manager may still release it with a reason, recorded as unchecked. The overdue-debt warning stays a warning
// only, and the app's own writes (Trucking, the Warehouse Concept gate, Invoicing) are never stopped.
// A release a manager approved on request (lib/releaseRequest: a pass, used once) goes through for whoever makes
// it, as the override it is: the same record, with who asked and who approved as its reason.
// Pure: the shipment service asks Invoicing and writes the record.

import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";

export type ReleaseKind = "house_bol" | "warehouse_released";

/** An invoice left to pay when a manager released the job: as recorded with the release. */
export interface OverrideInvoice {
  number: string;
  leftToPay: number;
  currency: string;
}

/** What Invoicing answers about the job's payment (its _internalReleaseCheck), as far as the stop needs it. */
export interface PaymentCheck {
  prepaymentUnpaid: boolean;
  unpaid: readonly { number: string; leftToPay: number; currency: string }[];
  /** The owed invoices on prepayment, the ones the stop is about (else every owed invoice is named). */
  prepaymentInvoices?: readonly { number: string; leftToPay: number; currency: string }[];
  /**
   * The customer is on prepayment and the job has selling not yet invoiced (mock test council L3, 19 Nov 2026): the
   * amounts per currency. The stop holds the release before any invoice too (prepaymentUnpaid is then true).
   */
  prepaymentUninvoiced?: readonly { currency: string; amount: number }[];
}

/** How the work not yet invoiced is named in the stop's words and recorded with an override, as one invoice line is. */
export const NOT_INVOICED = "Not invoiced yet";

/**
 * The invoices a stop names and an override records: the prepayment ones, not the job's other owed invoices; and the
 * work not yet invoiced, one line per currency (recorded as an invoice line is, its number "Not invoiced yet").
 */
const stopInvoices = (check: PaymentCheck | null): OverrideInvoice[] => [
  ...(check?.prepaymentInvoices ?? check?.unpaid ?? []).map((i) => ({ number: i.number, leftToPay: i.leftToPay, currency: i.currency })),
  ...(check?.prepaymentUninvoiced ?? []).map((a) => ({ number: NOT_INVOICED, leftToPay: a.amount, currency: a.currency })),
];

/** A manager's release of an unpaid prepayment job, to be recorded with the release. */
export interface ReleaseOverride {
  reason: string;
  invoices: OverrideInvoice[];
  /** False when Invoicing could not be asked. */
  checked: boolean;
  /**
   * Set when it is not a manager's own reason that lets the release through but a request a manager approved
   * (lib/releaseRequest): that request is marked used in the release's write turn - and when it can't be (used
   * or gone meanwhile), the stop refuses after all, with `refusal`.
   */
  pass?: { requestId: string; refusal: string };
}

/** What the stop decides: refused (with why), or let through - with the override to record when a manager overrode it. */
export type StopVerdict = { refusal: string } | { override: ReleaseOverride | null };

export const MIN_OVERRIDE_REASON = 3;
export const PAYMENT_UNCHECKED = "Whether the job is paid could not be checked: try again in a moment";
/** A write that set Warehouse Released from empty, made on a row that has changed in between: asked again. */
export const RELEASE_CHANGED_MEANWHILE = "This shipment's Warehouse Released was changed meanwhile: open it again and retry";

const WHAT: Record<ReleaseKind, string> = {
  house_bol: "The House BoL can't be released",
  warehouse_released: "Warehouse Released can't be set",
};

const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const invoiceWords = (invoices: readonly OverrideInvoice[]) =>
  invoices
    .map((i) => (i.number === NOT_INVOICED ? `${money(i.leftToPay)} ${i.currency} not invoiced yet` : `${i.number} (${money(i.leftToPay)} ${i.currency} left to pay)`))
    .join(", ");

/** Whether this write sets Warehouse Released from empty: the dates as they are and as the write leaves them. */
export function setsWarehouseRelease(
  existing: { warehouseReleasedDate?: string | null },
  data: { warehouseReleasedDate?: string | null },
): boolean {
  if (!("warehouseReleasedDate" in data)) return false;
  const before = (existing.warehouseReleasedDate ?? "").trim();
  const after = (data.warehouseReleasedDate ?? "").trim();
  return !before && !!after;
}

/**
 * Whether the release goes through. `check` is Invoicing's answer, null when it could not be asked; `role` the
 * person's; `reason` what a manager sent (paymentOverrideReason). A job that is not on unpaid prepayment is never
 * stopped, and a reason sent with it is not recorded.
 */
export function prepaymentStop(kind: ReleaseKind, check: PaymentCheck | null, role: string, reason: string | undefined): StopVerdict {
  if (check && !check.prepaymentUnpaid) return { override: null };
  const manager = canDecideQuoteInquiry(role);
  const given = (reason ?? "").trim();
  const invoices = stopInvoices(check);
  // Nothing invoiced on prepayment yet (L3): the job is not invoiced, rather than not paid.
  const onlyUninvoiced = invoices.length > 0 && invoices.every((i) => i.number === NOT_INVOICED);
  const why = check
    ? `${WHAT[kind]}: the job is on prepayment and ${onlyUninvoiced ? "not invoiced and paid yet" : "not paid"} - ${invoices.length ? invoiceWords(invoices) : "an invoice is left to pay"}.`
    : `${PAYMENT_UNCHECKED}.`;
  if (!manager) return { refusal: `${why} A manager can release it with a reason` };
  if (given.length < MIN_OVERRIDE_REASON) {
    return { refusal: `${why} As a manager you can release it all the same: give a reason (at least ${MIN_OVERRIDE_REASON} characters)` };
  }
  return { override: { reason: given, invoices, checked: !!check } };
}

/**
 * The override an approved request stands for, when the stop would refuse (`refusal`): recorded as a manager's
 * own is, with the invoices left to pay as they are now and `reason` naming who asked and who approved.
 */
export function passOverride(check: PaymentCheck | null, pass: { requestId: string; reason: string }, refusal: string): ReleaseOverride {
  const invoices = stopInvoices(check);
  return { reason: pass.reason, invoices, checked: !!check, pass: { requestId: pass.requestId, refusal } };
}

/** The line the release leaves in the shipment's history and on its Tracking tab. */
export function overrideLine(kind: ReleaseKind, override: ReleaseOverride): string {
  const what = kind === "house_bol" ? "House BoL released" : "Warehouse Released set";
  const notInvoiced = override.invoices.length > 0 && override.invoices.every((i) => i.number === NOT_INVOICED);
  const state = override.checked ? (override.invoices.length ? `${notInvoiced ? "not invoiced" : "unpaid"}: ${invoiceWords(override.invoices)}` : "unpaid") : "payment not checked";
  return `${what} on prepayment (${state}) - reason: ${override.reason}`;
}
