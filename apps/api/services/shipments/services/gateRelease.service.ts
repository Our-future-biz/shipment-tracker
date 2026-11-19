import log from "encore.dev/log";
import { APIError } from "encore.dev/api";
import { businessDay } from "../../../lib/businessDate";
import { companyUsers, userEmailOf } from "../../../lib/companyUsers";
import { isUuid } from "../../../lib/uuid";
import { db } from "../db/db";
import { releaseGoesBackToGateDay } from "../lib/gateReleasedDay";
import { overrideLine, type OverrideInvoice, type ReleaseKind, type ReleaseOverride } from "../lib/prepaymentStop";
import { PREPAYMENT_UNCHECKED_FIELD } from "../lib/releaseUnchecked";
import { approvedReason, passDecidedSince, RELEASE_REQUEST_FIELD, unusedLine, WHAT_OF_KIND } from "../lib/releaseRequest";
import type { ReleaseRequestWhat } from "../interfaces/interfaces";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentReleaseOverrideRepository } from "../repositories/shipmentReleaseOverride.repository";
import { shipmentReleaseRequestRepository as requests } from "../repositories/shipmentReleaseRequest.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { shipmentTrackingEventTable } from "../schemas/shipmentTrackingEvent.schema";

/** The history field of a release of an unpaid prepayment job let through: the one the shipment service writes. */
export const PAYMENT_OVERRIDE_FIELD = "paymentOverride";

/** An approved request the gate's release goes through on: what it is recorded with, and the use to give back. */
export interface UsedPass {
  requestId: string;
  /** Who asked and why, who approved and why: the override's reason (lib/releaseRequest approvedReason). */
  reason: string;
  usedAt: Date;
}

/** The shipment's history field of Warehouse Released (the field's own name, as every field edit is kept). */
export const WAREHOUSE_RELEASED_FIELD = "warehouseReleasedDate";

/** The shipment's Warehouse Released, already set: the day, and who set it (an e-mail, "" when not known). */
export interface WarehouseReleased {
  date: string;
  by: string;
}

/**
 * The line of a WH release the gate let through without knowing whether the job is paid: Invoicing could not be
 * asked, and the Customer Database says the customer is not on prepayment (mock test council P17). Said in the
 * job's history under the field Shipments' own such releases use (lib/releaseUnchecked), and on its Tracking tab.
 */
export const GATE_PREPAYMENT_UNCHECKED_LINE =
  "Prepayment not checked: Invoicing could not be asked at the gate's WH release - let through as the customer is not on prepayment in the Customer Database";

/**
 * The line of a WH release the gate let through while the work not yet invoiced could not be held against the
 * customer's terms (the Customer Database not answering, mock test council P10): as Shipments' own such release says
 * it (lib/releaseUnchecked PREPAYMENT_UNCHECKED_LINE), at the gate's WH release.
 */
export const GATE_UNINVOICED_UNCHECKED_LINE = "Prepayment not checked: the Customer Database could not be read at the gate's WH release";

/** Why the gate's WH release was let through unchecked: Invoicing not asked (P17), or the Customer Database not read (P10). */
export type GateUncheckedWhy = "invoicing" | "customerDatabase";

/**
 * Whether a gate's give-back took the use back; `stillUsed` false when nothing of that use was left to take back.
 * `closed`: the approval was closed instead, the job being released meanwhile by somebody else's WH release.
 */
export interface GiveBackOutcome {
  givenBack: boolean;
  stillUsed: boolean;
  closed?: true;
}

/**
 * The days the gate's own WH releases wrote to Warehouse Released (its outbox rows that may have written them): such
 * a day is not a release made in Shipments. Kept to well-formed days, and few.
 */
export function gateWrittenDays(days: readonly string[] | undefined): Set<string> {
  return new Set(
    (days ?? [])
      .map((d) => d.trim())
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(0, 50),
  );
}

/** How many lines of Warehouse Released's history are read back to the write that set it from empty: a release date is seldom edited. */
const RELEASED_HISTORY_READ = 50;

/** The Tracking note's external id of a "Prepayment not checked" line sent by the gate's outbox row `key`. */
export const uncheckedNoteId = (key: string) => `prepayment-unchecked:${key.trim()}`;

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
//   - the shipment's Warehouse Released, when it is set already (Y6): released in Shipments first - by a
//     manager's reason, or on an approval used in Stock - the gate neither stops its WH release again nor uses
//     a pass for it, and its write leaves the day as it is.
class GateReleaseService {
  /**
   * The shipment's Warehouse Released as it stands, with who set it (by e-mail, "" when not known); null when it
   * is empty or the shipment is not this company's. Set in Shipments first - by a manager's reason, or on an
   * approval used in Stock - the gate's WH release is not stopped again, and its write does not change it
   * (mock test council Y6, warehouseConcept services/releasePayment). Throws when it can't be read: the gate then
   * keeps the stop.
   * A day the gate's own release wrote (`gateDays`, from its outbox) is not Shipments' and answers null: a WH
   * release voided at the gate never takes its day back, and the next release of the job must not ride on it -
   * past the stop, with no approval used, "released in Shipments" by the clerk who stamped the voided one.
   * Nor is a day edited in Shipments from such a day (review): an edit of a day already set is not stopped, so the
   * day it leaves is still the gate's release - only a day set from empty in Shipments (where the stop holds it) is
   * a release made there. Told by the field's history (lib/gateReleasedDay releaseGoesBackToGateDay).
   */
  async warehouseReleasedOf(companyId: string, shipmentId: string, gateDays?: readonly string[]): Promise<WarehouseReleased | null> {
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
    const date = (shipment?.warehouseReleasedDate ?? "").trim();
    const gate = gateWrittenDays(gateDays);
    if (!shipment || !date || gate.has(date)) return null;
    const lines = await shipmentAuditRepository.listByShipmentId(shipmentId, companyId, [WAREHOUSE_RELEASED_FIELD], RELEASED_HISTORY_READ);
    if (releaseGoesBackToGateDay(lines, gate, lines.length < RELEASED_HISTORY_READ)) return null;
    const [line] = lines;
    return { date, by: line ? await this.actorOf(line.userId) : "" };
  }

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

  /**
   * Gives back a pass usePass marked used, when the gate's release was not made after all. Matched by the person
   * and the moment; `byMomentOnly` (the gate's outbox) by the moment alone, as the outbox may send as the
   * company's service identity once the user who stamped has left. `stillUsed` says whether a give-back that
   * changed nothing left the approval used - a failure - or found that use gone already (given back before).
   * `releasedMeanwhile`: the release was not made because somebody else's WH release of the gate record was first -
   * the job is released, so the approval is closed (`closed`) as a release made another way closes one nobody used,
   * with its line in the history, rather than given back to let a later release through no manager approved (review).
   */
  async giveBack(companyId: string, userId: string, requestId: string, usedAt: Date, byMomentOnly = false, releasedMeanwhile = false): Promise<GiveBackOutcome> {
    if (!isUuid(requestId)) return { givenBack: false, stillUsed: false };
    const used = { usedAt, ...(byMomentOnly ? {} : { usedById: userId }) };
    if (releasedMeanwhile) {
      const line = (what: ReleaseRequestWhat) => ({ userId, field: RELEASE_REQUEST_FIELD, oldValue: null, newValue: unusedLine(what) });
      if (await requests.closeUsed(requestId, companyId, used, new Date(), line)) return { givenBack: false, stillUsed: false, closed: true };
      return { givenBack: false, stillUsed: await requests.stillUsedAt(requestId, companyId, usedAt) };
    }
    const givenBack = await requests.giveBack(requestId, companyId, used, new Date());
    return { givenBack, stillUsed: givenBack ? false : await requests.stillUsedAt(requestId, companyId, usedAt) };
  }

  /**
   * Records a release the gate let through on an unpaid prepayment job: the override row, the line in the
   * shipment's history and the note on its Tracking tab, together or not at all. The one releasing is named as
   * who did it; a manager who approved it on request is named in the reason.
   * `idempotencyKey` (the gate's outbox row): its delivery is at least once, and a failed row may be sent again -
   * the same key records nothing more, neither the row nor its line and note.
   */
  async recordOverride(companyId: string, userId: string, shipmentId: string, kind: ReleaseKind, override: GateOverride, idempotencyKey?: string): Promise<void> {
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
    if (!shipment) throw APIError.notFound("Shipment not found");
    const by = await this.actorOf(userId);
    const record: ReleaseOverride = { reason: override.reason.trim(), invoices: override.invoices, checked: override.checked };
    const line = overrideLine(kind, record);
    const key = (idempotencyKey ?? "").trim();
    await db.transaction(async (tx) => {
      const row = { companyId, shipmentId, kind, reason: record.reason, invoices: record.invoices, checked: record.checked, byUserId: userId, by };
      if (key) {
        // Recorded already by an earlier delivery of the same outbox row: nothing more is written.
        if (!(await shipmentReleaseOverrideRepository.createOnce(tx, { ...row, idempotencyKey: key }))) return;
      } else await shipmentReleaseOverrideRepository.create(tx, row);
      await shipmentAuditRepository.create({ companyId, shipmentId, userId, field: PAYMENT_OVERRIDE_FIELD, oldValue: null, newValue: line }, tx);
      await shipmentTrackingEventRepository.add(
        { companyId, shipmentId, kind: "note", occurredOn: businessDay(new Date()), source: "warehouse", recordedById: userId, note: line },
        tx,
      );
    });
  }

  /**
   * Records a WH release the gate let through while whether the job is paid could not be checked (Invoicing not
   * asked, the customer not on prepayment by the Customer Database; or, `why` "customerDatabase", the work not yet
   * invoiced not held against the customer's terms): the job's history line and its Tracking note, together or not
   * at all - as Shipments says so of its own such releases. `idempotencyKey` (the gate's outbox row) is the note's
   * own id, so a delivery sent again writes nothing more.
   */
  async recordUnchecked(companyId: string, userId: string, shipmentId: string, idempotencyKey: string, why: GateUncheckedWhy = "invoicing"): Promise<void> {
    const shipment = isUuid(shipmentId) ? await shipmentRepository.getByIdForCompany(shipmentId, companyId) : null;
    if (!shipment) throw APIError.notFound("Shipment not found");
    const line = why === "customerDatabase" ? GATE_UNINVOICED_UNCHECKED_LINE : GATE_PREPAYMENT_UNCHECKED_LINE;
    await db.transaction(async (tx) => {
      // The note first, by its external id: the table's unique (company, shipment, source, external id) tells a
      // delivery sent again, which then writes no second history line either.
      const notes = await tx
        .insert(shipmentTrackingEventTable)
        .values({
          companyId,
          shipmentId,
          kind: "note",
          occurredOn: businessDay(new Date()),
          source: "warehouse",
          externalId: uncheckedNoteId(idempotencyKey),
          recordedById: userId,
          note: line,
        })
        .onConflictDoNothing()
        .returning({ id: shipmentTrackingEventTable.id });
      if (!notes.length) return;
      await shipmentAuditRepository.create({ companyId, shipmentId, userId, field: PREPAYMENT_UNCHECKED_FIELD, oldValue: null, newValue: line }, tx);
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
