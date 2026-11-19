import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { businessDay } from "../../../lib/businessDate";
import { companyUsers, userEmailOf } from "../../../lib/companyUsers";
import { isUuid } from "../../../lib/uuid";
import { db } from "../db/db";
import { overrideLine, type OverrideInvoice, type ReleaseKind, type ReleaseOverride } from "../lib/prepaymentStop";
import { approvedReason, passDecidedSince, WHAT_OF_KIND } from "../lib/releaseRequest";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentReleaseOverrideRepository } from "../repositories/shipmentReleaseOverride.repository";
import { shipmentReleaseRequestRepository as requests } from "../repositories/shipmentReleaseRequest.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";

/** The history field of a release of an unpaid prepayment job let through: the one the shipment service writes. */
export const PAYMENT_OVERRIDE_FIELD = "paymentOverride";

/** An approved request the gate's release goes through on: what it is recorded with, and the use to give back. */
export interface UsedPass {
  requestId: string;
  /** Who asked and why, who approved and why: the override's reason (lib/releaseRequest approvedReason). */
  reason: string;
  usedAt: Date;
}

/** A release of an unpaid prepayment job the gate let through, as the shipment records one. */
export interface GateOverride {
  reason: string;
  invoices: OverrideInvoice[];
  checked: boolean;
}

// The Warehouse Concept gate's WH release sets the shipment's Warehouse Released through its outbox, as the app's
// own write - which the prepayment stop never holds, so the gate holds it itself (warehouseConcept
// services/releasePayment). Two things only the shipments' database knows are done here for the gate, as the
// shipment service does them for a person's release (shipment.service releaseGate / recordOverride):
//   - an approved request (lib/releaseRequest: a pass, used once within 7 days) lets the gate's release through
//     too. The gate's record is in another database, so the pass can't be used in the release's own transaction:
//     it is marked used first, by the same conditional update (repository use()), and given back when the gate's
//     write then stamps nothing. Used first, never after: a pass withdrawn or used meanwhile refuses the release
//     rather than let it out on nothing.
//   - the release let through - by a manager's reason at the gate, or by a pass - is recorded on the shipment as
//     any override is: the override row, the history line and the Tracking note, in one transaction. Written with
//     the repositories the shipment service uses, in its line's own words (lib/prepaymentStop overrideLine);
//     recordOverride itself is the shipment service's private step of a person's write turn and is not moved.
class GateReleaseService {
  /**
   * Marks the newest usable approval of this shipment's release used by `userId`, at once; null when there is
   * none - or it was used or withdrawn in between: the gate then refuses as it would without one.
   */
  async usePass(companyId: string, userId: string, shipmentId: string, kind: ReleaseKind, now = new Date()): Promise<UsedPass | null> {
    if (!isUuid(shipmentId)) return null;
    const pass = await requests.usablePass(companyId, shipmentId, WHAT_OF_KIND[kind], passDecidedSince(now));
    if (!pass) return null;
    const used = await requests.use(db, pass.id, companyId, { usedAt: now, usedById: userId, usedByName: await this.actorOf(userId) }, passDecidedSince(now));
    return used ? { requestId: pass.id, reason: approvedReason(pass, pass.decidedByName, pass.comment), usedAt: now } : null;
  }

  /** Gives back a pass usePass marked used, when the gate's release was not made after all. Whether it was. */
  async giveBack(companyId: string, userId: string, requestId: string, usedAt: Date): Promise<boolean> {
    if (!isUuid(requestId)) return false;
    return requests.giveBack(requestId, companyId, { usedAt, usedById: userId }, new Date());
  }

  /**
   * Records a release the gate let through on an unpaid prepayment job: the override row, the line in the
   * shipment's history and the note on its Tracking tab, together or not at all. The one releasing is named as
   * who did it; a manager who approved it on request is named in the reason.
   */
  async recordOverride(companyId: string, userId: string, shipmentId: string, kind: ReleaseKind, override: GateOverride): Promise<void> {
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
    if (!shipment) throw APIError.notFound("Shipment not found");
    const by = await this.actorOf(userId);
    const record: ReleaseOverride = { reason: override.reason.trim(), invoices: override.invoices, checked: override.checked };
    const line = overrideLine(kind, record);
    await db.transaction(async (tx) => {
      await shipmentReleaseOverrideRepository.create(tx, { companyId, shipmentId, kind, reason: record.reason, invoices: record.invoices, checked: record.checked, byUserId: userId, by });
      await shipmentAuditRepository.create({ companyId, shipmentId, userId, field: PAYMENT_OVERRIDE_FIELD, oldValue: null, newValue: line }, tx);
      await shipmentTrackingEventRepository.add(
        { companyId, shipmentId, kind: "note", occurredOn: businessDay(new Date()), source: "warehouse", recordedById: userId, note: line },
        tx,
      );
    });
  }

  // Who released, by e-mail as the shipment service names the one releasing (its actorOf): "" when not known.
  private async actorOf(userId: string): Promise<string> {
    const email = await userEmailOf(userId).catch(() => "");
    if (email) return email;
    try {
      return (await companyUsers()).find((u) => u.id === userId)?.email ?? "";
    } catch (err) {
      log.warn(err, "acting user not resolved", { userId });
      return "";
    }
  }
}

export const gateReleaseService = new GateReleaseService();
