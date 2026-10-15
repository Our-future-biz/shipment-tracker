import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { haulierRepository } from "../repositories/haulier.repository";
import { truckingOutboxRepository, type TruckingOutboxInput } from "../repositories/truckingOutbox.repository";
import { appendEvent, listEvents } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { ConsignmentDetail, PricedSide, PriceSnapshot, TripDetail, TripListItem, TripPriceInput, TripStatus } from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { cleanPrice, cleanReason, consignmentStatus, marginOf, normalisePlate, truckingRefYear } from "../lib/consignmentRules";
import { eventItem, factsOf, tripDetail, tripListItem, type HaulierAssessment, type TripLoadView } from "../lib/consignmentView";
import { capacityOf, tripFill } from "../lib/ltlRules";
import { buyCosts, noCosts, plannedUpdate, tripSourceRef } from "../lib/truckingLinks";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { assess, haulierService, toProfile } from "./haulier.service";
import { consignmentService, manualSnapshot, owed, rateRequestOf, snapshotOf } from "./consignment.service";
import { rateService } from "./rate.service";
import { settingsService } from "./settings.service";
import { deliverDue } from "./truckingOutbox.service";
import { ltlTrips } from "./ltlTrips";

// FTL trips: one consignment on one truck of a subcontracted haulier. The haulier is the
// engine's first candidate (preferred lane, then cheapest) unless the user picks another - which
// is logged; a blocked haulier is refused with its issues. The buy price is the haulier's tariff
// price or an agreed price with the reason.

export const TRIP_CONFLICT = "The trip was changed by someone else. Reload and try again.";
const bad = (message: string) => APIError.invalidArgument(message);
const MAX_TEXT = 100;

export interface TripCreateInput {
  consignmentId: string;
  /** null = the engine's first candidate */
  haulierCustomerId: string | null;
  vehicleTypeCode: string | null;
  price: TripPriceInput;
}

export interface TripUpdateInput {
  vehicleTypeCode: string | null;
  tractorPlate: string;
  trailerPlate: string;
  driverName: string;
  driverPhone: string;
  version: number;
}

const text = (v: unknown, what: string): string => {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length > MAX_TEXT) throw bad(`${what} can be at most ${MAX_TEXT} characters long`);
  return s;
};

class TripService {
  // ---- reading -----------------------------------------------------------------------------------

  async load(companyId: string, id: string): Promise<TruckingTripRecord> {
    const trip = isUuid(id) ? await tripRepository.find(companyId, id) : null;
    if (!trip) throw APIError.notFound("Trip not found");
    return trip;
  }

  /** Status and issues of the trips' hauliers today. */
  async haulierAssessments(companyId: string, ids: string[]): Promise<Map<string, HaulierAssessment>> {
    const stored = await haulierRepository.findMany(companyId, [...new Set(ids)]);
    const byId = new Map(stored.map((s) => [s.profile.customerId, toProfile(s)]));
    const day = businessDay(new Date());
    return new Map(ids.map((id) => [id, assess(byId.get(id) ?? null, day)]));
  }

  async get(actor: Actor, id: string): Promise<TripDetail> {
    const companyId = actor.companyID;
    const trip = await this.load(companyId, id);
    const [assessments, link, events, settings] = await Promise.all([
      this.haulierAssessments(companyId, [trip.haulierCustomerId]),
      tripRepository.liveLink(companyId, trip.id),
      listEvents(companyId, { tripId: trip.id }),
      settingsService.get(companyId),
    ]);
    let consignments: { id: string; ref: string }[];
    let load: TripLoadView;
    if (trip.kind === "FTL") {
      const c = await consignmentRepository.findByTrip(companyId, trip.id);
      const capacity = capacityOf(settings.vehicleTypes.find((v) => v.code === trip.vehicleTypeCode) ?? null);
      consignments = c ? [c] : [];
      load = { legs: [], capacity, fill: tripFill(c ? [c.load] : [], capacity), warnings: [] };
    } else {
      const view = (await ltlTrips.loads(companyId, [trip], settings)).get(trip.id)!;
      consignments = view.consignments;
      load = view;
    }
    return tripDetail(trip, consignments, assessments.get(trip.haulierCustomerId)!, link, events.map(eventItem), load);
  }

  async list(actor: Actor, q: { status?: TripStatus; search?: string }): Promise<TripListItem[]> {
    const trips = await tripRepository.list(actor.companyID, { status: q.status });
    const settings = await settingsService.get(actor.companyID);
    const [consignments, assessments, loads] = await Promise.all([
      consignmentRepository.findByTrips(actor.companyID, trips.filter((t) => t.kind === "FTL").map((t) => t.id)),
      this.haulierAssessments(actor.companyID, trips.map((t) => t.haulierCustomerId)),
      ltlTrips.loads(actor.companyID, trips.filter((t) => t.kind !== "FTL"), settings),
    ]);
    const ofTrip = new Map<string, { id: string; ref: string }[]>();
    const loadOf = new Map<string, Pick<TripLoadView, "fill" | "warnings">>();
    for (const c of consignments) ofTrip.set(c.tripId!, [...(ofTrip.get(c.tripId!) ?? []), { id: c.id, ref: c.ref }]);
    for (const [tripId, view] of loads) {
      ofTrip.set(tripId, view.consignments);
      loadOf.set(tripId, view);
    }
    // An FTL trip's fill is its consignment's load against the vehicle type, as on the trip page.
    const ftlLoad = (t: TruckingTripRecord): Pick<TripLoadView, "fill" | "warnings"> => {
      const capacity = capacityOf(settings.vehicleTypes.find((v) => v.code === t.vehicleTypeCode) ?? null);
      return { fill: tripFill(consignments.filter((c) => c.tripId === t.id).map((c) => c.load), capacity), warnings: [] };
    };
    const search = (q.search ?? "").trim().toLowerCase();
    return trips
      .map((t) => tripListItem(t, ofTrip.get(t.id) ?? [], assessments.get(t.haulierCustomerId)!, null, loadOf.get(t.id) ?? ftlLoad(t)))
      .filter((t) => !search || [t.ref, t.haulierName, t.tractorPlate, t.trailerPlate, t.driverName, ...t.consignmentRefs].some((v) => v.toLowerCase().includes(search)));
  }

  // ---- create ------------------------------------------------------------------------------------

  /**
   * Any user. Puts a booked consignment on a new FTL trip. The haulier must be usable today (no
   * block issue) and ADR-capable for ADR goods; its buy price is its tariff price (TARIFF) or the
   * agreed price (MANUAL, with the reason). The engine's candidates are kept for the audit.
   */
  async createFtl(actor: Actor, input: TripCreateInput): Promise<{ trip: TripDetail; consignment: ConsignmentDetail }> {
    const companyId = actor.companyID;
    const { c } = await consignmentService.load(companyId, input.consignmentId);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    if (c.scope === "LTL") throw APIError.failedPrecondition("A groupage (LTL) consignment is planned leg by leg on the planning board");
    if (c.tripId) throw APIError.failedPrecondition("The consignment is already on a trip");
    const price = cleanPrice(input.price, false) as TripPriceInput;
    const settings = await settingsService.get(companyId);
    const vehicleTypeCode = input.vehicleTypeCode ? String(input.vehicleTypeCode) : null;
    if (vehicleTypeCode && !settings.vehicleTypes.some((v) => v.code === vehicleTypeCode)) throw bad("Unknown vehicle type");

    const candidates = await this.candidates(companyId, c);
    const suggested = candidates[0]?.ownerCustomerId ?? null;
    const haulierId = input.haulierCustomerId ?? suggested;
    if (!haulierId) throw APIError.failedPrecondition("No haulier has a tariff price for this consignment: choose a haulier and give the agreed price");
    const haulier = await haulierService.get(companyId, haulierId);
    if (haulier.status === "blocked") {
      const why = haulier.issues.filter((i) => i.severity === "block").map((i) => i.message);
      throw APIError.failedPrecondition(`${haulier.companyName} cannot be put on a trip: ${why.join("; ")}`).withDetails({ issues: haulier.issues });
    }
    if (c.load.adr && !haulier.profile.adrCapable) throw APIError.failedPrecondition(`${haulier.companyName} is not ADR-capable`);

    let buy: PriceSnapshot;
    if (price.source === "TARIFF") {
      const side = candidates.find((x) => x.ownerCustomerId === haulierId);
      if (!side) throw APIError.failedPrecondition(`${haulier.companyName} has no tariff price for this consignment: give the agreed price`);
      buy = snapshotOf(side, c.serviceLevel, new Date().toISOString());
    } else {
      buy = await manualSnapshot(price.total, price.currency, price.reason, c.serviceLevel, c.pickupDate);
    }
    // D+N of an FTL counts from the planned pick-up date.
    const promisedDate = await consignmentService.promiseFor(companyId, c.serviceLevel, c.pickupDate, c.pickupTime);
    const belowFloor = marginOf(c.sellCzk, buy.totalCzk, settings.marginFloor).belowFloor;
    const by = await userName(actor.userID);
    const changed = suggested !== null && haulierId !== suggested;
    const suggestedName = changed ? (candidates[0]?.ownerName ?? "") : "";

    const trip = await inTx(async (tx) => {
      const ref = await consignmentRepository.allocateRef(tx, companyId, "LCZ", truckingRefYear(new Date()));
      const row = await tripRepository.insert(tx, {
        companyId,
        ref,
        kind: "FTL",
        status: "DRAFT",
        haulierCustomerId: haulierId,
        haulierName: haulier.companyName,
        suggestedHaulierId: suggested,
        vehicleTypeCode,
        plannedPickupDate: c.pickupDate,
        buy,
        buyCzk: buy.totalCzk,
        buyCandidates: candidates,
        createdByUserId: actor.userID || null,
      });
      const planned = await consignmentRepository.update(
        tx,
        companyId,
        c.id,
        { tripId: row.id, status: consignmentStatus({ ...factsOf(c, null), tripId: row.id }), promisedDate, belowFloor },
        { withoutTrip: true, version: c.version },
      );
      if (!planned) throw APIError.aborted("The consignment was planned or changed by someone else. Reload and try again.");
      await consignmentRepository.insertLeg(tx, companyId, c.id, row.id);
      await appendEvent(tx, companyId, {
        kind: "trip_created",
        consignmentId: c.id,
        tripId: row.id,
        customerId: haulierId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary:
            `Planned on ${ref} with ${haulier.companyName}, ${buy.total} ${buy.currency} (${buy.source === "MANUAL" ? "agreed price" : "tariff"})` +
            (changed ? `; suggested haulier was ${suggestedName || "another one"}` : ""),
          facts: { suggestedHaulierId: suggested, haulierCustomerId: haulierId, changedFromSuggestion: changed, candidates: candidates.length },
        },
      });
      const owes: TruckingOutboxInput[] = [
        owed(actor, c, "planned", plannedUpdate({ pickupDate: c.pickupDate, promisedDate, tractorPlate: "" })),
        owed(actor, c, "costs", buyCosts(row)),
      ];
      await truckingOutboxRepository.enqueue(tx, companyId, owes);
      return row;
    });
    await deliverDue(c.id);
    return { trip: await this.get(actor, trip.id), consignment: await consignmentService.get(actor, c.id) };
  }

  // The usable hauliers with a tariff price for the consignment (preferred first, then cheapest);
  // none when it cannot be rated (foreign postcodes, no tariffs).
  private async candidates(companyId: string, c: TruckingConsignmentRecord): Promise<PricedSide[]> {
    if (c.pickup.country !== "CZ" || c.delivery.country !== "CZ") return [];
    try {
      const settings = await settingsService.get(companyId);
      const level = c.serviceLevel ?? settings.serviceLevels.find((l) => l.active)?.code ?? null;
      const rated = await rateService.rate(companyId, rateRequestOf(c, c.customerId, level));
      return rated.results[0]?.buy ?? [];
    } catch {
      return [];
    }
  }

  // ---- update / cancel ---------------------------------------------------------------------------

  /** Any user, with the version read: vehicle, plates (upper case, no spaces) and driver. A new tractor plate goes to the job. */
  async update(actor: Actor, id: string, input: TripUpdateInput): Promise<TripDetail> {
    const companyId = actor.companyID;
    const trip = await this.load(companyId, id);
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    if (!Number.isInteger(input.version) || input.version !== trip.version) throw APIError.aborted(TRIP_CONFLICT);
    const vehicleTypeCode = input.vehicleTypeCode ? String(input.vehicleTypeCode) : null;
    if (vehicleTypeCode && vehicleTypeCode !== trip.vehicleTypeCode && !(await settingsService.vehicleCodes(companyId)).includes(vehicleTypeCode)) {
      throw bad("Unknown vehicle type");
    }
    const values = {
      vehicleTypeCode,
      tractorPlate: normalisePlate(input.tractorPlate),
      trailerPlate: normalisePlate(input.trailerPlate),
      driverName: text(input.driverName, "The driver's name"),
      driverPhone: text(input.driverPhone, "The driver's phone"),
    };
    const changes: Record<string, { before: unknown; after: unknown }> = {};
    for (const [k, v] of Object.entries(values)) {
      const before = (trip as Record<string, unknown>)[k] ?? null;
      if (before !== v) changes[k] = { before, after: v };
    }
    if (!Object.keys(changes).length) return this.get(actor, id);
    const consignment = await consignmentRepository.findByTrip(companyId, id);
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      const row = await tripRepository.update(tx, companyId, id, values, { version: trip.version, live: true });
      if (!row) throw APIError.aborted(TRIP_CONFLICT);
      // An LTL trip already announced to our warehouse is announced again with the new vehicle and driver.
      if (row.kind !== "FTL" && row.orderSentAt) await ltlTrips.settle(tx, actor, (await tripRepository.lock(tx, companyId, id)) ?? row);
      await appendEvent(tx, companyId, {
        kind: "trip_updated",
        tripId: id,
        consignmentId: consignment?.id ?? null,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes, summary: `Trip ${trip.ref}: changed ${Object.keys(changes).join(", ")}` },
      });
      if (consignment && changes.tractorPlate && values.tractorPlate) {
        await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, consignment, "plate", { plateNumber: values.tractorPlate })]);
      }
    });
    if (consignment) await deliverDue(consignment.id);
    else if (trip.kind !== "FTL") await deliverDue();
    return this.get(actor, id);
  }

  /** Manager. Refused after the pick-up. The consignment goes back to BOOKED; the haulier's link is revoked and the buy lines removed. */
  async cancel(actor: Actor, id: string, reason: unknown): Promise<TripDetail> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can cancel a trip");
    const why = cleanReason(reason, "a reason for the cancellation");
    const companyId = actor.companyID;
    const trip = await this.load(companyId, id);
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is already cancelled");
    if (trip.kind !== "FTL") return this.cancelLtl(actor, trip, why);
    const c = await consignmentRepository.findByTrip(companyId, id);
    if (c?.pickedUpAt) throw APIError.failedPrecondition("The goods are picked up: the trip can no longer be cancelled");
    const by = await userName(actor.userID);
    const { marginFloor } = await settingsService.get(companyId);
    await inTx(async (tx) => {
      const now = new Date();
      const row = await tripRepository.update(tx, companyId, id, { cancelledAt: now, cancelledBy: by, cancelReason: why, status: "CANCELLED" }, { live: true, version: trip.version });
      if (!row) throw APIError.aborted(TRIP_CONFLICT);
      await tripRepository.revokeLinks(tx, companyId, id);
      await consignmentRepository.retireLegs(tx, companyId, id);
      if (c && !c.cancelledAt) {
        const back = await consignmentRepository.update(
          tx,
          companyId,
          c.id,
          { tripId: null, confirmedAt: null, confirmedBy: null, status: "BOOKED", belowFloor: marginOf(c.sellCzk, c.estBuyCzk, marginFloor).belowFloor },
          { tripId: id, beforePickup: true },
        );
        if (!back) throw APIError.aborted("The consignment was picked up or changed meanwhile. Reload and try again.");
      }
      await appendEvent(tx, companyId, {
        kind: "trip_cancelled",
        tripId: id,
        consignmentId: c?.id ?? null,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: { changes: { status: { before: trip.status, after: "CANCELLED" } }, reason: why, summary: `Trip ${trip.ref} with ${trip.haulierName} cancelled: ${why}` },
      });
      if (c) await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, c, "costs", noCosts(tripSourceRef(id)))]);
    });
    if (c) await deliverDue(c.id);
    return this.get(actor, id);
  }

  /**
   * An LTL trip is cancelled until the truck leaves: its legs go back to the planning board
   * (open), its job cost lines are removed, our warehouse is told the trip is off, and the
   * haulier's link is revoked.
   */
  private async cancelLtl(actor: Actor, trip: TruckingTripRecord, why: string): Promise<TripDetail> {
    const companyId = actor.companyID;
    if (trip.departedAt) throw APIError.failedPrecondition("The truck has left: the trip can no longer be cancelled");
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt || locked.version !== trip.version || locked.departedAt) throw APIError.aborted(TRIP_CONFLICT);
      const legs = await legRepository.forTrips(companyId, [trip.id], tx);
      for (const l of legs) await legRepository.update(tx, companyId, l.id, { tripId: null, status: "OPEN", costShareCzk: null }, { tripId: trip.id });
      const row = await tripRepository.update(tx, companyId, trip.id, { cancelledAt: new Date(), cancelledBy: by, cancelReason: why, status: "CANCELLED" }, { live: true });
      if (!row) throw APIError.aborted(TRIP_CONFLICT);
      await tripRepository.revokeLinks(tx, companyId, trip.id);
      await ltlTrips.settle(tx, actor, row);
      await ltlTrips.refreshStatuses(tx, companyId, [...new Set(legs.map((l) => l.consignmentId))]);
      await appendEvent(tx, companyId, {
        kind: "trip_cancelled",
        tripId: trip.id,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { status: { before: trip.status, after: "CANCELLED" } },
          reason: why,
          summary: `Trip ${trip.ref} with ${trip.haulierName} cancelled: ${why}; ${legs.length} leg${legs.length === 1 ? "" : "s"} back to planning`,
        },
      });
    });
    await deliverDue();
    return this.get(actor, trip.id);
  }
}

export const tripService = new TripService();
