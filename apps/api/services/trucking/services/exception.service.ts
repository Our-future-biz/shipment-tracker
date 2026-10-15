import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { exceptionRepository } from "../repositories/exception.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import { legRepository } from "../repositories/leg.repository";
import { tripRepository } from "../repositories/trip.repository";
import { tariffRepository } from "../repositories/tariff.repository";
import { truckingOutboxRepository } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { ClaimTargetKind, TruckingExceptionRecord } from "../schemas/avizace.schema";
import type { DeliveryException, DeliveryExceptionListItem, ExceptionKind } from "../interfaces/avizace.interfaces";
import type { TariffScope } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { isUuid } from "../../../lib/uuid";
import {
  cleanDecision,
  cleanException,
  EXCEPTION_KINDS,
  EXCEPTION_LABEL,
  exceptionItem,
  exceptionLineText,
  freeMinutesFor,
  waitingCharge,
  type DecisionInput,
  type ExceptionInput,
} from "../lib/avizaceRules";
import { exceptionCosts } from "../lib/truckingLinks";
import { checkUpload } from "../lib/truckingFiles";
import { ltlLegsOf } from "../lib/ltlView";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { consignmentService, owed } from "./consignment.service";
import { internalBillingService } from "./internalBilling.service";
import { settingsService } from "./settings.service";
import { insertDocument, storeFile } from "./truckingDocument.service";
import { deliverDue } from "./truckingOutbox.service";

// Delivery exceptions (Phase 6 A): recorded by anyone, decided (charging the customer, claiming
// from the haulier or absorbing a cost: a manager), then closed. An open exception keeps its
// consignment from becoming ready to bill; closing the last one settles the job's Billing again.
// CHARGE_CUSTOMER adds a selling line to the job — or, for a job of another department, an
// EXCEPTION row of the internal charge. CLAIM_HAULIER records what is claimed against the trip
// or the partner's delivery (the haulier invoice match takes it off the expected cost).

export const EXCEPTION_CONFLICT = "The exception was changed by someone else. Reload and try again.";
const MAX_NOTE = 2000;

const scopeOf = (c: TruckingConsignmentRecord): TariffScope => (c.scope === "LTL" ? "LTL" : "FTL");

class ExceptionService {
  private async load(companyId: string, id: string): Promise<TruckingExceptionRecord> {
    const e = isUuid(id) ? await exceptionRepository.find(companyId, id) : null;
    if (!e) throw APIError.notFound("Exception not found");
    return e;
  }

  /** Any user: the exceptions of all consignments, newest first, with the consignment's ref, customer and job. */
  async list(actor: Actor, q: { open?: boolean; kind?: string; consignmentId?: string }): Promise<DeliveryExceptionListItem[]> {
    if (q.kind && !EXCEPTION_KINDS.includes(q.kind as ExceptionKind)) throw APIError.invalidArgument("Unknown exception kind");
    if (q.consignmentId && !isUuid(q.consignmentId)) return [];
    const rows = await exceptionRepository.list(actor.companyID, { open: q.open, kind: q.kind as ExceptionKind | undefined, consignmentId: q.consignmentId });
    const consignments = await consignmentRepository.findMany(actor.companyID, [...new Set(rows.map((r) => r.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    return rows.map((r) => {
      const c = byId.get(r.consignmentId);
      return { ...exceptionItem(r), consignmentRef: c?.ref ?? "", customerName: c?.customerName ?? "", jobNumber: c?.jobNumber ?? "" };
    });
  }

  /**
   * Any user. A failed delivery is refused once the delivery is stamped (void that stamp first: the
   * goods were not delivered). Waiting time without an amount is priced from the tariff's
   * WAITING_TIME surcharge when it has one (the customer's sell tariff; the Internal tariff for a
   * job billed internally).
   */
  async create(actor: Actor, consignmentId: string, input: ExceptionInput): Promise<DeliveryException> {
    const companyId = actor.companyID;
    const { c } = await consignmentService.load(companyId, consignmentId);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    const x = cleanException(input);
    if (x.legId) {
      const leg = await legRepository.find(companyId, x.legId);
      if (!leg || leg.consignmentId !== c.id || leg.kind === "DIRECT") throw APIError.invalidArgument("The leg is not one of this consignment's");
    }
    if (x.kind === "FAILED_DELIVERY" && c.deliveredAt) {
      throw APIError.failedPrecondition("The delivery is stamped: a manager voids the delivery stamp first (a failed delivery is not delivered)");
    }
    let { amount, currency } = x;
    if (x.kind === "WAITING_TIME" && amount === null) {
      const priced = await this.waitingFromTariff(companyId, c, x.waitingMinutes!);
      if (priced) ({ amount, currency } = priced);
    }
    const by = await userName(actor.userID);
    const row = await inTx(async (tx) => {
      const created = await exceptionRepository.insert(tx, {
        companyId,
        consignmentId: c.id,
        legId: x.legId,
        kind: x.kind,
        failedReason: x.failedReason,
        cause: x.cause,
        amount,
        currency,
        description: x.description,
        pieces: x.pieces,
        waitingMinutes: x.waitingMinutes,
        createdByUserId: actor.userID || null,
        createdBy: by,
      });
      await appendEvent(tx, companyId, {
        kind: "exception_created",
        consignmentId: c.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `${exceptionLineText(created)} recorded${amount !== null ? `, ${amount} ${currency}` : ""}${x.description ? `: ${x.description.slice(0, 200)}` : ""}`,
          facts: { exceptionId: created.id, kind: x.kind, failedReason: x.failedReason, cause: x.cause },
        },
      });
      return created;
    });
    return exceptionItem(row);
  }

  // The waiting charge from the tariff's WAITING_TIME surcharge; null when it cannot be worked out.
  private async waitingFromTariff(companyId: string, c: TruckingConsignmentRecord, minutes: number): Promise<{ amount: number; currency: "CZK" | "EUR" } | null> {
    const scope = scopeOf(c);
    let versionId: string | null = null;
    if (c.internal) {
      const tariffs = await tariffRepository.list(companyId, { side: "INTERNAL", scope });
      versionId = (await tariffRepository.bindingOn(companyId, tariffs.map((t) => t.id), c.pickupDate))[0]?.id ?? null;
    } else {
      versionId = c.sell?.tariffVersionId ?? null;
    }
    const version = versionId ? await tariffRepository.findVersion(companyId, versionId) : null;
    if (!version) return null;
    const tariff = await tariffRepository.find(companyId, version.tariffId);
    if (!tariff) return null;
    const { waitingFreeTime } = await settingsService.get(companyId);
    const surcharge = version.input.surcharges.find((s) => s.code === "WAITING_TIME") ?? null;
    const amount = waitingCharge(surcharge, minutes, freeMinutesFor(scope, waitingFreeTime), version.input.rounding.moneyStep);
    return amount === null ? null : { amount, currency: tariff.currency };
  }

  /**
   * Decides a pending exception once (a manager for CHARGE_CUSTOMER, CLAIM_HAULIER or absorbing
   * an amount above 0). Charging an internal job needs CZK; a claim needs a trip or a partner's
   * delivery to claim against.
   */
  async decide(actor: Actor, id: string, input: DecisionInput): Promise<DeliveryException> {
    const companyId = actor.companyID;
    const e = await this.load(companyId, id);
    if (e.closedAt) throw APIError.failedPrecondition("The exception is closed");
    if (e.decision !== "PENDING") throw APIError.failedPrecondition("The exception is already decided");
    const d = cleanDecision(input, e, isManager(actor.role));
    const { c } = await consignmentService.load(companyId, e.consignmentId);
    if (d.decision === "CHARGE_CUSTOMER" && c.internal && d.currency !== "CZK") {
      throw APIError.invalidArgument("The job is billed internally: give the amount in CZK");
    }
    const claim = d.decision === "CLAIM_HAULIER" ? await this.claimTarget(companyId, c, e) : null;
    if (d.decision === "CLAIM_HAULIER" && !claim) throw APIError.failedPrecondition("Nothing to claim against: the consignment has no trip or partner delivery");
    const by = await userName(actor.userID);
    const text = exceptionLineText(e);
    const row = await inTx(async (tx) => {
      const decided = await exceptionRepository.update(
        tx,
        companyId,
        e.id,
        {
          decision: d.decision,
          cause: d.cause,
          amount: d.amount,
          currency: d.currency,
          decidedAt: new Date(),
          decidedBy: by,
          decisionReason: d.reason,
          claimTargetKind: claim?.kind ?? null,
          claimTargetId: claim?.id ?? null,
          claimHaulierCustomerId: claim?.haulierCustomerId ?? null,
        },
        { version: e.version, pending: true, open: true },
      );
      if (!decided) throw APIError.aborted(EXCEPTION_CONFLICT);
      if (d.decision === "CHARGE_CUSTOMER") {
        if (c.internal) await internalBillingService.chargeException(tx, actor, c, decided, d.amount!, `${c.ref} ${text}`, by);
        else await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, c, "costs", exceptionCosts(decided, c.ref, text, d.amount!, d.currency))]);
      }
      await appendEvent(tx, companyId, {
        kind: "exception_decided",
        consignmentId: c.id,
        tripId: claim?.kind === "TRIP" ? claim.id : null,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { decision: { before: "PENDING", after: d.decision } },
          reason: d.reason,
          summary: `${text}: ${DECISION_TEXT[d.decision as keyof typeof DECISION_TEXT]}${d.amount ? ` ${d.amount} ${d.currency}` : ""}${c.internal && d.decision === "CHARGE_CUSTOMER" ? " (internal charge)" : ""}: ${d.reason}`,
          facts: { exceptionId: e.id, decision: d.decision, amount: d.amount, claimTarget: claim },
        },
      });
      return decided;
    });
    await deliverDue(c.id);
    return exceptionItem(row);
  }

  // What a claim is against: the exception's leg (its trip, or the partner's delivery), else the
  // FTL trip, else the LTL delivery leg's; null when there is nothing.
  private async claimTarget(companyId: string, c: TruckingConsignmentRecord, e: TruckingExceptionRecord): Promise<{ kind: ClaimTargetKind; id: string; haulierCustomerId: string } | null> {
    const legs = c.scope === "LTL" ? ltlLegsOf(c.id, await legRepository.forConsignments(companyId, [c.id])) : [];
    const leg = e.legId ? legs.find((l) => l.id === e.legId) : legs.find((l) => l.kind === "DELIVERY");
    const tripId = leg ? leg.tripId : c.tripId;
    if (tripId) {
      const trip = await tripRepository.find(companyId, tripId);
      return trip && !trip.cancelledAt ? { kind: "TRIP", id: trip.id, haulierCustomerId: trip.haulierCustomerId } : null;
    }
    if (leg?.buy && leg.haulierCustomerId) return { kind: "PARTNER_LEG", id: leg.id, haulierCustomerId: leg.haulierCustomerId };
    return null;
  }

  /** Any user, once decided. The job's Billing is settled again (this may have been the last open exception). */
  async close(actor: Actor, id: string, note: unknown): Promise<DeliveryException> {
    const companyId = actor.companyID;
    const e = await this.load(companyId, id);
    if (e.closedAt) throw APIError.failedPrecondition("The exception is already closed");
    if (e.decision === "PENDING") throw APIError.failedPrecondition("Decide the exception before closing it");
    const text = typeof note === "string" ? note.trim() : "";
    if (text.length > MAX_NOTE) throw APIError.invalidArgument(`The note can be at most ${MAX_NOTE} characters long`);
    const { c } = await consignmentService.load(companyId, e.consignmentId);
    const by = await userName(actor.userID);
    const row = await inTx(async (tx) => {
      const closed = await exceptionRepository.update(tx, companyId, e.id, { closedAt: new Date(), closedBy: by, closeNote: text }, { version: e.version, open: true });
      if (!closed) throw APIError.aborted(EXCEPTION_CONFLICT);
      await appendEvent(tx, companyId, {
        kind: "exception_closed",
        consignmentId: c.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `${exceptionLineText(e)} closed${text ? `: ${text.slice(0, 200)}` : ""}`, facts: { exceptionId: e.id } },
      });
      if (c.podReceivedAt && !c.cancelledAt) await consignmentService.settleBilling(tx, actor, c.shipmentId, c.id, by);
      return closed;
    });
    await deliverDue(c.id);
    return exceptionItem(row);
  }

  /** Any user: a photo or PDF (10 MB, the type from the bytes), kept with the consignment's documents. */
  async addPhoto(actor: Actor, id: string, input: { fileName: unknown; fileBase64: unknown }): Promise<DeliveryException> {
    const companyId = actor.companyID;
    const e = await this.load(companyId, id);
    const file = checkUpload(input.fileName, input.fileBase64, true);
    const by = await userName(actor.userID);
    const key = await storeFile(companyId, e.consignmentId, file);
    const row = await inTx(async (tx) => {
      const doc = await insertDocument(tx, companyId, e.consignmentId, file, key, { kind: "OTHER", source: "USER", userId: actor.userID || null, name: by });
      const updated = await exceptionRepository.update(tx, companyId, e.id, { photos: [...e.photos, { id: doc.id, fileName: doc.fileName }] }, { version: e.version });
      if (!updated) throw APIError.aborted(EXCEPTION_CONFLICT);
      await appendEvent(tx, companyId, {
        kind: "exception_photo_added",
        consignmentId: e.consignmentId,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: {}, summary: `Photo added to the ${EXCEPTION_LABEL[e.kind].toLowerCase()} exception: ${file.fileName}`, facts: { exceptionId: e.id, documentId: doc.id } },
      });
      return updated;
    });
    return exceptionItem(row);
  }
}

const DECISION_TEXT = { CHARGE_CUSTOMER: "charged to the customer", CLAIM_HAULIER: "claimed from the haulier", ABSORB: "absorbed" } as const;

export const exceptionService = new ExceptionService();
