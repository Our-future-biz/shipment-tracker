import log from "encore.dev/log";
import { customers, invoicing, shipments } from "~encore/clients";
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
// is recorded on the shipment too, as any override is, not only in the gate record's history: through the gate's
// shipment outbox, retried (n27, overrideOutboxPayload).
//
// A job Shipments released first - its Warehouse Released set by a manager's reason, or on an approval used in
// Stock - is not stopped again at the gate, and the gate's write leaves its day as it is (Y6, releasedInShipments).
// When Invoicing can't be asked, the customer's payment terms in the Customer Database decide: only a prepayment
// customer's job is stopped then (P17, customerOnPrepayment) - and one let through says on the gate record and on
// the shipment that its payment was not checked. A job with no customer is stopped then, as nothing tells its terms.
// A day on the shipment the gate's own release wrote (its outbox) is never taken for a release in Shipments: a
// voided gate release leaves its day there, and the next release of the job runs the stop again.
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

/** Why the stop holds a job Invoicing could not check: it can't be asked now (try again), or the job has no customer. */
export type UncheckedWhy = "notAsked" | "noCustomer";

// Both begin with the shipments' words of an unchecked stop (web lib/paymentWarnings STOP_UNCHECKED), so the
// screens offer a manager the reason field for either.
const UNCHECKED_WORDS: Record<UncheckedWhy, string> = {
  notAsked: "Whether the job is paid could not be checked: try again in a moment.",
  noCustomer: "Whether the job is paid could not be checked, and the job has no customer whose payment terms could tell: give the job its customer in Shipments.",
};

/**
 * Whether the WH release goes through. `check` is Invoicing's answer, null when it could not be asked; `role` the
 * stamping person's; `reason` what a manager sent. A job not on unpaid prepayment is never stopped, and a reason
 * sent with it is not recorded. `unchecked` words the refusal of a job Invoicing could not check.
 */
export function gateReleaseStop(check: GatePaymentCheck | null, role: string, reason: string | undefined, unchecked: UncheckedWhy = "notAsked"): GateStopVerdict {
  if (check && !check.prepaymentUnpaid) return { override: null };
  const given = (reason ?? "").trim();
  const invoices = stopInvoices(check);
  const why = check
    ? `${WHAT}: the job is on prepayment and ${onlyUninvoiced(invoices) ? "not invoiced and paid yet" : "not paid"} - ${invoices.length ? invoiceWords(invoices) : "an invoice is left to pay"}.`
    : UNCHECKED_WORDS[unchecked];
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

/** Payment terms that are prepayment: a copy of invoicing lib/receivables isPrepayment (services share code through apps/api/lib only). */
export const isPrepaymentTerms = (paymentTerms: string | null | undefined): boolean => /prepay/i.test(paymentTerms ?? "");

/**
 * When Invoicing can't be asked (mock test council P17): whether the job's customer is on prepayment, by its payment
 * terms in the Customer Database - only such a customer's job is stopped then. A customer the Customer Database no
 * longer has is not on prepayment. "noCustomer" for a job with no customer: nothing tells its terms, so it is
 * stopped as one that can't be checked - never let through on nothing. Null when the job or its customer can't be
 * read: the stop then refuses, as it did before.
 */
export async function customerOnPrepayment(shipmentId: string): Promise<boolean | "noCustomer" | null> {
  try {
    const { shipments: [job] = [] } = await shipments._internalShipmentBasics({ ids: [shipmentId] });
    if (!job) return null;
    if (!job.customerId) return "noCustomer";
    const { customers: [customer] = [] } = await customers._internalCustomerReceivableFacts({ ids: [job.customerId] });
    return isPrepaymentTerms(customer?.paymentTerms);
  } catch (err) {
    log.warn(err, "warehouse: the customer's payment terms could not be read for a WH release Invoicing could not check", { shipmentId });
    return null;
  }
}

/**
 * The prepayment stop of the gate's WH release as a whole: Invoicing's check, and when Invoicing can't be asked
 * the customer's terms (P17) - a customer not on prepayment is never stopped then, but the release is `unchecked`:
 * the gate record and the shipment say that its payment was not checked. A job with no customer is stopped as
 * unchecked. `check` is Invoicing's answer (null when not had), for the override's record.
 */
export async function gateReleaseVerdict(
  shipmentId: string,
  role: string,
  reason: string | undefined,
): Promise<{ check: GatePaymentCheck | null; verdict: GateStopVerdict; unchecked?: true }> {
  const check = await gatePaymentCheck(shipmentId);
  if (check) return { check, verdict: gateReleaseStop(check, role, reason) };
  const terms = await customerOnPrepayment(shipmentId);
  if (terms === false) return { check, verdict: { override: null }, unchecked: true };
  return { check, verdict: gateReleaseStop(check, role, reason, terms === "noCustomer" ? "noCustomer" : "notAsked") };
}

/** The event kind of a WH release let through while its payment could not be checked, in the gate record's history. */
export const PAYMENT_UNCHECKED_EVENT = "paymentNotChecked";

/** The gate record's line of such a release (P17): said with the release, as Shipments says it of its own. */
export function paymentUncheckedEvent(at: string, by: string): GateEvent {
  return {
    kind: PAYMENT_UNCHECKED_EVENT,
    label: "WH release: payment not checked",
    at,
    by,
    detail: "Invoicing could not be asked - let through as the customer is not on prepayment in the Customer Database",
  };
}

// The "Prepayment not checked" line goes to the shipment as an "override" row of the outbox (its kinds are fixed
// by the table's check): marked by its payload, and sent to Shipments' own call for it (shipmentOutbox sendRow).
const UNCHECKED_NOTE = "prepaymentUnchecked";

/** The outbox payload of the "Prepayment not checked" line to record on the shipment. */
export const uncheckedOutboxPayload = (): Record<string, string> => ({ note: UNCHECKED_NOTE });

/** Whether an "override" row of the outbox is the "Prepayment not checked" line rather than an override. */
export const isUncheckedPayload = (payload: Record<string, string>): boolean => payload.note === UNCHECKED_NOTE;

/** The shipment's Warehouse Released, set already in Shipments (Y6): the day (YYYY-MM-DD) and who set it ("" when not known). */
export interface ReleasedInShipments {
  date: string;
  by: string;
}

/** The event kind of a WH release whose job Shipments had released already, in the gate record's history. */
export const RELEASED_IN_SHIPMENTS_EVENT = "releasedInShipments";

/**
 * The shipment's Warehouse Released before the gate's WH release is written (Y6): set already - in Shipments, by a
 * manager's reason or on an approval used in Stock - the gate neither stops the release again nor uses an approval
 * for it, and its write leaves the day as it is. Null when it is empty; undefined when Shipments could not be asked:
 * the stop then stands, and the day is written as before. `gateDays`: the days the gate's own releases of the job
 * wrote (its outbox) - such a day is not Shipments' (a voided gate release never takes its day back), so the stop
 * runs again.
 */
export async function releasedInShipments(shipmentId: string, gateDays: readonly string[] = []): Promise<ReleasedInShipments | null | undefined> {
  try {
    return (await shipments._internalWarehouseReleasedOf({ shipmentId, gateDays: [...gateDays] })).warehouseReleased;
  } catch (err) {
    log.warn(err, "warehouse: the shipment's Warehouse Released could not be read for its WH release", { shipmentId });
    return undefined;
  }
}

/**
 * The payload of a "released" outbox row as it is to be sent: without its Warehouse Released when the shipment has
 * a day set in Shipments - set there while the row waited in the outbox, or before a výdej gate-out stamped again
 * after a void. The gate's write is the app's own and would overwrite it, so the day set there stays (Y6).
 * `released` is the shipment's day as Shipments answers it, asked with the days the gate's own releases wrote (so
 * one of those is not answered); undefined when it could not be asked - the day is then sent as before. `kept` is
 * the day kept, null when none.
 */
export function releasedPayloadToSend(
  payload: Record<string, string>,
  released: ReleasedInShipments | null | undefined,
): { payload: Record<string, string>; kept: ReleasedInShipments | null } {
  if (!payload.warehouseReleasedDate || !released) return { payload, kept: null };
  const rest = { ...payload };
  delete rest.warehouseReleasedDate;
  return { payload: rest, kept: released };
}

/** "18.11.2026" of a YYYY-MM-DD day. */
const dmy = (day: string) => (/^\d{4}-\d{2}-\d{2}/.test(day) ? `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}` : day);

/** The gate record's line of such a release: "Released in Shipments on 18.11.2026 by eva@firma.cz". */
export function releasedInShipmentsEvent(released: ReleasedInShipments, at: string, by: string): GateEvent {
  const who = released.by.trim();
  return { kind: RELEASED_IN_SHIPMENTS_EVENT, label: `Released in Shipments on ${dmy(released.date)}${who ? ` by ${who}` : ""}`, at, by };
}

/** What Shipments answers when the stop would refuse the release: an approval used for it, or the job released there meanwhile. */
export interface GatePassAnswer {
  /** The override an approved request stands for, now used; null when there is none. */
  override: GateReleaseOverride | null;
  /** The shipment's Warehouse Released set already (Y6): no approval was used, and the stop is not to hold. */
  released: ReleasedInShipments | null;
}

/**
 * The stop would hold the release: an approved request to release the job lets it through all the same, marked
 * used in Shipments now - before the release is written, so a pass withdrawn or used by somebody else in between
 * refuses it instead of letting it out on nothing. Shipments answers the job's Warehouse Released too when it was
 * set meanwhile: then nothing is used and the stop does not hold (Y6). Null when Shipments could not be asked: the
 * refusal then stands, as in Shipments when its read of the passes fails. `gateDays` as for releasedInShipments.
 */
export async function gateReleasePass(shipmentId: string, check: GatePaymentCheck | null, gateDays: readonly string[] = []): Promise<GatePassAnswer | null> {
  try {
    const { pass, warehouseReleased } = await shipments._internalReleasePassUse({ shipmentId, kind: "warehouse_released", gateDays: [...gateDays] });
    return { override: pass ? gatePassOverride(check, pass) : null, released: warehouseReleased ?? null };
  } catch (err) {
    log.warn(err, "warehouse: the approved release requests of the job could not be used", { shipmentId });
    return null;
  }
}

/**
 * The release a pass was used for was not made (the stamp lost a race, or its write failed): the pass is given back
 * at once. What the outbox can't take this way (services/gateMovement passBackOwed) is the fallback that calls here.
 */
export async function giveBackPass(override: GateReleaseOverride | null): Promise<void> {
  if (!override?.pass) return;
  try {
    const answer = await shipments._internalReleasePassGiveBack({ requestId: override.pass.requestId, usedAt: override.pass.usedAt });
    // Not given back, and the approval still carries this use: it stays used, to be put right by hand.
    if (!answer.givenBack && answer.stillUsed !== false) {
      log.error("warehouse: an approved release request used for a WH release that was not made stays used", { requestId: override.pass.requestId });
    }
  } catch (err) {
    // Not given back: the approval reads used, and the user asks a manager again. Logged to be put right by hand.
    log.error(err, "warehouse: an approved release request used for a WH release that was not made could not be given back", { requestId: override.pass.requestId });
  }
}

// The override recorded on the shipment and an approval given back go through the gate's shipment outbox (n27): in
// the stamp's own transaction, the override ahead of the "released" row - so the shipment's history has the
// override line first, and the write that sets Warehouse Released then finds the approval used, not one to close
// unused - and retried as the dates are. The outbox payload is a map of strings: the invoices go as JSON.

/** The outbox payload of the override to record on the shipment. */
export function overrideOutboxPayload(override: GateReleaseOverride): Record<string, string> {
  return { reason: override.reason, invoices: JSON.stringify(override.invoices), checked: override.checked ? "true" : "false" };
}

/** The override as Shipments records it, from its outbox payload. */
export function overrideOfPayload(payload: Record<string, string>): { reason: string; invoices: GateOverrideInvoice[]; checked: boolean } {
  let invoices: GateOverrideInvoice[] = [];
  try {
    const parsed: unknown = JSON.parse(payload.invoices ?? "[]");
    if (Array.isArray(parsed)) {
      invoices = parsed
        .filter((i): i is GateOverrideInvoice => !!i && typeof i === "object" && typeof i.number === "string" && typeof i.leftToPay === "number" && typeof i.currency === "string")
        .map((i) => ({ number: i.number, leftToPay: i.leftToPay, currency: i.currency }));
    }
  } catch {
    // Not JSON: recorded with no invoice named rather than not at all.
  }
  return { reason: payload.reason ?? "", invoices, checked: payload.checked === "true" };
}

/** The outbox payload of an approval to give back, null when the release used none. */
export const passBackPayload = (override: GateReleaseOverride | null): Record<string, string> | null =>
  override?.pass ? { requestId: override.pass.requestId, usedAt: override.pass.usedAt } : null;

/**
 * The approval to give back, from its outbox payload - matched in Shipments by the moment of its use alone: the
 * outbox may send as the company's service identity once the user who stamped has left ("Send again").
 */
export const passBackOfPayload = (payload: Record<string, string>): { requestId: string; usedAt: string; byMomentOnly: true } => ({
  requestId: payload.requestId ?? "",
  usedAt: payload.usedAt ?? "",
  byMomentOnly: true,
});
