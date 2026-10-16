import log from "encore.dev/log";
import { czHolidays } from "../lib/czHolidays";
import { APIError } from "encore.dev/api";
import { customers } from "~encore/clients";
import { inTx, type Tx } from "../db/db";
import { consignmentRepository, type ConsignmentValues } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { tariffRepository } from "../repositories/tariff.repository";
import { truckingOutboxRepository } from "../repositories/truckingOutbox.repository";
import { appendEvent } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type {
  ConsignmentDetail,
  HubAddress,
  LoadInput,
  LtlTripKind,
  PlanningBoard,
  PlanningTrip,
  PriceSnapshot,
  PricedSide,
  RateRequest,
  ServiceLevelCode,
  TariffScope,
  TripDetail,
  TripPriceInput,
} from "../interfaces/interfaces";
import type { Actor } from "../../../lib/rbac";
import { addDays, businessDay, isRealYmd } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import { cleanPrice, cleanReason, stampTime, truckingRefYear } from "../lib/consignmentRules";
import { assertBuyChangeAllowed } from "../lib/buyPriceLock";
import { isManager } from "../lib/roles";
import { haulierInvoiceRepository } from "../repositories/haulierInvoice.repository";
import {
  gateChange,
  HUB_MISSING,
  hubIsSet,
  hubPlace,
  isLtlTripKind,
  LEG_OF_TRIP,
  LEG_SEQ,
  legEnds,
  ltlPromise,
  ltlStatus,
  ltlTripStatus,
  neededBy,
  TRIP_KIND_LABEL,
  tripOpenForLegs,
  type Place,
} from "../lib/ltlRules";
import { ltlFactsOf, ltlLegsOf, planningLeg } from "../lib/ltlView";
import { findZone, isPriced, roundToStep, showPostcode } from "../lib/rateEngine";
import { partnerLegCosts } from "../lib/truckingLinks";
import type { GateStampedEvent } from "../lib/warehouseLink";
import { userName } from "../lib/users";
import { haulierService } from "./haulier.service";
import { consignmentService, manualSnapshot, owed, snapshotOf, stampText } from "./consignment.service";
import { TRIP_CONFLICT, tripService } from "./trip.service";
import { rateService } from "./rate.service";
import { settingsService } from "./settings.service";
import { deliverDue } from "./truckingOutbox.service";
import { ltlTrips } from "./ltlTrips";

// LTL groupage: the planning board (legs waiting for a trip, the day's trips), pick-up runs, line
// hauls and delivery runs (create, legs on and off with the trip row locked, price, departure /
// arrival), a partner's delivery priced from the partner's BUY tariff, and the warehouse's gate
// events (gate-in, gate-out, voided) that move consignments through our warehouse.

const bad = (message: string) => APIError.invalidArgument(message);
const HOLIDAY_WINDOW_DAYS = 45;
const MAX_LEGS = 200;
const TRIP_STAMPS = ["departed", "arrived"] as const;
export type TripStampKind = (typeof TRIP_STAMPS)[number];

export interface LtlTripCreateInput {
  kind: LtlTripKind;
  /** YYYY-MM-DD */
  date: string;
  haulierCustomerId: string;
  vehicleTypeCode: string;
  legIds: string[];
  price: TripPriceInput;
}

export interface AssignLegsInput {
  add: string[];
  remove: string[];
  stopOrder: string[] | null;
  version: number;
}

export interface LegPartnerInput {
  haulierCustomerId: string;
  depotSiteId: string | null;
  price: TripPriceInput;
  /** Why the partner or price changes after the partner was given the delivery (a manager only) */
  reason?: string;
}

const ids = (v: unknown, what: string): string[] => {
  if (!Array.isArray(v)) throw bad(`${what} must be a list of ids`);
  const list = [...new Set(v.map(String))];
  if (list.some((id) => !isUuid(id))) throw bad(`${what} has an id that is not valid`);
  if (list.length > MAX_LEGS) throw bad(`At most ${MAX_LEGS} legs at once`);
  return list;
};

const ymd = (v: unknown, what: string): string => {
  if (typeof v !== "string" || !isRealYmd(v)) throw bad(`${what} must be a date like 2026-12-31`);
  return v;
};

/** The two ends a leg is rated between: our warehouse as it is set now for the hub's end. */
function ratedEnds(l: TruckingLegRecord, hub: HubAddress): { from: string; to: string } {
  const hubPc = hubIsSet(hub) ? hub.postcode : "";
  if (l.kind === "PICKUP") return { from: l.fromPostcode, to: hubPc };
  if (l.kind === "LINEHAUL") return { from: hubPc, to: l.toPostcode };
  return { from: l.fromPostcode || hubPc, to: l.toPostcode };
}

/** A rate request for a part of an LTL trip (no customer: only the buy side counts). */
function buyRequest(scope: TariffScope, from: string, to: string, date: string, loads: LoadInput[], level: ServiceLevelCode | null): RateRequest {
  const sum = (f: (l: LoadInput) => number) => loads.reduce((a, l) => a + f(l), 0);
  return {
    fromPostcode: from,
    toPostcode: to,
    pickupDate: date,
    pickupTime: null,
    scope,
    pieces: sum((l) => l.pieces),
    palletPlaces: sum((l) => l.palletPlaces),
    ldm: sum((l) => l.ldm),
    weightKg: sum((l) => l.weightKg),
    cbm: sum((l) => l.cbm),
    extras: {
      adr: loads.some((l) => l.adr),
      tailLift: loads.some((l) => l.tailLift),
      avizace: false,
      timeWindow: false,
      b2c: loads.some((l) => l.b2c),
      nonStackable: loads.some((l) => l.nonStackable),
      waitingHours: 0,
      declaredValueCzk: null,
    },
    customerId: null,
    serviceLevels: level ? [level] : null,
    includeBuy: true,
    includeInternal: false,
  };
}

/** How long a gate-out that came before its gate-in waits for it (pub/sub retries). */
const GATE_OUT_WAIT_MS = 6 * 60 * 60 * 1000;

class LtlService {
  // ---- planning board ------------------------------------------------------------------------------

  /**
   * The board of a day and trip kind: every leg of that kind still waiting for a trip (with its
   * deadline; the web groups them by zone) and the day's trips with fill, warnings and stops.
   * Refused until our warehouse's address is set.
   */
  async board(actor: Actor, date: unknown, kind: unknown): Promise<PlanningBoard> {
    const day = ymd(date, "The date");
    if (!isLtlTripKind(kind)) throw bad("The kind must be PICKUP_RUN, LINEHAUL or DELIVERY_RUN");
    const companyId = actor.companyID;
    const settings = await settingsService.get(companyId);
    if (!hubIsSet(settings.hub)) throw APIError.failedPrecondition(HUB_MISSING);
    const [open, trips] = await Promise.all([legRepository.open(companyId, LEG_OF_TRIP[kind]), tripRepository.listLtl(companyId, kind, day)]);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(open.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    const waiting = open.filter((l) => {
      const c = byId.get(l.consignmentId);
      return !!c && !c.cancelledAt && c.scope === "LTL" && (l.kind !== "DELIVERY" || c.lastMile !== "PARTNER");
    });
    const zoneOf = await this.zoneLabels(companyId, day);
    const today = businessDay(new Date());
    const unplanned = waiting
      .map((l) => {
        const c = byId.get(l.consignmentId)!;
        const far = l.kind === "PICKUP" ? c.pickup.postcode : l.kind === "LINEHAUL" ? l.toPostcode : c.delivery.postcode;
        return planningLeg(l, c, zoneOf(far), today);
      })
      .sort((a, b) => neededBy(a.kind, a).localeCompare(neededBy(b.kind, b)) || a.consignmentRef.localeCompare(b.consignmentRef));

    const [loads, assessments] = await Promise.all([
      ltlTrips.loads(companyId, trips, settings),
      tripService.haulierAssessments(companyId, trips.map((t) => t.haulierCustomerId)),
    ]);
    const planned = trips.map((t): PlanningTrip => {
      const view = loads.get(t.id)!;
      return {
        id: t.id,
        ref: t.ref,
        kind,
        status: t.status,
        date: t.plannedPickupDate,
        haulierCustomerId: t.haulierCustomerId,
        haulierName: t.haulierName,
        haulierStatus: assessments.get(t.haulierCustomerId)!.status,
        vehicleTypeCode: t.vehicleTypeCode,
        capacity: view.capacity,
        fill: view.fill,
        warnings: view.warnings,
        stops: view.legs,
        buyTotal: t.buy?.total ?? null,
        buyCurrency: t.buy?.currency ?? null,
        buyTotalCzk: t.buyCzk,
        transportOrderSent: !!t.orderSentAt,
        version: t.version,
      };
    });
    return { date: day, kind, unplanned, trips: planned };
  }

  // The zone of a postcode in the Standard LTL sell list valid on the day ("" when none).
  async zoneLabels(companyId: string, day: string): Promise<(postcode: string) => string> {
    try {
      const tariffs = await tariffRepository.list(companyId, { scope: "LTL", side: "SELL" });
      const standard = tariffs.find((t) => !t.ownerCustomerId);
      const [version] = standard ? await tariffRepository.bindingOn(companyId, [standard.id], day) : [];
      const zones = version?.input.zones ?? [];
      return (postcode) => {
        const z = findZone(zones, postcode);
        return z ? z.label || z.code : "";
      };
    } catch (err) {
      log.warn(err, "trucking: zones for the planning board not read");
      return () => "";
    }
  }

  // ---- trips ---------------------------------------------------------------------------------------

  /** Legs that may go on a trip of `kind`: open, of the trip's kind, of live LTL consignments (a partner's delivery never). */
  private async legsFor(
    companyId: string,
    kind: LtlTripKind,
    legIds: string[],
    reader?: Tx,
  ): Promise<{ legs: TruckingLegRecord[]; byId: Map<string, TruckingConsignmentRecord> }> {
    const legs = await legRepository.findMany(companyId, legIds, reader);
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))], reader);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    for (const id of legIds) {
      const l = legs.find((x) => x.id === id);
      const c = l ? byId.get(l.consignmentId) : undefined;
      if (!l || !c) throw APIError.notFound("Leg not found");
      if (c.cancelledAt) throw APIError.failedPrecondition(`${c.ref} is cancelled`);
      if (l.kind !== LEG_OF_TRIP[kind]) throw APIError.failedPrecondition(`${c.ref}: a ${l.kind.toLowerCase()} leg cannot go on a ${TRIP_KIND_LABEL[kind].en.toLowerCase()}`);
      if (l.kind === "DELIVERY" && c.lastMile === "PARTNER") throw APIError.failedPrecondition(`${c.ref} is delivered by a partner, not by our delivery run`);
      if (l.status !== "OPEN" || l.tripId) throw APIError.failedPrecondition(`${c.ref}: the leg is already planned`);
    }
    return { legs: legIds.map((id) => legs.find((x) => x.id === id)!), byId };
  }

  /**
   * The haulier's tariff price of a trip. One price for the whole trip when its tariff prices
   * per trip (TRIP bands, usual for line hauls); else the sum of each leg priced on its own.
   * Scope: a line haul's LINEHAUL tariff, a run's LTL tariff.
   */
  async tariffBuy(
    companyId: string,
    kind: LtlTripKind,
    haulier: { id: string; name: string },
    date: string,
    legs: TruckingLegRecord[],
    byId: Map<string, TruckingConsignmentRecord>,
    hub: HubAddress,
  ): Promise<{ buy: PriceSnapshot; candidates: PricedSide[] }> {
    if (!legs.length) throw APIError.failedPrecondition("Add legs before pricing from the tariff, or give the agreed price");
    const scope: TariffScope = kind === "LINEHAUL" ? "LINEHAUL" : "LTL";
    const cons = legs.map((l) => byId.get(l.consignmentId)!);
    const level = cons.find((c) => c.serviceLevel)?.serviceLevel ?? null;
    const first = ratedEnds(legs[0]!, hub);
    const last = ratedEnds(legs[legs.length - 1]!, hub);
    const whole = await rateService.rate(companyId, buyRequest(scope, first.from, last.to, date, cons.map((c) => c.load), level), ["BUY"]);
    const candidates = whole.results[0]?.buy ?? [];
    const side = candidates.find((b) => b.ownerCustomerId === haulier.id);
    if (side && side.chargeable.basis === "TRIP") return { buy: snapshotOf(side, level, whole.ratedAt), candidates };

    const parts: { ref: string; side: PricedSide }[] = [];
    for (const [i, l] of legs.entries()) {
      const c = cons[i]!;
      const ends = ratedEnds(l, hub);
      const rated = await rateService.rate(companyId, buyRequest(scope, ends.from, ends.to, date, [c.load], c.serviceLevel ?? level), ["BUY"]);
      const s = rated.results[0]?.buy.find((b) => b.ownerCustomerId === haulier.id);
      if (!s) throw APIError.failedPrecondition(`${haulier.name} has no ${scope} tariff price for ${c.ref} (${l.fromText} → ${l.toText}): give the agreed price`);
      parts.push({ ref: c.ref, side: s });
    }
    const one = parts[0]!.side;
    const sameCurrency = parts.every((p) => p.side.currency === one.currency);
    const totalCzk = roundToStep(parts.reduce((a, p) => a + p.side.totalCzk, 0), 0.01);
    const buy: PriceSnapshot = {
      source: "TARIFF",
      tariffId: one.tariffId,
      tariffVersionId: one.tariffVersionId,
      versionNo: one.versionNo,
      tariffName: `${one.tariffName} (per consignment)`,
      serviceLevel: level,
      currency: sameCurrency ? one.currency : "CZK",
      total: sameCurrency ? roundToStep(parts.reduce((a, p) => a + p.side.total, 0), 0.01) : totalCzk,
      totalCzk,
      lines: sameCurrency
        ? parts.flatMap((p) => p.side.lines.map((line) => ({ ...line, label: `${p.ref}: ${line.label}` })))
        : parts.map((p) => ({ code: "FREIGHT", label: p.ref, qty: 1, unit: "consignment", unitPrice: p.side.totalCzk, amount: p.side.totalCzk })),
      ratedAt: new Date().toISOString(),
      overrideReason: null,
    };
    return { buy, candidates };
  }

  // The buy price asked for: the tariff's, or the agreed price.
  private async buyFor(
    companyId: string,
    price: TripPriceInput,
    kind: LtlTripKind,
    haulier: { id: string; name: string },
    date: string,
    legs: TruckingLegRecord[],
    byId: Map<string, TruckingConsignmentRecord>,
    hub: HubAddress,
  ): Promise<{ buy: PriceSnapshot; candidates: PricedSide[] | null }> {
    if (price.source === "MANUAL") return { buy: await manualSnapshot(price.total, price.currency, price.reason, null, date), candidates: null };
    return this.tariffBuy(companyId, kind, haulier, date, legs, byId, hub);
  }

  // A haulier that may run the trip today (block issues refuse, with them).
  private async usableHaulier(companyId: string, haulierId: unknown) {
    if (typeof haulierId !== "string" || !isUuid(haulierId)) throw bad("Choose a haulier");
    const haulier = await haulierService.get(companyId, haulierId);
    if (haulier.status === "blocked") {
      const why = haulier.issues.filter((i) => i.severity === "block").map((i) => i.message);
      throw APIError.failedPrecondition(`${haulier.companyName} cannot be put on a trip: ${why.join("; ")}`).withDetails({ issues: haulier.issues });
    }
    return haulier;
  }

  /**
   * Any user. A new pick-up run, line haul or delivery run on a day with a usable haulier and a
   * vehicle, carrying open legs of its kind (none is fine: legs are dragged on later). Priced from
   * the haulier's tariff or at an agreed price, split over the legs.
   */
  async createTrip(actor: Actor, input: LtlTripCreateInput): Promise<TripDetail> {
    const companyId = actor.companyID;
    if (!isLtlTripKind(input.kind)) throw bad("The kind must be PICKUP_RUN, LINEHAUL or DELIVERY_RUN");
    const kind = input.kind;
    const date = ymd(input.date, "The date");
    const legIds = ids(input.legIds ?? [], "legIds");
    const price = cleanPrice(input.price, false) as TripPriceInput;
    const settings = await settingsService.get(companyId);
    if (!hubIsSet(settings.hub)) throw APIError.failedPrecondition(HUB_MISSING);
    const vehicleTypeCode = typeof input.vehicleTypeCode === "string" && input.vehicleTypeCode ? input.vehicleTypeCode : null;
    if (!vehicleTypeCode || !settings.vehicleTypes.some((v) => v.code === vehicleTypeCode)) throw bad("Choose a vehicle type from the trucking settings");
    const haulier = await this.usableHaulier(companyId, input.haulierCustomerId);
    const { legs, byId } = await this.legsFor(companyId, kind, legIds);
    const { buy, candidates } = await this.buyFor(companyId, price, kind, { id: haulier.customerId, name: haulier.companyName }, date, legs, byId, settings.hub);
    const by = await userName(actor.userID);

    const trip = await inTx(async (tx) => {
      const ref = await consignmentRepository.allocateRef(tx, companyId, "LCZ", truckingRefYear(new Date()));
      const row = await tripRepository.insert(tx, {
        companyId,
        ref,
        kind,
        status: "DRAFT",
        haulierCustomerId: haulier.customerId,
        haulierName: haulier.companyName,
        vehicleTypeCode,
        plannedPickupDate: date,
        buy,
        buyCzk: buy.totalCzk,
        buyCandidates: candidates ?? [],
        stopOrder: legIds,
        createdByUserId: actor.userID || null,
      });
      await this.putOn(tx, companyId, row, legs);
      await appendEvent(tx, companyId, {
        kind: "trip_created",
        tripId: row.id,
        customerId: haulier.customerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `${TRIP_KIND_LABEL[kind].en} ${ref} on ${date} with ${haulier.companyName}, ${buy.total} ${buy.currency} (${buy.source === "MANUAL" ? "agreed price" : "tariff"}), ${legs.length} leg${legs.length === 1 ? "" : "s"}`,
          facts: { kind, legs: legs.length },
        },
      });
      await this.legEvents(tx, companyId, row, legs, byId, by, actor, "on");
      return ltlTrips.settle(tx, actor, row, legIds);
    });
    await deliverDue();
    return tripService.get(actor, trip.id);
  }

  // Legs onto the trip (guarded: still open and on no trip).
  private async putOn(tx: Tx, companyId: string, trip: TruckingTripRecord, legs: TruckingLegRecord[]): Promise<void> {
    for (const l of legs) {
      const row = await legRepository.update(tx, companyId, l.id, { tripId: trip.id, status: "PLANNED", haulierCustomerId: trip.haulierCustomerId }, { status: "OPEN", tripId: null });
      if (!row) throw APIError.aborted("A leg was planned by someone else meanwhile. Reload and try again.");
    }
  }

  // The consignments' history: which leg went on or off which trip.
  private async legEvents(
    tx: Tx,
    companyId: string,
    trip: TruckingTripRecord,
    legs: TruckingLegRecord[],
    byId: Map<string, TruckingConsignmentRecord>,
    by: string,
    actor: Actor,
    way: "on" | "off",
  ): Promise<void> {
    for (const l of legs) {
      await appendEvent(tx, companyId, {
        kind: "legs_planned",
        consignmentId: l.consignmentId,
        tripId: trip.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { tripId: { before: way === "on" ? null : trip.id, after: way === "on" ? trip.id : null } },
          summary: `${l.kind === "PICKUP" ? "Pick-up" : l.kind === "LINEHAUL" ? "Line haul" : "Delivery"} ${way === "on" ? "planned on" : "taken off"} ${trip.ref} (${trip.haulierName})`,
          facts: { legId: l.id, consignmentRef: byId.get(l.consignmentId)?.ref ?? "" },
        },
      });
    }
  }

  /**
   * Any user, with the trip's version read. Adds and removes legs and / or sets the stop order,
   * with the trip row locked; refused once the truck has left. A tariff-priced trip is priced
   * again for its new legs (an agreed price stays); the price is split again either way.
   */
  async assignLegs(actor: Actor, tripId: string, input: AssignLegsInput): Promise<TripDetail> {
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    if (trip.kind === "FTL") throw APIError.failedPrecondition("An FTL trip carries its one consignment");
    const kind = trip.kind;
    if (!Number.isInteger(input.version) || input.version !== trip.version) throw APIError.aborted(TRIP_CONFLICT);
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    if (!tripOpenForLegs(trip.status)) throw APIError.failedPrecondition("The truck has left: the trip's legs can no longer change");
    const add = ids(input.add ?? [], "add");
    const remove = ids(input.remove ?? [], "remove");
    if (add.some((id) => remove.includes(id))) throw bad("A leg cannot be added and removed at once");
    const stopOrder = input.stopOrder === null || input.stopOrder === undefined ? null : ids(input.stopOrder, "stopOrder");
    const settings = await settingsService.get(companyId);

    const onTrip = await legRepository.forTrips(companyId, [trip.id]);
    const notOn = remove.find((id) => !onTrip.some((l) => l.id === id));
    if (notOn) throw APIError.failedPrecondition("A leg to remove is not on this trip");
    const added = await this.legsFor(companyId, kind, add);
    const kept = onTrip.filter((l) => !remove.includes(l.id));
    const after = [...kept, ...added.legs];
    const changed = add.length > 0 || remove.length > 0;

    // A tariff price follows the legs: priced again before the transaction (other services), checked
    // inside - until the transport order is sent: then the agreed price stays (a manager reprices).
    const followsLegs = changed && trip.buy?.source === "TARIFF" && !trip.orderSentAt;
    let repriced: { buy: PriceSnapshot; candidates: PricedSide[] | null } | null = null;
    if (followsLegs && after.length) {
      const all = await consignmentRepository.findMany(companyId, [...new Set(after.map((l) => l.consignmentId))]);
      const ordered = stopOrder ?? [...trip.stopOrder.filter((id) => after.some((l) => l.id === id)), ...add];
      const legsInOrder = [...after].sort((a, b) => ordered.indexOf(a.id) - ordered.indexOf(b.id));
      repriced = await this.tariffBuy(companyId, kind, { id: trip.haulierCustomerId, name: trip.haulierName }, trip.plannedPickupDate, legsInOrder, new Map(all.map((c) => [c.id, c])), settings.hub);
    }
    const by = await userName(actor.userID);

    await inTx(async (tx) => {
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt || locked.version !== trip.version) throw APIError.aborted(TRIP_CONFLICT);
      if (!tripOpenForLegs(locked.status)) throw APIError.failedPrecondition("The truck has left: the trip's legs can no longer change");
      const removed = onTrip.filter((l) => remove.includes(l.id));
      for (const l of removed) {
        const row = await legRepository.update(tx, companyId, l.id, { tripId: null, status: "OPEN", costShareCzk: null, haulierCustomerId: null }, { tripId: trip.id });
        if (!row) throw APIError.aborted(TRIP_CONFLICT);
      }
      await this.putOn(tx, companyId, locked, added.legs);
      let row = locked;
      if (repriced) {
        row = (await tripRepository.update(tx, companyId, trip.id, { buy: repriced.buy, buyCzk: repriced.buy.totalCzk, ...(repriced.candidates ? { buyCandidates: repriced.candidates } : {}) }, { live: true })) ?? locked;
      } else if (followsLegs && !after.length) {
        row = (await tripRepository.update(tx, companyId, trip.id, { buy: null, buyCzk: null }, { live: true })) ?? locked;
      }
      const allById = new Map([...added.byId, ...(await consignmentRepository.findMany(companyId, [...new Set(removed.map((l) => l.consignmentId))], tx)).map((c) => [c.id, c] as const)]);
      await this.legEvents(tx, companyId, row, added.legs, allById, by, actor, "on");
      await this.legEvents(tx, companyId, row, removed, allById, by, actor, "off");
      await appendEvent(tx, companyId, {
        kind: "trip_legs_changed",
        tripId: trip.id,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { legs: { before: onTrip.length, after: after.length } },
          summary: `${trip.ref}: ${[add.length ? `${add.length} leg${add.length === 1 ? "" : "s"} added` : "", remove.length ? `${remove.length} removed` : "", stopOrder ? "stops reordered" : ""].filter(Boolean).join(", ") || "no change"}${repriced ? `; priced again ${repriced.buy.total} ${repriced.buy.currency}` : ""}${changed && trip.orderSentAt && trip.buy ? `; the agreed price ${trip.buy.total} ${trip.buy.currency} stays (the transport order is sent: a manager may reprice)` : ""}`,
        },
      });
      await ltlTrips.settle(tx, actor, row, stopOrder);
    });
    await deliverDue();
    return tripService.get(actor, trip.id);
  }

  /**
   * A new buy price (the tariff's now, or an agreed price) split again over the legs. Any user
   * until the transport order is sent; then a manager with a reason (the trip is flagged as
   * repriced: its invoice is never approved automatically, and the haulier sees the change in the
   * portal's history); never once the trip is on a haulier invoice that is not rejected.
   */
  async reprice(actor: Actor, tripId: string, rawPrice: TripPriceInput, rawReason?: string): Promise<TripDetail> {
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    if (trip.kind === "FTL") throw APIError.failedPrecondition("An FTL trip's price is set when it is planned");
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    const price = cleanPrice(rawPrice, false) as TripPriceInput;
    const given = typeof rawReason === "string" && rawReason.trim() ? rawReason : price.source === "MANUAL" ? price.reason : "";
    const lock = await this.buyLock(companyId, "TRIP", trip.id, `Trip ${trip.ref}`, !!trip.orderSentAt, actor, given);
    const reason = lock.afterOrder ? cleanReason(given, "the reason for the new price") : "";
    const settings = await settingsService.get(companyId);
    const legs = await legRepository.forTrips(companyId, [trip.id]);
    const ordered = [...legs].sort((a, b) => trip.stopOrder.indexOf(a.id) - trip.stopOrder.indexOf(b.id));
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const { buy, candidates } = await this.buyFor(
      companyId,
      price,
      trip.kind,
      { id: trip.haulierCustomerId, name: trip.haulierName },
      trip.plannedPickupDate,
      ordered,
      new Map(consignments.map((c) => [c.id, c])),
      settings.hub,
    );
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      // The haulier's invoice lock first (an invoice save takes it too), then the trip.
      await haulierInvoiceRepository.lockHaulier(tx, companyId, trip.haulierCustomerId);
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt) throw APIError.aborted(TRIP_CONFLICT);
      if (!!locked.orderSentAt !== !!trip.orderSentAt) throw APIError.aborted(TRIP_CONFLICT);
      const [use] = await haulierInvoiceRepository.targetUses(companyId, [{ kind: "TRIP", id: trip.id }], undefined, tx);
      if (use) throw APIError.failedPrecondition(`Trip ${trip.ref} is on haulier invoice ${use.invoiceNumber}: its price can no longer change`);
      const now = await legRepository.forTrips(companyId, [trip.id], tx);
      if (now.length !== legs.length || now.some((l) => !legs.some((x) => x.id === l.id))) throw APIError.aborted(TRIP_CONFLICT);
      const flag = lock.afterOrder ? { buyRepricedAt: new Date(), buyRepricedBy: by || null } : {};
      const row = await tripRepository.update(tx, companyId, trip.id, { buy, buyCzk: buy.totalCzk, ...flag, ...(candidates ? { buyCandidates: candidates } : {}) }, { live: true });
      if (!row) throw APIError.aborted(TRIP_CONFLICT);
      await appendEvent(tx, companyId, {
        kind: "trip_repriced",
        tripId: trip.id,
        customerId: trip.haulierCustomerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { buy: { before: trip.buy?.total ?? null, after: buy.total } },
          reason: reason || buy.overrideReason || undefined,
          summary: `${trip.ref} priced ${buy.total} ${buy.currency} (${buy.source === "MANUAL" ? `agreed price: ${buy.overrideReason}` : "tariff"})${lock.afterOrder ? ` after the transport order was sent, by a manager: ${reason}` : ""}`,
          // The haulier's history shows an agreed price that changed after the order (never the reason).
          facts: { afterOrder: lock.afterOrder, priceBefore: trip.buy ? { total: trip.buy.total, currency: trip.buy.currency } : null, priceAfter: { total: buy.total, currency: buy.currency } },
        },
      });
      await ltlTrips.settle(tx, actor, row);
    });
    await deliverDue();
    return tripService.get(actor, trip.id);
  }

  /** The buy-price lock of a trip or partner delivery (lib/buyPriceLock.ts), with its invoice read now. */
  private async buyLock(companyId: string, kind: "TRIP" | "PARTNER_LEG", id: string, what: string, orderOut: boolean, actor: Actor, reason: string) {
    const [use] = await haulierInvoiceRepository.targetUses(companyId, [{ kind, id }]);
    return assertBuyChangeAllowed({ what, orderOut, invoiceNumber: use?.invoiceNumber ?? null, manager: isManager(actor.role), reason });
  }

  /**
   * Any user. The departure / arrival of an LTL trip (once each, in order; a past time within 7
   * days). A pick-up run's arrival at our warehouse is not the gate-in (the warehouse stamps that)
   * but it stamps the pick-up of every consignment it carried that has none yet. A line haul or a
   * delivery run leaves only once our warehouse stamped the gate-in of everything on it. A line haul's
   * arrival at the depot finishes its legs. A delivery run's deliveries are the consignments'
   * own stamps.
   */
  async tripStamp(actor: Actor, tripId: string, kind: unknown, at: string | null): Promise<TripDetail> {
    await this.tripStampChecked(actor, tripId, kind, at, null);
    return tripService.get(actor, tripId);
  }

  /**
   * The departure / arrival with every check of tripStamp, as the user (`haulier` null) or as the
   * haulier through the portal (its name; no user id; pick-ups stamped with source HAULIER).
   */
  async tripStampChecked(actor: Pick<Actor, "userID" | "role" | "companyID">, tripId: string, kind: unknown, at: string | null, haulier: { by: string } | null): Promise<void> {
    if (!TRIP_STAMPS.includes(kind as TripStampKind)) throw bad("The stamp must be departed or arrived");
    const companyId = actor.companyID;
    const trip = await tripService.load(companyId, tripId);
    if (trip.kind === "FTL") throw APIError.failedPrecondition("An FTL trip follows its consignment's stamps");
    if (trip.cancelledAt) throw APIError.failedPrecondition("The trip is cancelled");
    const departed = kind === "departed";
    if (departed ? trip.departedAt : trip.arrivedAt) throw APIError.alreadyExists("Already stamped");
    if (departed && !trip.orderSentAt) throw APIError.failedPrecondition("Send the transport order first");
    if (!departed && !trip.departedAt) throw APIError.failedPrecondition("Stamp the departure first");
    // A line haul or delivery run carries goods out of our warehouse: they must have passed its gate-in.
    if (departed && trip.kind !== "PICKUP_RUN") {
      const legs = await legRepository.forTrips(companyId, [trip.id]);
      const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
      const notIn = consignments.filter((c) => !c.cancelledAt && !c.gateInAt).map((c) => c.ref);
      if (notIn.length) throw APIError.failedPrecondition(`The truck cannot leave before our warehouse stamps the gate-in of ${notIn.join(", ")}`);
    }
    const time = stampTime(at, new Date());
    if (!departed && trip.departedAt && time < trip.departedAt) throw bad(`The arrival cannot be before the departure (${stampText(trip.departedAt)})`);
    const by = haulier ? haulier.by : await userName(actor.userID);
    const byUserId = haulier ? null : actor.userID || null;
    const source = haulier ? "HAULIER" : "USER";

    await inTx(async (tx) => {
      const locked = await tripRepository.lock(tx, companyId, trip.id);
      if (!locked || locked.cancelledAt) throw APIError.aborted(TRIP_CONFLICT);
      if (departed ? locked.departedAt : locked.arrivedAt) throw APIError.alreadyExists("Already stamped");
      const values = departed ? { departedAt: time, departedBy: by } : { arrivedAt: time, arrivedBy: by };
      await tripRepository.update(tx, companyId, trip.id, { ...values, status: ltlTripStatus({ ...locked, ...values }) }, { live: true });
      const legs = await legRepository.forTrips(companyId, [trip.id], tx);
      if (!departed && trip.kind === "LINEHAUL") {
        for (const l of legs.filter((x) => x.status === "PLANNED")) await legRepository.update(tx, companyId, l.id, { status: "DONE" }, { tripId: trip.id });
      }
      if (!departed && trip.kind === "PICKUP_RUN") {
        const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))], tx);
        for (const c of consignments.filter((x) => !x.pickedUpAt && !x.cancelledAt)) {
          const row = await consignmentRepository.update(tx, companyId, c.id, { pickedUpAt: time, pickedUpBy: by }, { stampEmpty: "pickedUp" });
          if (!row) continue;
          await appendEvent(tx, companyId, {
            kind: "stamp_set",
            consignmentId: c.id,
            tripId: trip.id,
            byUserId,
            byName: by,
            payload: { changes: { pickedUp: { before: null, after: time.toISOString() } }, summary: `Picked up: ${stampText(time)} (pick-up run ${trip.ref} arrived)`, facts: { kind: "pickedUp", source } },
          });
        }
      }
      await ltlTrips.refreshStatuses(tx, companyId, [...new Set(legs.map((l) => l.consignmentId))]);
      await appendEvent(tx, companyId, {
        kind: "trip_stamp_set",
        tripId: trip.id,
        byUserId,
        byName: by,
        payload: {
          changes: { [kind as string]: { before: null, after: time.toISOString() } },
          summary: `${trip.ref} ${departed ? "departed" : "arrived"}: ${stampText(time)}${haulier ? " (by the haulier)" : ""}`,
          facts: { source },
        },
      });
    });
  }

  // ---- a partner's delivery --------------------------------------------------------------------------

  /**
   * The partner who delivers an LTL consignment (last mile PARTNER), from its depot (a delivery
   * site of the partner; null = it collects at our warehouse) and its price - the partner's BUY
   * tariff (scope LTL) from the depot to the consignee, or an agreed price. A depot that is not our
   * warehouse needs a line haul leg (added; removed when the depot is our warehouse again, unless
   * it is already on a trip). Any user gives the delivery to a partner; once given (it is in the
   * partner's portal - the partner's "order"), a change of partner or price is a manager's with a
   * reason (flagged as repriced), and none once it is on a haulier invoice that is not rejected.
   * After the delivery only the price may change (manager, same partner and depot).
   */
  async legPartner(actor: Actor, legId: string, input: LegPartnerInput): Promise<ConsignmentDetail> {
    const companyId = actor.companyID;
    const leg = isUuid(legId) ? await legRepository.find(companyId, legId) : null;
    if (!leg) throw APIError.notFound("Leg not found");
    if (leg.kind !== "DELIVERY") throw APIError.failedPrecondition("Only the delivery leg is given to a partner");
    const { c } = await consignmentService.load(companyId, leg.consignmentId);
    if (c.scope !== "LTL" || c.lastMile !== "PARTNER") throw APIError.failedPrecondition("The consignment is not delivered by a partner network");
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    const price = cleanPrice(input.price, false) as TripPriceInput;
    const given = typeof input.reason === "string" && input.reason.trim() ? input.reason : price.source === "MANUAL" ? price.reason : "";
    const lock = await this.buyLock(companyId, "PARTNER_LEG", leg.id, `${c.ref} partner delivery`, !!leg.buy && leg.status !== "OPEN", actor, given);
    const reason = lock.afterOrder ? cleanReason(given, "the reason for the change") : "";
    const delivered = leg.status === "DONE" || !!c.deliveredAt;
    const settings = await settingsService.get(companyId);
    if (!hubIsSet(settings.hub)) throw APIError.failedPrecondition(HUB_MISSING);
    const haulier = delivered ? await haulierService.get(companyId, String(input.haulierCustomerId)) : await this.usableHaulier(companyId, input.haulierCustomerId);
    const depot = await this.depotOf(haulier.customerId, haulier.companyName, input.depotSiteId);
    if (delivered && (haulier.customerId !== leg.haulierCustomerId || (depot?.siteId ?? null) !== leg.depotSiteId)) {
      throw APIError.failedPrecondition("The consignment is delivered: only the partner's price can still change (by a manager)");
    }
    const hub = hubPlace(settings.hub);
    const from = depot?.place ?? hub;

    let buy: PriceSnapshot;
    if (price.source === "MANUAL") {
      buy = await manualSnapshot(price.total, price.currency, price.reason, c.serviceLevel, c.pickupDate);
    } else {
      const rated = await rateService.rate(companyId, buyRequest("LTL", from.postcode, c.delivery.postcode, c.pickupDate, [c.load], c.serviceLevel), ["BUY"]);
      const side = rated.results[0]?.buy.find((b) => b.ownerCustomerId === haulier.customerId);
      if (!side || !isPriced(side)) throw APIError.failedPrecondition(`${haulier.companyName} has no LTL tariff price for this delivery: give the agreed price`);
      buy = snapshotOf(side, c.serviceLevel, rated.ratedAt);
    }
    const by = await userName(actor.userID);
    const conflict = () => APIError.aborted("The delivery was changed by someone else. Reload and try again.");

    await inTx(async (tx) => {
      // The invoice lock of the partner that had the delivery (an invoice save takes it too).
      if (leg.haulierCustomerId) await haulierInvoiceRepository.lockHaulier(tx, companyId, leg.haulierCustomerId);
      const [use] = await haulierInvoiceRepository.targetUses(companyId, [{ kind: "PARTNER_LEG", id: leg.id }], undefined, tx);
      if (use) throw APIError.failedPrecondition(`${c.ref} partner delivery is on haulier invoice ${use.invoiceNumber}: its price can no longer change`);
      const [now] = await legRepository.findMany(companyId, [leg.id], tx);
      if (!now || now.status !== leg.status || now.haulierCustomerId !== leg.haulierCustomerId || JSON.stringify(now.buy) !== JSON.stringify(leg.buy)) throw conflict();
      const flag = lock.afterOrder ? { buyRepricedAt: new Date(), buyRepricedBy: by || null } : {};
      let row: TruckingLegRecord | null;
      if (delivered) {
        row = await legRepository.update(tx, companyId, leg.id, { buy, ...flag }, { tripId: null });
        if (!row) throw conflict();
      } else {
        const legs = ltlLegsOf(c.id, await legRepository.forConsignments(companyId, [c.id], tx));
        const linehaul = legs.find((l) => l.kind === "LINEHAUL");
        if (!depot && linehaul) {
          if (linehaul.tripId) throw APIError.failedPrecondition("The line haul to the depot is on a trip: take it off the trip first");
          await legRepository.retire(tx, companyId, [linehaul.id]);
        }
        if (depot) {
          const ends = legEnds("LINEHAUL", c, hub, depot.place);
          if (linehaul && linehaul.tripId && linehaul.toPostcode !== depot.place.postcode) {
            throw APIError.failedPrecondition("The line haul to the old depot is on a trip: take it off the trip first");
          }
          if (linehaul) await legRepository.update(tx, companyId, linehaul.id, { toText: ends.to.text, toPostcode: ends.to.postcode, depotSiteId: depot.siteId });
          else {
            await legRepository.insertMany(tx, [
              {
                companyId,
                consignmentId: c.id,
                seq: LEG_SEQ.LINEHAUL,
                kind: "LINEHAUL",
                status: "OPEN",
                fromText: ends.from.text,
                toText: ends.to.text,
                fromPostcode: ends.from.postcode,
                toPostcode: ends.to.postcode,
                depotSiteId: depot.siteId,
              },
            ]);
          }
        }
        row = await legRepository.update(
          tx,
          companyId,
          leg.id,
          { haulierCustomerId: haulier.customerId, depotSiteId: depot?.siteId ?? null, buy, ...flag, status: "PLANNED", fromText: from.text, fromPostcode: from.postcode },
          { tripId: null },
        );
        if (!row || row.status === "DONE") throw conflict();
        await consignmentRepository.update(tx, companyId, c.id, { partnerHaulierCustomerId: haulier.customerId }, { live: true });
      }
      // A job of another department is billed internally: the partner's price stays in Trucking's ledger.
      if (!c.internal) await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, c, "costs", partnerLegCosts(row, c.ref, { id: haulier.customerId, name: haulier.companyName }))]);
      const priceBefore = leg.buy ? { total: leg.buy.total, currency: leg.buy.currency } : null;
      await appendEvent(tx, companyId, {
        kind: "partner_delivery_set",
        consignmentId: c.id,
        customerId: haulier.customerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {
            partner: { before: leg.haulierCustomerId, after: haulier.customerId },
            ...(priceBefore ? { buy: { before: priceBefore.total, after: buy.total } } : {}),
          },
          reason: reason || buy.overrideReason || undefined,
          summary: `Delivered by ${haulier.companyName} from ${from.text}, ${buy.total} ${buy.currency} (${buy.source === "MANUAL" ? "agreed price" : "partner tariff"})${lock.afterOrder ? `, changed by a manager after the partner was given it: ${reason}` : ""}`,
          // The partner's history shows its agreed price changing (never the reason).
          facts: { legId: leg.id, partner: haulier.customerId, afterOrder: lock.afterOrder, priceBefore, priceAfter: { total: buy.total, currency: buy.currency } },
        },
      });
      if (!delivered) await ltlTrips.refreshStatuses(tx, companyId, [c.id]);
    });
    await deliverDue(c.id);
    return consignmentService.get(actor, c.id);
  }

  // The partner's depot: one of its delivery sites (kind delivery or both); null = our warehouse.
  private async depotOf(haulierId: string, haulierName: string, siteId: unknown): Promise<{ siteId: string; place: Place } | null> {
    if (siteId === null || siteId === undefined || siteId === "") return null;
    if (typeof siteId !== "string" || !isUuid(siteId)) throw bad("The depot is not a valid site");
    const { data } = await customers.customerSiteList({ customerId: haulierId });
    const site = data.find((s) => s.id === siteId);
    if (!site || (site.kind !== "delivery" && site.kind !== "both")) throw APIError.failedPrecondition(`The depot must be a delivery site of ${haulierName}`);
    if (site.country !== "CZ") throw APIError.failedPrecondition("The depot must be in CZ");
    return { siteId, place: { text: `${haulierName} ${site.label || "depot"}, ${showPostcode(site.postcode)} ${site.city}`, postcode: site.postcode } };
  }

  // ---- the warehouse's gate ----------------------------------------------------------------------------

  /**
   * A gate stamp heard from our warehouse (topic warehouse-gate-stamped), applied once per
   * (position, kind, time). Gate-in: the job's LTL consignments brought by the customer or with
   * their pick-up still open are AT_HUB, the pick-up leg is done and the promised date becomes
   * final (D+N working days from the gate-in, after the cut-off from the next working day).
   * Gate-out: ON_LINEHAUL or OUT_FOR_DELIVERY by the next leg. Voided: that step is taken back
   * (an event; nothing is deleted). Runs without a user.
   */
  async handleGateStamped(event: GateStampedEvent): Promise<void> {
    const at = new Date(event.at);
    if (!isUuid(event.companyId) || typeof event.positionId !== "string" || !event.positionId || Number.isNaN(at.getTime())) {
      log.warn("trucking: gate event ignored (malformed)", { positionId: event.positionId, kind: event.kind });
      return;
    }
    if (!["gateIn", "gateOut", "voided"].includes(event.kind)) return;
    const companyId = event.companyId;
    const shipmentId = event.shipmentId && isUuid(event.shipmentId) ? event.shipmentId : null;
    const day = businessDay(at);
    const actor = { userID: isUuid(event.userId) ? event.userId : "", role: "user", companyID: companyId };
    const [settings, extra] = await Promise.all([
      settingsService.get(companyId),
      czHolidays(companyId, addDays(day, -10), addDays(day, HOLIDAY_WINDOW_DAYS)),
    ]);
    let touched = 0;
    await inTx(async (tx) => {
      // A gate-out can reach us before its gate-in (both retried after an outage). Recorded now it
      // would change nothing and never be applied again, so it is refused for a retry until the
      // gate-in has come - for a while only: a gate-in that never comes must not hold it forever.
      if (event.kind === "gateOut" && shipmentId && Date.now() - at.getTime() < GATE_OUT_WAIT_MS) {
        const waiting = (await consignmentRepository.ltlForShipmentLocked(tx, companyId, shipmentId)).some((c) => !c.gateInAt && !c.gateOutAt);
        if (waiting && !(await legRepository.hasGateEvent(tx, companyId, event.positionId, "gateIn"))) {
          throw APIError.unavailable("Gate-out received before its gate-in: retried later");
        }
      }
      const fresh = await legRepository.recordGateEvent(tx, {
        companyId,
        shipmentId,
        positionId: event.positionId,
        wczRef: event.wczRef ?? "",
        kind: event.kind,
        stampKind: event.stampKind ?? "",
        at,
        userId: event.userId ?? "",
      });
      if (!fresh || !shipmentId) return;
      const consignments = await consignmentRepository.ltlForShipmentLocked(tx, companyId, shipmentId);
      if (!consignments.length) return;
      const { legs, tripOf } = await consignmentService.ltlContext(companyId, consignments.map((c) => c.id), tx);
      for (const c of consignments) {
        const mine = ltlLegsOf(c.id, legs);
        const pickup = mine.find((l) => l.kind === "PICKUP");
        const change = gateChange(event.kind, event.stampKind ?? "", at, {
          selfDelivered: c.selfDelivered,
          gateInAt: c.gateInAt,
          gateOutAt: c.gateOutAt,
          deliveredAt: c.deliveredAt,
          pickupOpen: !!pickup && pickup.status !== "DONE",
        });
        if (!change) continue;
        const values: ConsignmentValues = { ...change };
        let pickupStatus = pickup?.status;
        if ("gateInAt" in change) {
          const level = settings.serviceLevels.find((l) => l.code === c.serviceLevel) ?? null;
          const estimateDay = pickup?.tripId ? (tripOf.get(pickup.tripId)?.plannedPickupDate ?? c.pickupDate) : c.pickupDate;
          const promised = ltlPromise(level, change.gateInAt ?? null, estimateDay, extra);
          if (promised) Object.assign(values, { promisedDate: promised.promisedDate, promisedFinal: promised.final });
          else values.promisedFinal = !!change.gateInAt;
          pickupStatus = change.gateInAt ? "DONE" : pickup?.tripId ? "PLANNED" : "OPEN";
          if (pickup && pickup.status !== pickupStatus) await legRepository.update(tx, companyId, pickup.id, { status: pickupStatus });
        }
        const patchedLegs = legs.map((l) => (l.id === pickup?.id && pickupStatus ? { ...l, status: pickupStatus } : l));
        values.status = ltlStatus(ltlFactsOf({ ...c, ...values } as TruckingConsignmentRecord, patchedLegs, tripOf));
        const row = await consignmentRepository.update(tx, companyId, c.id, values, { live: true });
        if (!row) continue;
        touched += 1;
        const what = event.kind === "gateIn" ? "Gate-in at our warehouse" : event.kind === "gateOut" ? "Gate-out from our warehouse" : `Warehouse voided the ${"gateInAt" in change ? "gate-in" : "gate-out"}`;
        await appendEvent(tx, companyId, {
          kind: event.kind === "gateIn" ? "gate_in" : event.kind === "gateOut" ? "gate_out" : "gate_voided",
          consignmentId: c.id,
          byUserId: null,
          byName: "Warehouse",
          payload: {
            changes: Object.fromEntries(Object.entries(change).map(([k, v]) => [k, { before: (c as Record<string, unknown>)[k] ?? null, after: v instanceof Date ? v.toISOString() : v }])),
            summary: `${what}: ${stampText(at)}${event.wczRef ? ` (${event.wczRef})` : ""}${values.promisedDate && values.promisedDate !== c.promisedDate ? `; promised ${values.promisedFinal ? "" : "(estimate) "}${values.promisedDate}` : ""}`,
            facts: { positionId: event.positionId, wczRef: event.wczRef, kind: event.kind, stampKind: event.stampKind },
          },
        });
        if (values.promisedDate && values.promisedDate !== c.promisedDate && actor.userID) {
          await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, c, "planned", { plannedDeliveryDate: values.promisedDate })]);
        }
      }
    });
    if (touched) await deliverDue();
  }
}

export const ltlService = new LtlService();
