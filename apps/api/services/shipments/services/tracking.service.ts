import { createHash } from "node:crypto";
import { db } from "../db/db";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import type { MasterJobTrackingHouse, ShipmentTracking, TrackingReadingPreview, TrackingVesselChange } from "../interfaces/interfaces";
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
  lastEventOf,
  recordRefusal,
  type TrackingKind,
  type TrackingSource,
} from "../lib/trackingEvents";
import { buildTracking, TRACKING_AUDIT_FIELDS } from "../lib/trackingTimeline";
import { CLOCK_EVENT_KINDS, FREE_TIME_FROM, clockApplies, clockOf } from "../lib/detentionClock";
import { documentEffect, lastFreeDayChangeOf, readingExternalId, readingPreview } from "../lib/trackingReading";
import type { ContainerRecord } from "../schemas/container.schema";
import { DETAILS_REFUSAL } from "../lib/shipmentEditRule";
import { userEmails } from "../lib/userEmails";
import { containerRepository } from "../repositories/container.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import { shipmentCustomerNoticeRepository } from "../repositories/shipmentCustomerNotice.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import type { ShipmentRecord } from "../schemas/shipment.schema";
import type { ShipmentTrackingEventRecord } from "../schemas/shipmentTrackingEvent.schema";
import { attachmentService } from "./attachment.service";
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

/** A fact of a read document a person chose to keep. */
export interface KeptFact {
  kind: string;
  occurredOn: string;
  place?: string;
  vessel?: string;
  note?: string;
}

/** The document itself, to file on the shipment. */
export interface KeptFile {
  fileName: string;
  fileType: string;
  contentBase64: string;
}

export interface KeptReading {
  facts: KeptFact[];
  file?: KeptFile;
  vesselChange?: TrackingVesselChange;
  /** The last free day a notice states, for the boxes chosen. */
  lastFreeDay?: { day: string; containerIds: string[] };
}

export interface FreeTimeInput {
  containerIds: string[];
  /** null: not known. */
  freeTimeDays: number | null;
  freeTimeFrom: string;
  /** The day the carrier stated; null: only counted. */
  lastFreeDay: string | null;
}

type FreeTimeValues = Partial<Pick<ContainerRecord, "freeTimeDays" | "freeTimeFrom" | "lastFreeDay">>;

const freeTimeText = (b: Pick<ContainerRecord, "freeTimeDays" | "freeTimeFrom" | "lastFreeDay">): string =>
  [b.freeTimeDays != null ? `${b.freeTimeDays} d from ${b.freeTimeFrom === "gate_out" ? "leaving the terminal" : "discharge"}` : "", b.lastFreeDay ? `carrier's date ${b.lastFreeDay}` : ""].filter(Boolean).join(", ");

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
    const [audit, events, notices, tasks, customsStatus, names, invoiced, mayChangeDetails, containers] = await Promise.all([
      shipmentAuditRepository.listByShipmentId(shipmentId, companyId, TRACKING_AUDIT_FIELDS, TRACKING_CHANGES_LIMIT + 1),
      shipmentTrackingEventRepository.listByShipmentId(shipmentId, companyId, TRACKING_EVENTS_LIMIT),
      shipmentCustomerNoticeRepository.listByShipmentId(shipmentId, companyId, TRACKING_NOTICES_LIMIT),
      shipmentTaskRepository.listByShipmentId(shipmentId, companyId),
      shipmentService.customsStatusOf(shipment, companyId),
      userEmails(),
      this.invoiced(shipmentId),
      shipmentService.mayChangeDetails(shipment, actor.userID, actor.role),
      containerRepository.listByShipmentId(shipmentId, companyId),
    ]);
    return buildTracking({
      containers,
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

  /** What a read document says about this shipment, for a person to look over. Nothing is kept yet. */
  async previewReading(shipmentId: string, companyId: string, extracted: Record<string, string>, now = new Date()): Promise<TrackingReadingPreview> {
    const shipment = await this.requireShipment(shipmentId, companyId);
    const [containers, events] = await Promise.all([containerRepository.listByShipmentId(shipmentId, companyId), shipmentTrackingEventRepository.listByShipmentId(shipmentId, companyId, TRACKING_EVENTS_LIMIT)]);
    const keptIds = new Set(events.filter((e) => e.source === "document").map((e) => e.externalId));
    const preview = readingPreview(extracted, shipment, containers.map((c) => c.containerNumber).filter(Boolean), keptIds, businessDay(now));
    return { ...preview, lastFreeDayChange: clockApplies(shipment) ? lastFreeDayChangeOf(extracted, containers.filter((c) => c.containerNumber)) : null };
  }

  /**
   * Keeps what a person chose of a read document: a source like any other, so ATA and ATD wait as
   * proposals and the rest goes by the rule. Reading the same document again adds nothing.
   */
  async keepReading(shipmentId: string, actor: TrackingActor, { facts, file, vesselChange, lastFreeDay }: KeptReading, now = new Date()): Promise<void> {
    const companyId = actor.companyID;
    const shipment = await this.requireShipment(shipmentId, companyId);
    if (!(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    const today = businessDay(now);
    for (const fact of facts) {
      if (!isRealYmd(fact.occurredOn)) throw APIError.invalidArgument("A fact's date must be a day as YYYY-MM-DD");
      const refusal = recordRefusal({ kind: fact.kind, occurredOn: fact.occurredOn, note: fact.note ?? "" }, shipment, today);
      if (refusal) throw APIError.invalidArgument(refusal);
    }
    // Vessel and voyage are a source's to set only while the actual departure is empty (D3).
    if (vesselChange && !shipment.actualDeparture) {
      if (shipment.masterJobId) await masterJobService.update(shipment.masterJobId, companyId, { ...vesselChange }, actor.userID);
      else await shipmentService.update(shipmentId, companyId, { ...vesselChange }, actor.userID, actor.role);
    }
    if (lastFreeDay) await this.writeFreeTime(shipmentId, actor, lastFreeDay.containerIds, { lastFreeDay: lastFreeDay.day });
    for (const fact of facts) {
      const kind = fact.kind as TrackingKind;
      const note = (fact.note ?? "").trim();
      const effect = documentEffect(kind, shipment, fact.occurredOn);
      if (effect.mode === "apply" && effectChanges(effect, shipment)) await this.applyField(shipment, effect.field, effect.value, actor);
      const details = {
        place: (fact.place ?? "").trim(),
        vessel: (fact.vessel ?? "").trim(),
        note,
        source: "document" as TrackingSource,
        recordedById: actor.userID,
        effect: effect.mode === "apply" ? ("applied" as const) : effect.mode === "propose" ? ("proposed" as const) : ("none" as const),
        effectField: effect.field,
        effectValue: effect.value,
        externalId: readingExternalId({ kind, occurredOn: fact.occurredOn, note }),
      };
      const same = effect.mode === "apply" ? await shipmentTrackingEventRepository.findSameDay(shipmentId, companyId, kind, fact.occurredOn) : null;
      if (same && isBareFact(same)) await shipmentTrackingEventRepository.change(same.id, companyId, details);
      else await shipmentTrackingEventRepository.addOnce({ ...details, companyId, shipmentId, kind, occurredOn: fact.occurredOn });
      const closes = effect.mode === "propose" ? undefined : EXCEPTIONS_CLOSED_BY[kind];
      if (closes) await shipmentTrackingEventRepository.resolveOpen(shipmentId, companyId, closes, actor.userID);
    }
    if (file) {
      const sha = createHash("sha256").update(file.contentBase64).digest("hex");
      await attachmentService.addFromModule(shipmentId, companyId, { ...file, documentType: "Carrier notice", sourceRef: `tracking-reading:${sha}` }, actor.userID);
    }
  }

  /** What the booking gives a shipment's boxes, or the last free day the carrier stated. By the details rule. */
  async setFreeTime(shipmentId: string, actor: TrackingActor, input: FreeTimeInput): Promise<void> {
    const shipment = await this.requireShipment(shipmentId, actor.companyID);
    if (!(await shipmentService.mayChangeDetails(shipment, actor.userID, actor.role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
    if (!clockApplies(shipment)) throw APIError.failedPrecondition("Only an import by sea or rail runs a free time clock");
    const { freeTimeDays, freeTimeFrom, lastFreeDay } = input;
    if (freeTimeDays !== null && (!Number.isInteger(freeTimeDays) || freeTimeDays < 0 || freeTimeDays > 365)) throw APIError.invalidArgument("Free days must be a whole number from 0 to 365");
    if (!(FREE_TIME_FROM as readonly string[]).includes(freeTimeFrom)) throw APIError.invalidArgument("Free time counts from discharge or from leaving the terminal");
    if (lastFreeDay !== null && !isRealYmd(lastFreeDay)) throw APIError.invalidArgument("The last free day must be a day as YYYY-MM-DD");
    await this.writeFreeTime(shipmentId, actor, input.containerIds, { freeTimeDays, freeTimeFrom, lastFreeDay });
  }

  /** Writes free time on the boxes, with who did it in the shipment's log. */
  private async writeFreeTime(shipmentId: string, actor: TrackingActor, containerIds: readonly string[], values: FreeTimeValues): Promise<void> {
    const companyId = actor.companyID;
    const boxes = await containerRepository.listByShipmentId(shipmentId, companyId);
    const chosen = containerIds.map((id) => boxes.find((b) => b.id === id));
    if (chosen.length === 0 || chosen.some((b) => !b)) throw APIError.invalidArgument("Choose the shipment's own containers");
    await db.transaction(async (tx) => {
      await containerRepository.setFreeTime(shipmentId, companyId, containerIds, values, tx);
      for (const box of chosen as ContainerRecord[]) {
        const before = freeTimeText(box);
        const after = freeTimeText({ ...box, ...values });
        if (before !== after) {
          await shipmentAuditRepository.create({ companyId, shipmentId, userId: actor.userID, field: "freeTime", oldValue: `${box.containerNumber}: ${before || "none"}`, newValue: `${box.containerNumber}: ${after || "none"}` }, tx);
        }
      }
    });
  }

  /** The last free day of each number, for the warehouse: the latest job with that box, unless the empty went back. */
  async freeTimeByContainer(companyId: string, numbers: readonly string[], now = new Date()): Promise<{ containerNumber: string; lastFreeDay: string }[]> {
    const seen = new Set<string>();
    const latest = (await containerRepository.byNumbers(numbers, companyId)).filter((row) => {
      if (seen.has(row.container.containerNumber)) return false;
      seen.add(row.container.containerNumber);
      return clockApplies(row);
    });
    const events = await shipmentTrackingEventRepository.ofKinds([...new Set(latest.map((r) => r.container.shipmentId))], companyId, CLOCK_EVENT_KINDS);
    const today = businessDay(now);
    return latest.flatMap(({ container }) => {
      const clock = clockOf(container, events.filter((e) => e.shipmentId === container.shipmentId), today);
      return clock.lastFreeDay && clock.state !== "returned" ? [{ containerNumber: container.containerNumber, lastFreeDay: clock.lastFreeDay }] : [];
    });
  }

  /** A master job's houses, each with where it stands: one look says which is behind. */
  async masterJobHouses(masterJobId: string, companyId: string): Promise<MasterJobTrackingHouse[]> {
    if (!(await masterJobRepository.getByIdForCompany(masterJobId, companyId))) throw APIError.notFound("Master job not found");
    const houses = await shipmentRepository.findByMasterJobId(masterJobId, companyId);
    const [latest, statuses] = await Promise.all([
      shipmentTrackingEventRepository.latestPerShipment(houses.map((h) => h.id), companyId),
      Promise.all(houses.map((h) => shipmentService.customsStatusOf(h, companyId))),
    ]);
    return houses
      .map((h, i) => ({
        shipmentId: h.id,
        jobNumber: h.jobNumber,
        customer: h.customer,
        departed: h.actualDeparture,
        arrived: h.actualArrival,
        customsCleared: statuses[i] === CUSTOMS_CLEARED,
        customsStatus: statuses[i]!,
        gateIn: h.warehouseReceivedDate,
        delivered: h.actualDeliveryDate,
        lastEvent: lastEventOf(h, latest.get(h.id) ?? null),
      }))
      .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber));
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

  /** Another module took back a fact it sent: it goes off the timeline, and a later one can take its place. */
  async voidFact(shipmentId: string, companyId: string, source: TrackingSource, externalId: string): Promise<void> {
    await this.requireShipment(shipmentId, companyId);
    await shipmentTrackingEventRepository.softDeleteByExternalId(shipmentId, companyId, source, externalId);
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
    if (event.source !== "user" && event.source !== "document") throw APIError.failedPrecondition("This came from another module: change it there");
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
