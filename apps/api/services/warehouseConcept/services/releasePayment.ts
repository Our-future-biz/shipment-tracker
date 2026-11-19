import log from "encore.dev/log";
import { invoicing, shipments } from "~encore/clients";
import type { GateEvent } from "../interfaces/gate.interfaces";
import { isManager } from "./users";

// The prepayment stop at the gate (mock test council L4, 19 Nov 2026): the WH release of a job on prepayment
// that is not paid is stopped as a person's Warehouse Released is in Shipments (shipments lib/prepaymentStop) -
// the WH release is what sets it, through the outbox, as the app's own write that Shipments never stops. A
// plain user is refused; a manager may let the cargo out with a reason (at least 3 characters), recorded on the
// gate record. When Invoicing can't be asked, the release is refused too, and a manager may still let it out
// with a reason, recorded as unchecked. Invoicing's answer is the one the shipment service asks
// (_internalReleaseCheck). The sentences are the shipments' own, so the screens tell a stop from any other
// refusal the same way (web lib/paymentWarnings releaseStopOf).
//
// As in Shipments, a release a manager approved on request (shipments lib/releaseRequest: a pass, used once
// within 7 days) lets the release through for whoever makes it, recorded as the override it is with who asked and
// who approved as its reason (gateReleasePass). And a release let through - by a manager's reason or by a pass -
// is recorded on the shipment too, as any override is (recordOnShipment), not only in the gate record's history.
//
// The wording is a copy of shipments lib/prepaymentStop's (the not-invoiced lines of L3 with it): services here
// share code through apps/api/lib only, never one service's lib in another. A shipments test holds the two to
// the same words (shipments tests/gateReleaseWords.test).

/** What Invoicing answers about the job's payment, as far as the stop needs it. */
export interface GatePaymentCheck {
  prepaymentUnpaid: boolean;
  unpaid: readonly { number: string; leftToPay: number; currency: string }[];
  /** The owed invoices on prepayment, the ones the stop is about (else every owed invoice is named). */
  prepaymentInvoices?: readonly { number: string; leftToPay: number; currency: string }[];
  /**
   * The customer is on prepayment and the job has selling not yet invoiced (mock test council L3): the amounts
   * per currency. The stop holds the release before any invoice too (prepaymentUnpaid is then true).
   */
  prepaymentUninvoiced?: readonly { currency: string; amount: number }[];
}

export interface GateOverrideInvoice {
  number: string;
  leftToPay: number;
  currency: string;
}

/** A manager's WH release of an unpaid prepayment job: recorded on the gate record with the release. */
export interface GateReleaseOverride {
  reason: string;
  invoices: GateOverrideInvoice[];
  /** False when Invoicing could not be asked. */
  checked: boolean;
  /** Set when an approved request lets it through, not a manager's own reason: the use, to give back if the release is not made. */
  pass?: { requestId: string; usedAt: string };
}

export type GateStopVerdict = { refusal: string } | { override: GateReleaseOverride | null };

export const MIN_OVERRIDE_REASON = 3;
/** The event kind of a manager's release of an unpaid prepayment job, in the gate record's history. */
export const PAYMENT_OVERRIDE_EVENT = "paymentOverride";
/** How the work not yet invoiced is named in the stop's words and recorded with an override (shipments' NOT_INVOICED). */
export const NOT_INVOICED = "Not invoiced yet";

const WHAT = "The WH release can't be stamped";
const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const invoiceWords = (invoices: readonly GateOverrideInvoice[]) =>
  invoices
    .map((i) => (i.number === NOT_INVOICED ? `${money(i.leftToPay)} ${i.currency} not invoiced yet` : `${i.number} (${money(i.leftToPay)} ${i.currency} left to pay)`))
    .join(", ");
// The prepayment invoices left to pay, and the work not yet invoiced, one line per currency.
const stopInvoices = (check: GatePaymentCheck | null): GateOverrideInvoice[] => [
  ...(check?.prepaymentInvoices ?? check?.unpaid ?? []).map((i) => ({ number: i.number, leftToPay: i.leftToPay, currency: i.currency })),
  ...(check?.prepaymentUninvoiced ?? []).map((a) => ({ number: NOT_INVOICED, leftToPay: a.amount, currency: a.currency })),
];
// Nothing invoiced on prepayment yet (L3): the job is not invoiced, rather than not paid.
const onlyUninvoiced = (invoices: readonly GateOverrideInvoice[]) => invoices.length > 0 && invoices.every((i) => i.number === NOT_INVOICED);

/**
 * Whether the WH release goes through. `check` is Invoicing's answer, null when it could not be asked; `role` the
 * stamping person's; `reason` what a manager sent. A job not on unpaid prepayment is never stopped, and a reason
 * sent with it is not recorded.
 */
export function gateReleaseStop(check: GatePaymentCheck | null, role: string, reason: string | undefined): GateStopVerdict {
  if (check && !check.prepaymentUnpaid) return { override: null };
  const given = (reason ?? "").trim();
  const invoices = stopInvoices(check);
  const why = check
    ? `${WHAT}: the job is on prepayment and ${onlyUninvoiced(invoices) ? "not invoiced and paid yet" : "not paid"} - ${invoices.length ? invoiceWords(invoices) : "an invoice is left to pay"}.`
    : "Whether the job is paid could not be checked: try again in a moment.";
  if (!isManager(role)) return { refusal: `${why} A manager can release it with a reason` };
  if (given.length < MIN_OVERRIDE_REASON) {
    return { refusal: `${why} As a manager you can release it all the same: give a reason (at least ${MIN_OVERRIDE_REASON} characters)` };
  }
  return { override: { reason: given, invoices, checked: !!check } };
}

/** The override an approved request stands for: as a manager's own, with the invoices as they are now. */
export function gatePassOverride(check: GatePaymentCheck | null, pass: { requestId: string; reason: string; usedAt: string }): GateReleaseOverride {
  return { reason: pass.reason, invoices: stopInvoices(check), checked: !!check, pass: { requestId: pass.requestId, usedAt: pass.usedAt } };
}

/** The line the release leaves in the gate record's history: as the shipment's own override line reads. */
export function gateOverrideEvent(override: GateReleaseOverride, at: string, by: string): GateEvent {
  const state = override.checked
    ? override.invoices.length
      ? `${onlyUninvoiced(override.invoices) ? "not invoiced" : "unpaid"}: ${invoiceWords(override.invoices)}`
      : "unpaid"
    : "payment not checked";
  return { kind: PAYMENT_OVERRIDE_EVENT, label: `WH release on prepayment (${state}) - reason: ${override.reason}`, at, by };
}

/** Invoicing's word on whether the job is paid, as the stamping person asks it; null when it can't be asked. */
export async function gatePaymentCheck(shipmentId: string): Promise<GatePaymentCheck | null> {
  try {
    return await invoicing._internalReleaseCheck({ shipmentId });
  } catch (err) {
    log.warn(err, "warehouse: whether the job is paid not checked for its WH release", { shipmentId });
    return null;
  }
}

/**
 * The stop would refuse: an approved request to release the job lets it through all the same, marked used in
 * Shipments now - before the release is written, so a pass withdrawn or used by somebody else in between refuses
 * it instead of letting it out on nothing. Null when there is no pass, or Shipments could not be asked: the
 * refusal then stands, as in Shipments when its read of the passes fails.
 */
export async function gateReleasePass(shipmentId: string, check: GatePaymentCheck | null): Promise<GateReleaseOverride | null> {
  try {
    const { pass } = await shipments._internalReleasePassUse({ shipmentId, kind: "warehouse_released" });
    return pass ? gatePassOverride(check, pass) : null;
  } catch (err) {
    log.warn(err, "warehouse: the approved release requests of the job could not be used", { shipmentId });
    return null;
  }
}

/** The release a pass was used for was not made (the stamp lost a race, or its write failed): the pass is given back. */
export async function giveBackPass(override: GateReleaseOverride | null): Promise<void> {
  if (!override?.pass) return;
  try {
    await shipments._internalReleasePassGiveBack({ requestId: override.pass.requestId, usedAt: override.pass.usedAt });
  } catch (err) {
    // Not given back: the approval reads used, and the user asks a manager again. Logged to be put right by hand.
    log.error(err, "warehouse: an approved release request used for a WH release that was not made could not be given back", { requestId: override.pass.requestId });
  }
}

/**
 * Records on the shipment the release the gate let through - the override row, its history line and Tracking
 * note, as Shipments records any override - after the release is written. Never throws: the release is made,
 * and the gate record keeps its own line of it; what could not be written is logged.
 */
export async function recordOnShipment(shipmentId: string, override: GateReleaseOverride): Promise<void> {
  try {
    await shipments._internalReleaseOverrideRecord({
      shipmentId,
      kind: "warehouse_released",
      reason: override.reason,
      invoices: override.invoices,
      checked: override.checked,
    });
  } catch (err) {
    log.error(err, "warehouse: a WH release on prepayment was not recorded on the shipment", { shipmentId, reason: override.reason });
  }
}
