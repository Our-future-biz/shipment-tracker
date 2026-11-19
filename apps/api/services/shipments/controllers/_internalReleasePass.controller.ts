import { api } from "encore.dev/api";
import type { MaxLen, MinLen } from "encore.dev/validate";
import { getAuthData } from "~encore/auth";
import { iso } from "../../../lib/db/serialize";
import type { ReleaseKind } from "../lib/prepaymentStop";
import { gateReleaseService } from "../services/gateRelease.service";

// Internal API of the Warehouse Concept gate (services/releasePayment there): its WH release of a job the
// prepayment stop holds, on the shipments' side (services/gateRelease.service). Called within the stamping
// person's own request, so the company and the user are theirs (auth), never sent.

interface ReleasePassUseRequest {
  shipmentId: string;
  kind: ReleaseKind;
  /**
   * The days the gate's own WH releases of this job wrote to Warehouse Released (its outbox rows sent): such a
   * day is the gate's, not a release in Shipments - a voided gate release never takes its day back.
   */
  gateDays?: string[];
}

/** The shipment's Warehouse Released already set: the day (YYYY-MM-DD) and who set it (an e-mail, "" when not known). */
interface WarehouseReleasedAnswer {
  date: string;
  by: string;
}

interface ReleasePassUseResponse {
  /** The approved request the release goes through on, now marked used; null when there is none, or none was used. */
  pass: { requestId: string; reason: string; usedAt: string } | null;
  /**
   * The shipment's Warehouse Released when it is set already (Y6): released in Shipments first, the gate does not
   * stop its WH release again - and no pass is used for it. Null when it is empty, or the day is the gate's own.
   */
  warehouseReleased: WarehouseReleasedAnswer | null;
}

/**
 * Uses an approved request to release this job (a pass), once: the gate's release then goes through on it - unless
 * the shipment's Warehouse Released is set already in Shipments, which is answered instead (nothing is used).
 */
export const _internalReleasePassUse = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/release-pass/use" },
  async ({ shipmentId, kind, gateDays }: ReleasePassUseRequest): Promise<ReleasePassUseResponse> => {
    const auth = getAuthData()!;
    const warehouseReleased = kind === "warehouse_released" ? await gateReleaseService.warehouseReleasedOf(auth.companyID, shipmentId, gateDays) : null;
    if (warehouseReleased) return { pass: null, warehouseReleased };
    const pass = await gateReleaseService.usePass(auth.companyID, auth.userID, shipmentId, kind);
    return { pass: pass ? { requestId: pass.requestId, reason: pass.reason, usedAt: iso(pass.usedAt) } : null, warehouseReleased: null };
  },
);

interface WarehouseReleasedRequest {
  shipmentId: string;
  /** The days the gate's own WH releases wrote (see ReleasePassUseRequest): not answered as Shipments'. */
  gateDays?: string[];
}

/**
 * The shipment's Warehouse Released, read before the gate's write sets it (Y6): a day set already - in Shipments,
 * by hand or on an approval - is not overwritten by the gate's release. A day the gate wrote itself is not answered.
 */
export const _internalWarehouseReleasedOf = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/warehouse-released" },
  async ({ shipmentId, gateDays }: WarehouseReleasedRequest): Promise<{ warehouseReleased: WarehouseReleasedAnswer | null }> => {
    const auth = getAuthData()!;
    return { warehouseReleased: await gateReleaseService.warehouseReleasedOf(auth.companyID, shipmentId, gateDays) };
  },
);

interface ReleasePassGiveBackRequest {
  requestId: string;
  /** The use to undo, as _internalReleasePassUse answered it. */
  usedAt: string;
  /**
   * Sent by the gate's outbox: matched by the moment of the use alone. The outbox may send as the company's
   * service identity once the user who stamped has left, so the person can't be matched.
   */
  byMomentOnly?: boolean;
  /**
   * The release was not made because somebody else's WH release of the same gate record was first: the job is
   * released, so the approval is closed as a release made another way closes one nobody used - not given back.
   */
  releasedMeanwhile?: boolean;
}

interface ReleasePassGiveBackResponse {
  givenBack: boolean;
  /**
   * Not given back and the approval still carries this use: a failure the gate shows. False when that use is
   * gone already (given back by an earlier delivery of the same row) - nothing is left to do.
   */
  stillUsed: boolean;
  /** The approval was closed instead of given back (releasedMeanwhile). */
  closed?: boolean;
}

/** Gives back a pass the gate used when its release was not made after all - or closes it, the job released meanwhile. */
export const _internalReleasePassGiveBack = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/release-pass/:requestId/give-back" },
  async ({ requestId, usedAt, byMomentOnly, releasedMeanwhile }: ReleasePassGiveBackRequest): Promise<ReleasePassGiveBackResponse> => {
    const auth = getAuthData()!;
    const at = new Date(usedAt);
    if (Number.isNaN(at.getTime())) return { givenBack: false, stillUsed: false };
    return gateReleaseService.giveBack(auth.companyID, auth.userID, requestId, at, byMomentOnly === true, releasedMeanwhile === true);
  },
);

interface ReleaseOverrideRecordRequest {
  shipmentId: string;
  kind: ReleaseKind;
  /** A manager's reason at the gate, or who asked and who approved (an approved request): as long as both can be. */
  reason: string & MinLen<1> & MaxLen<2000>;
  invoices: { number: string & MaxLen<200>; leftToPay: number; currency: string & MaxLen<10> }[];
  /** False when Invoicing could not be asked. */
  checked: boolean;
  /** The gate's outbox row that sends it: the same row delivered again records nothing more. */
  idempotencyKey?: string & MaxLen<100>;
}

/** Records on the shipment a release the gate let through on an unpaid prepayment job, as any override is. */
export const _internalReleaseOverrideRecord = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/release-override" },
  async ({ shipmentId, kind, reason, invoices, checked, idempotencyKey }: ReleaseOverrideRecordRequest): Promise<void> => {
    const auth = getAuthData()!;
    await gateReleaseService.recordOverride(auth.companyID, auth.userID, shipmentId, kind, { reason, invoices, checked }, idempotencyKey);
  },
);

interface ReleaseUncheckedRecordRequest {
  shipmentId: string;
  /** The gate's outbox row that sends it: the same row delivered again records nothing more. */
  idempotencyKey: string & MinLen<1> & MaxLen<100>;
  /**
   * Why it was not checked: Invoicing could not be asked ("invoicing", the default), or Invoicing could not hold the
   * work not yet invoiced against the customer's terms, the Customer Database not answering ("customerDatabase").
   */
  why?: "invoicing" | "customerDatabase";
}

/**
 * Records on the shipment a WH release the gate let through while whether the job is paid could not be checked
 * (Invoicing not asked and the customer not on prepayment by the Customer Database; or the Customer Database not
 * read for the work not invoiced yet): "Prepayment not checked" in its history and on its Tracking tab.
 */
export const _internalReleaseUncheckedRecord = api(
  { expose: false, auth: true, method: "POST", path: "/internal/shipments/:shipmentId/release-unchecked" },
  async ({ shipmentId, idempotencyKey, why }: ReleaseUncheckedRecordRequest): Promise<void> => {
    const auth = getAuthData()!;
    await gateReleaseService.recordUnchecked(auth.companyID, auth.userID, shipmentId, idempotencyKey, why);
  },
);
