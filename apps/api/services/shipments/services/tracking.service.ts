import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { ShipmentTracking } from "../interfaces/interfaces";
import { businessDay, businessInstant, isRealYmd } from "../../../lib/businessDate";
import { MASTER_JOB_SYNCED_FIELDS } from "../lib/masterJobSync";
import { normalizeContainerNumber } from "../lib/cargoProjection";
import {
  CUSTOMS_CLEARED,
  EXCEPTIONS_CLOSED_BY,
  TICK_EVENTS,
  TRACKING_KINDS,
  effectChanges,
  effectOf,
  isDepartmentKind,
  isExceptionKind,
  isTrackingKind,
  recordRefusal,
  type TrackingKind,
  type TrackingSource,
} from "../lib/trackingEvents";
import { buildTracking, TRACKING_AUDIT_FIELDS } from "../lib/trackingTimeline";
import { DETAILS_REFUSAL } from "../lib/shipmentEditRule";
import { userEmails } from "../lib/userEmails";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import { shipmentCustomerNoticeRepository } from "../repositories/shipmentCustomerNotice.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";
import { commentService } from "./comment.service";
import { masterJobService } from "./masterJob.service";
import { shipmentService, type ShipmentUpdateData } from "./shipment.service";

/** How many logged changes the tab reads, newest first. */
export const TRACKING_CHANGES_LIMIT = 500;
/** How many stored events the tab reads, the latest first. */
export const TRACKING_EVENTS_LIMIT = 500;
/** How many notices to the customer the tab reads, the latest first. */
export const TRACKING_NOTICES_LIMIT = 200;

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;
const SYNCED_WITH_MASTER = new Set<string>(MASTER_JOB_SYNCED_FIELDS);

export interface TrackingActor {
  userID: string;
  companyID: string;
  role: string;
}

export interface RecordEventInput {
  kind: string;
  occurredOn: string;
  occurredTime?: string;
  place?: string;
  containerNumber?: string;
  note?: string;
  /** The checklist tick this event comes with. */
  taskKey?: string;
}

/** An event the app stored from a date alone, with nothing added by anyone yet. */
const isBareFact = (e: ShipmentTrackingEventRecord) => !e.note && !e.place && !e.containerNumber && !e.occurredAt;

class TrackingService {
  /** The shipment's Tracking tab: read from what it already holds. */
  async get(shipmentId: string, actor: TrackingActor, now = new Date()): Promise<ShipmentTracking> {
    const companyId = actor.companyID;
    const shipment = await this.requireShipment(shipmentId, companyId);
    const [audit, events, notices, tasks, customsStatus, names, invoiced, mayChangeDetails] = await Promise.all([
      shipmentAuditRepository.listByShipmentId(shipmentId, companyId, TRACKING_AUDIT_FIELDS, TRACKING_CHANGES_LIMIT + 1),
      shipmentTrackingEventRepository.listByShipmentId(shipmentId, companyId, TRACKING_EVENTS_LIMIT),
      shipmentCustomerNoticeRepository.listByShipmentId(shipmentId, companyId, TRACKING_NOTICES_LIMIT),
      shipmentTaskRepository.listByShipmentId(shipmentId, companyId),
      shipmentService.customsStatusOf(shipment, companyId),
      userEmails(),
      this.invoiced(shipmentId),
      shipmentService.mayChangeDetails(shipment, actor.userID, actor.role),
    ]);
    return buildTracking({
      shipment,
      customsStatus,
      audit: audit.slice(0, TRACKING_CHANGES_LIMIT),
      changesCapped: audit.length > TRACKING_CHANGES_LIMIT,
      events,
      notices,
      mayChangeDetails,
      tasks,
      names,
      invoiced,
      now,
    });
  }

  /**
   * A person records a dated fact. One that sets a shipment field goes through the normal update
   * first, so the edit rule, the invoice lock and the master job all apply, and what they refuse
   * leaves no event behind.
   */
  async record(shipmentId: string, actor: TrackingActor, input: RecordEventInput, now = new Date()): Promise<ShipmentTrackingEventRecord> {
    const companyId = actor.companyID;
    const shipment = await this.requireShipment(shipmentId, companyId);
    const note = (input.note ?? "").trim();
    if (!isRealYmd(input.occurredOn)) throw APIError.invalidArgument("The date must be a day as YYYY-MM-DD");
    const time = (input.occurredTime ?? "").trim();
    if (time && !HH_MM.test(time)) throw APIError.invalidArgument("The time must be HH:MM");
    const refusal = recordRefusal({ kind: input.kind, occurredOn: input.occurredOn, note }, shipment, businessDay(now));
    if (refusal) throw APIError.invalidArgument(refusal);
    const kind = input.kind as TrackingKind;
    if (input.taskKey !== undefined && TICK_EVENTS[input.taskKey] !== kind) throw APIError.invalidArgument("That task doesn't go with this event");
    await this.assertMayRecord(shipment, kind, actor);

    const effect = effectOf(kind, "user", shipment, input.occurredOn);
    if (effect.mode === "apply" && effectChanges(effect, shipment)) await this.applyField(shipment, effect.field, effect.value, actor);

    const details = {
      occurredAt: time ? businessInstant(input.occurredOn, time) : null,
      place: (input.place ?? "").trim(),
      containerNumber: normalizeContainerNumber(input.containerNumber ?? ""),
      note,
      source: "user" as TrackingSource,
      recordedById: actor.userID,
      effect: effect.mode === "apply" ? ("applied" as const) : ("none" as const),
      effectField: effect.field,
      effectValue: effect.value,
    };
    // The write above stored the bare fact: this is the same fact with its details.
    const same = effect.mode === "apply" ? await shipmentTrackingEventRepository.findSameDay(shipmentId, companyId, kind, input.occurredOn) : null;
    const row =
      (same && isBareFact(same) ? await shipmentTrackingEventRepository.change(same.id, companyId, details) : null) ??
      (await shipmentTrackingEventRepository.add({ ...details, companyId, shipmentId, kind, occurredOn: input.occurredOn }));

    const closes = EXCEPTIONS_CLOSED_BY[kind];
    if (closes) await shipmentTrackingEventRepository.resolveOpen(shipmentId, companyId, closes, actor.userID);
    if (input.taskKey) await shipmentTaskRepository.upsert(shipmentId, companyId, input.taskKey, true, actor.userID);
    if (isExceptionKind(kind)) await this.tellChat(shipment, companyId, actor.userID, { label: TRACKING_KINDS[kind].label, day: input.occurredOn, note });
    return row;
  }

  // The exception is recorded either way: a chat that can't be written must not lose it.
  private async tellChat(shipment: ShipmentRecord, companyId: string, authorId: string, exception: { label: string; day: string; note: string }): Promise<void> {
    try {
      await commentService.postExceptionNotice(shipment, companyId, authorId, exception);
    } catch (err) {
      log.warn(err, "tracking: the exception's chat line was not posted", { shipmentId: shipment.id });
    }
  }

  /**
   * A fact another module sends (Trucking's delivery advice, the POD): stored once per `externalId`,
   * so a retried delivery adds nothing, and it touches no date.
   */
  async addFact(shipmentId: string, companyId: string, userId: string, fact: { kind: TrackingKind; source: TrackingSource; occurredAt: Date; note: string; externalId: string }): Promise<void> {
    await this.requireShipment(shipmentId, companyId);
    await shipmentTrackingEventRepository.addOnce({
      companyId,
      shipmentId,
      kind: fact.kind,
      occurredOn: businessDay(fact.occurredAt),
      occurredAt: fact.occurredAt,
      source: fact.source,
      externalId: fact.externalId,
      recordedById: userId,
      note: fact.note,
    });
  }

  /** A person confirms the date a source proposed: only now does it reach the shipment. */
  async confirm(shipmentId: string, eventId: string, actor: TrackingActor): Promise<void> {
    const { shipment, event } = await this.proposal(shipmentId, eventId, actor);
    const kind = event.kind as TrackingKind;
    const day = event.effectValue ?? event.occurredOn;
    if (shipment[event.effectField as keyof ShipmentRecord] !== day) await this.applyField(shipment, event.effectField, day, actor);
    await shipmentTrackingEventRepository.change(event.id, actor.companyID, { effect: "applied", decidedById: actor.userID, decidedAt: new Date() });
    const closes = EXCEPTIONS_CLOSED_BY[kind];
    if (closes) await shipmentTrackingEventRepository.resolveOpen(shipmentId, actor.companyID, closes, actor.userID);
  }

  /** A person turns a proposed date down: the event stays on record, the shipment doesn't change. */
  async dismiss(shipmentId: string, eventId: string, actor: TrackingActor): Promise<void> {
    const { event } = await this.proposal(shipmentId, eventId, actor);
    await shipmentTrackingEventRepository.change(event.id, actor.companyID, { effect: "dismissed", decidedById: actor.userID, decidedAt: new Date() });
  }

  /** Closes an exception by hand. */
  async resolve(shipmentId: string, eventId: string, actor: TrackingActor): Promise<void> {
    const { shipment, event } = await this.event(shipmentId, eventId, actor.companyID);
    if (!isExceptionKind(event.kind)) throw APIError.failedPrecondition("Only an exception can be closed");
    await this.assertMayRecord(shipment, event.kind as TrackingKind, actor);
    if (event.resolvedAt) return;
    await shipmentTrackingEventRepository.change(event.id, actor.companyID, { resolvedAt: new Date(), resolvedById: actor.userID });
  }

  /**
   * Takes back what somebody recorded by mistake, with a reason kept in the audit log. A date it
   * set is cleared if it is still that date, under the same refusals as any other change of it.
   */
  async strike(shipmentId: string, eventId: string, reason: string, actor: TrackingActor): Promise<void> {
    const { shipment, event } = await this.event(shipmentId, eventId, actor.companyID);
    const why = reason.trim();
    if (!why) throw APIError.invalidArgument("Say why it is struck");
    if (event.source !== "user") throw APIError.failedPrecondition("This came from another module: change it there");
    if (!isTrackingKind(event.kind)) throw APIError.failedPrecondition("This event can't be struck");
    await this.assertMayRecord(shipment, event.kind, actor);
    const setActual = event.effect === "applied" && event.effectValue && event.effectField.startsWith("actual");
    if (setActual && shipment[event.effectField as keyof ShipmentRecord] === event.effectValue) {
      await this.applyField(shipment, event.effectField, "", actor);
    }
    await shipmentTrackingEventRepository.softDeleteForCompany(event.id, actor.companyID);
    await shipmentAuditRepository.create({
      companyId: actor.companyID,
      shipmentId,
      userId: actor.userID,
      field: `trackingEvent:${event.kind}`,
      oldValue: event.occurredOn,
      newValue: `struck: ${why}`,
    });
  }

  private async requireShipment(shipmentId: string, companyId: string): Promise<ShipmentRecord> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    return shipment;
  }

  private async event(shipmentId: string, eventId: string, companyId: string) {
    const shipment = await this.requireShipment(shipmentId, companyId);
    const event = await shipmentTrackingEventRepository.getLive(eventId, shipmentId, companyId);
    if (!event) throw APIError.notFound("Tracking event not found");
    return { shipment, event };
  }

  private async proposal(shipmentId: string, eventId: string, actor: TrackingActor) {
    const found = await this.event(shipmentId, eventId, actor.companyID);
    if (found.event.effect !== "proposed") throw APIError.failedPrecondition("This date isn't waiting to be confirmed");
    if (!(await shipmentService.mayChangeDetails(found.shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    return found;
  }

  // Customs keeps its own kinds up, as it does its own fields; the rest takes the details rule.
  private async assertMayRecord(shipment: ShipmentRecord, kind: TrackingKind, actor: TrackingActor): Promise<void> {
    if (isDepartmentKind(kind)) return;
    if (!(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
  }

  // A date a master job carries is written on the master job, which writes it onto every house:
  // written on one house, its next save would undo it.
  private async applyField(shipment: ShipmentRecord, field: string, day: string | null, actor: TrackingActor): Promise<void> {
    const value = field === "customsStatus" ? CUSTOMS_CLEARED : (day ?? "");
    if (shipment.masterJobId && SYNCED_WITH_MASTER.has(field)) {
      await masterJobService.update(shipment.masterJobId, actor.companyID, { [field]: value }, actor.userID);
      return;
    }
    await shipmentService.update(shipment.id, actor.companyID, { [field]: value } as ShipmentUpdateData, actor.userID, actor.role);
  }

  // Invoicing being away must not take the timeline with it; the tab then just doesn't say.
  private async invoiced(shipmentId: string): Promise<boolean | null> {
    try {
      return await shipmentService.isInvoiced(shipmentId);
    } catch (err) {
      log.warn(err, "tracking: could not ask whether the job is invoiced", { shipmentId });
      return null;
    }
  }
}

export const trackingService = new TrackingService();
