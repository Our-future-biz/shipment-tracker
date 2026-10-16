import { APIError } from "encore.dev/api";
import { inTx } from "../db/db";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { truckingDocumentRepository } from "../repositories/truckingDocument.repository";
import { listEvents } from "../repositories/event.repository";
import type { TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { FileDownload, LoadInput, StampKind, StopInput } from "../interfaces/interfaces";
import type { PortalOrder, PortalOrderItem, PortalOrderKind, PortalStop } from "../interfaces/portal.interfaces";
import type { TruckingEventPayload } from "../schemas/truckingEvent.schema";
import { isUuid } from "../../../lib/uuid";
import { stampTime } from "../lib/consignmentRules";
import { inStopOrder } from "../lib/ltlView";
import { docStop, platesText } from "../lib/truckingDocs";
import { depotStop } from "../lib/ltlDocs";
import { checkUpload } from "../lib/truckingFiles";
import { cleanText } from "../lib/portalRules";
import { actingFor, type PortalCaller } from "./portalAuth.service";
import { consignmentService } from "./consignment.service";
import { ltlService } from "./ltl.service";
import { CONFIRM_BEFORE_POD, recordAnswer } from "./publicOrder.service";
import { settingsService } from "./settings.service";
import { transportOrderService } from "./transportOrder.service";
import { assertNoPod, insertDocument, POD_ON_FILE_HAULIER, withStoredFile } from "./truckingDocument.service";
import { deliverDue } from "./truckingOutbox.service";

// What a logged-in haulier sees and does in the portal: its own orders only - trips (FTL, pick-up
// run, line haul, delivery run) whose transport order was sent to it and the partner deliveries
// given to it - never a customer's price, a margin, another haulier or a PIN. Every action goes
// through the trucking services' own guarded paths as the haulier (source HAULIER, the portal
// user's name); an order that is not the caller's - another haulier's, cancelled, unknown - is the
// same 404.

export const ORDER_NOT_FOUND = "Order not found";
const MAX_REASON = 500;
const MAX_NAME = 100;
const MAX_DONE = 200;

interface OrderStop {
  c: TruckingConsignmentRecord;
  kind: "PICKUP" | "DELIVERY";
  place: StopInput;
}

/** An order as loaded: a trip with its stops, or a partner delivery (its leg and consignment). */
interface Loaded {
  id: string;
  kind: PortalOrderKind;
  trip: TruckingTripRecord | null;
  leg: TruckingLegRecord | null;
  /** LTL legs in stop order (FTL: []) */
  legs: TruckingLegRecord[];
  stops: OrderStop[];
}

const notFound = () => APIError.notFound(ORDER_NOT_FOUND);
const iso = (d: Date | null) => (d ? d.toISOString() : null);
const placeText = (s: StopInput) => [s.postcode, s.city].filter(Boolean).join(" ");
const consignmentsOf = (o: Loaded) => [...new Map(o.stops.map((s) => [s.c.id, s.c])).values()];
const rejected = (t: TruckingTripRecord | null) => !!t && !!t.rejectedAt && !t.confirmedAt;
/** Stops the haulier delivers (and uploads a POD for): not a line haul's drop at a depot. */
const deliversAt = (o: Loaded) => o.kind === "FTL" || o.kind === "DELIVERY_RUN" || o.kind === "PARTNER_DELIVERY";

/** The stops of an order: an FTL trip's pick-up and delivery, a run's legs in stop order, a partner's delivery. */
function stopsOf(kind: PortalOrderKind, consignments: TruckingConsignmentRecord[], legs: TruckingLegRecord[]): OrderStop[] {
  const byId = new Map(consignments.filter((c) => !c.cancelledAt).map((c) => [c.id, c]));
  if (kind === "FTL") {
    const c = consignments[0];
    return c && !c.cancelledAt ? [{ c, kind: "PICKUP", place: c.pickup }, { c, kind: "DELIVERY", place: c.delivery }] : [];
  }
  return legs.flatMap((l): OrderStop[] => {
    const c = byId.get(l.consignmentId);
    if (!c) return [];
    if (kind === "PICKUP_RUN") return [{ c, kind: "PICKUP", place: c.pickup }];
    if (kind === "LINEHAUL") return [{ c, kind: "DELIVERY", place: depotStop(l.toText, l.toPostcode) }];
    return [{ c, kind: "DELIVERY", place: c.delivery }];
  });
}

function loadOf(l: LoadInput): PortalStop["load"] {
  const adr = l.adr ? [`UN ${l.adrUn}`, l.adrClass, l.adrPackingGroup].filter((x) => x && x.trim()).join(" ") : null;
  return { pieces: l.pieces, palletPlaces: l.palletPlaces, ldm: l.ldm, weightKg: l.weightKg, adr, tailLift: l.tailLift };
}

/** Whether the haulier's part is finished: answered no, arrived, or every POD it owes is in. */
function isDone(o: Loaded): boolean {
  if (rejected(o.trip)) return true;
  if (o.kind === "PICKUP_RUN" || o.kind === "LINEHAUL") return !!o.trip?.arrivedAt;
  const deliveries = o.stops.filter((s) => s.kind === "DELIVERY");
  return deliveries.length > 0 && deliveries.every((s) => !!s.c.podReceivedAt);
}

function statusOf(o: Loaded): string {
  if (o.trip) return rejected(o.trip) ? "REJECTED" : o.trip.status;
  const c = o.stops[0]?.c;
  return c?.podReceivedAt ? "DONE" : c?.deliveredAt ? "DELIVERED" : "PLANNED";
}

function needsAction(o: Loaded, pods: Set<string>): string | null {
  if (o.trip && !o.trip.confirmedAt && !o.trip.rejectedAt) return "Confirm the order";
  if (!deliversAt(o)) return null;
  const missing = o.stops.filter((s) => s.kind === "DELIVERY" && s.c.deliveredAt && !pods.has(s.c.id)).length;
  return missing ? `Upload POD for ${missing} stop${missing === 1 ? "" : "s"}` : null;
}

function item(o: Loaded, pods: Set<string>): PortalOrderItem {
  const cs = consignmentsOf(o);
  const first = o.stops[0];
  const last = o.stops[o.stops.length - 1];
  const buy = o.trip ? o.trip.buy : o.leg!.buy;
  const from = o.kind === "FTL" || o.kind === "PICKUP_RUN" ? (first ? placeText(first.place) : "") : (o.leg ?? o.legs[0])?.fromText ?? "";
  const to = o.kind === "PICKUP_RUN" ? (o.legs[o.legs.length - 1]?.toText ?? "") : last ? placeText(last.place) : "";
  return {
    id: o.id,
    kind: o.kind,
    ref: o.trip ? o.trip.ref : (first?.c.ref ?? ""),
    date: o.trip ? o.trip.plannedPickupDate : (first?.c.promisedDate ?? first?.c.pickupDate ?? ""),
    status: statusOf(o),
    from,
    to,
    stops: o.stops.length,
    palletPlaces: cs.reduce((n, c) => n + c.load.palletPlaces, 0),
    weightKg: cs.reduce((n, c) => n + c.load.weightKg, 0),
    agreedPrice: buy ? { total: buy.total, currency: buy.currency } : null,
    needsAction: needsAction(o, pods),
  };
}

/** The stamps a history line is shown for, per kind of order (an LTL consignment's other legs are another haulier's). */
const STAMPS_SHOWN: Record<PortalOrderKind, StampKind[]> = {
  FTL: ["confirmed", "pickedUp", "delivered", "podReceived"],
  PICKUP_RUN: ["pickedUp"],
  LINEHAUL: [],
  DELIVERY_RUN: ["delivered", "podReceived"],
  PARTNER_DELIVERY: ["delivered", "podReceived"],
};

type Price = { total: number; currency: string } | null;
const priceText = (p: Price) => (p ? `${p.total.toFixed(2)} ${p.currency}` : "none");

/** An agreed price changed after the order went out, as the haulier reads it (never the reason). */
function priceChangeText(facts: Record<string, unknown>): string {
  return `Agreed price changed: ${priceText(facts.priceBefore as Price)} → ${priceText(facts.priceAfter as Price)}`;
}

/**
 * The order's history as the haulier may read it: the transport order sent and answered, the
 * agreed price changed after it went out, and the stamps of its own part, in our wording - never a summary that could carry a price, a margin, a
 * recipient or an internal note.
 */
async function historyOf(o: Loaded): Promise<{ at: string; text: string }[]> {
  const companyId = (o.trip ?? o.stops[0]?.c)?.companyId ?? "";
  const refOf = new Map(o.stops.map((s) => [s.c.id, s.c.ref]));
  const lists = await Promise.all([
    o.trip ? listEvents(companyId, { tripId: o.trip.id }) : Promise.resolve([]),
    ...[...refOf.keys()].map((consignmentId) => listEvents(companyId, { consignmentId })),
  ]);
  const seen = new Set<string>();
  const out: { at: Date; text: string }[] = [];
  for (const e of lists.flat()) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const payload = e.payload as TruckingEventPayload;
    const ownTrip = !!o.trip && e.tripId === o.trip.id;
    let text: string | null = null;
    if (ownTrip && e.kind === "transport_order_sent") text = "Transport order sent";
    else if (ownTrip && e.kind === "transport_order_confirmed") text = "Order confirmed";
    else if (ownTrip && e.kind === "transport_order_rejected") text = `Order rejected${payload.reason ? `: ${payload.reason}` : ""}`;
    else if (ownTrip && e.kind === "trip_stamp_set") text = payload.summary ?? null;
    else if (ownTrip && e.kind === "trip_repriced" && payload.facts?.afterOrder) text = priceChangeText(payload.facts);
    else if (o.leg && e.kind === "partner_delivery_set" && payload.facts?.afterOrder && payload.facts.legId === o.leg.id && payload.facts.partner === o.leg.haulierCustomerId) {
      text = priceChangeText(payload.facts);
    }
    else if (e.kind === "stamp_set" && STAMPS_SHOWN[o.kind].includes(payload.facts?.kind as StampKind)) {
      const ref = e.consignmentId ? refOf.get(e.consignmentId) : null;
      text = ref && payload.summary ? `${ref}: ${payload.summary}` : null;
    }
    if (text) out.push({ at: e.at, text });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime()).map((h) => ({ at: h.at.toISOString(), text: h.text }));
}

class PortalOrderService {
  /** The order `id` (a trip or a partner delivery leg) if it is the caller's; the same 404 for anything else. */
  async load(caller: PortalCaller, id: string): Promise<Loaded> {
    if (!isUuid(id)) throw notFound();
    const { companyId, haulierId } = caller;
    const trip = await tripRepository.find(companyId, id);
    if (trip) {
      if (trip.haulierCustomerId !== haulierId || !trip.orderSentAt || trip.cancelledAt) throw notFound();
      const o = await this.ofTrips(companyId, [trip]);
      if (!o[0]?.stops.length) throw notFound();
      return o[0];
    }
    const leg = await legRepository.find(companyId, id);
    if (!leg || leg.kind !== "DELIVERY" || leg.tripId || leg.haulierCustomerId !== haulierId || leg.status === "OPEN") throw notFound();
    const o = await this.ofPartnerLegs(companyId, haulierId, [leg]);
    if (!o[0]) throw notFound();
    return o[0];
  }

  private async ofTrips(companyId: string, trips: TruckingTripRecord[]): Promise<Loaded[]> {
    const ftl = trips.filter((t) => t.kind === "FTL");
    const ltl = trips.filter((t) => t.kind !== "FTL");
    const [ftlConsignments, legs] = await Promise.all([consignmentRepository.findByTrips(companyId, ftl.map((t) => t.id)), legRepository.forTrips(companyId, ltl.map((t) => t.id))]);
    const ltlConsignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    return trips.map((trip): Loaded => {
      if (trip.kind === "FTL") {
        return { id: trip.id, kind: "FTL", trip, leg: null, legs: [], stops: stopsOf("FTL", ftlConsignments.filter((c) => c.tripId === trip.id), []) };
      }
      const own = inStopOrder(legs.filter((l) => l.tripId === trip.id), trip.stopOrder);
      return { id: trip.id, kind: trip.kind, trip, leg: null, legs: own, stops: stopsOf(trip.kind, ltlConsignments, own) };
    });
  }

  private async ofPartnerLegs(companyId: string, haulierId: string, legs: TruckingLegRecord[]): Promise<Loaded[]> {
    const consignments = await consignmentRepository.findMany(companyId, [...new Set(legs.map((l) => l.consignmentId))]);
    const byId = new Map(consignments.map((c) => [c.id, c]));
    return legs.flatMap((leg): Loaded[] => {
      const c = byId.get(leg.consignmentId);
      if (!c || c.cancelledAt || c.lastMile !== "PARTNER" || c.partnerHaulierCustomerId !== haulierId) return [];
      return [{ id: leg.id, kind: "PARTNER_DELIVERY", trip: null, leg, legs: [leg], stops: stopsOf("PARTNER_DELIVERY", [c], [leg]) }];
    });
  }

  /** The caller's orders: open (soonest first) or done (newest first, at most 200). */
  async list(caller: PortalCaller, view: unknown): Promise<PortalOrderItem[]> {
    const done = view === "done";
    if (view !== undefined && view !== null && view !== "" && view !== "open" && !done) throw APIError.invalidArgument("The view must be open or done");
    const { companyId, haulierId } = caller;
    const [trips, partnerLegs] = await Promise.all([tripRepository.forHaulier(companyId, haulierId), legRepository.partnerFor(companyId, haulierId)]);
    const orders = [...(await this.ofTrips(companyId, trips)), ...(await this.ofPartnerLegs(companyId, haulierId, partnerLegs))].filter((o) => o.stops.length && isDone(o) === done);
    const pods = await truckingDocumentRepository.withPod(companyId, [...new Set(orders.flatMap((o) => o.stops.map((s) => s.c.id)))]);
    const items = orders.map((o) => item(o, pods)).sort((a, b) => a.date.localeCompare(b.date) || a.ref.localeCompare(b.ref));
    return done ? items.reverse().slice(0, MAX_DONE) : items;
  }

  async get(caller: PortalCaller, id: string): Promise<PortalOrder> {
    return this.view(await this.load(caller, id));
  }

  private async view(o: Loaded): Promise<PortalOrder> {
    const companyId = (o.trip ?? o.stops[0]!.c).companyId;
    const [pods, settings, history] = await Promise.all([
      truckingDocumentRepository.withPod(companyId, consignmentsOf(o).map((c) => c.id)),
      settingsService.get(companyId),
      historyOf(o),
    ]);
    const t = o.trip;
    const vehicle = t ? settings.vehicleTypes.find((v) => v.code === t.vehicleTypeCode) : null;
    const pickups = o.stops.filter((s) => s.kind === "PICKUP").map((s) => s.c.pickedUpAt);
    const loaded = o.kind === "FTL" || o.kind === "PICKUP_RUN" ? (pickups.length && pickups.every(Boolean) ? new Date(Math.max(...pickups.map((d) => d!.getTime()))) : null) : null;
    const { stops: _count, ...base } = item(o, pods);
    return {
      ...base,
      stops: o.stops.map((s): PortalStop => {
        const place = docStop(s.place);
        const lineHaul = o.kind === "LINEHAUL";
        return {
          consignmentRef: s.c.ref,
          consignmentId: s.c.id,
          kind: s.kind,
          name: place.name,
          street: place.street,
          postcode: place.postcode,
          city: place.city,
          windowText: lineHaul ? "" : place.windowText,
          contact: lineHaul ? "" : place.contact,
          reference: lineHaul ? "" : place.reference,
          notes: lineHaul ? "" : place.notes,
          avizaceRequired: !lineHaul && place.avizaceRequired,
          load: loadOf(s.c.load),
          deliveredAt: s.kind === "DELIVERY" && !lineHaul ? iso(s.c.deliveredAt) : null,
          podUploaded: s.kind === "DELIVERY" && !lineHaul && pods.has(s.c.id),
        };
      }),
      vehicleText: vehicle ? `${vehicle.label}${vehicle.tailLift ? ", tail lift" : ""}` : "",
      plates: t ? platesText(t.tractorPlate, t.trailerPlate) : "",
      driver: t ? [t.driverName, t.driverPhone].filter((x) => x.trim()).join(", ") : "",
      confirmation: !t
        ? { status: "CONFIRMED", at: null, by: null }
        : t.confirmedAt
          ? { status: "CONFIRMED", at: iso(t.confirmedAt), by: t.confirmedBy }
          : t.rejectedAt
            ? { status: "REJECTED", at: iso(t.rejectedAt), by: null }
            : { status: "AWAITING", at: null, by: null },
      stamps: { loaded: iso(loaded), departed: iso(t?.departedAt ?? null), arrived: iso(t?.arrivedAt ?? null) },
      history,
    };
  }

  /** Confirm or reject a trip's transport order, once; a rejection needs the reason. */
  async respond(caller: PortalCaller, id: string, input: { action: unknown; reason: unknown }): Promise<PortalOrder> {
    const o = await this.load(caller, id);
    const trip = o.trip;
    if (!trip) throw APIError.failedPrecondition("A partner delivery has no transport order to confirm");
    const action = input.action;
    if (action !== "CONFIRM" && action !== "REJECT") throw APIError.invalidArgument("The answer must be CONFIRM or REJECT");
    const reason = action === "REJECT" ? cleanText(input.reason, "Give the reason for rejecting", 3, MAX_REASON) : "";
    if (trip.confirmedAt || trip.rejectedAt) throw APIError.failedPrecondition("This transport order was already answered");
    const c = trip.kind === "FTL" ? (o.stops[0]?.c ?? null) : null;
    await inTx((tx) => recordAnswer(tx, trip, c, action, caller.who, reason, "PORTAL"));
    return this.get(caller, id);
  }

  /**
   * Loaded / Departed / Arrived. Loaded = the pick-up of an FTL trip's consignment, or of every
   * consignment of a pick-up run not picked up yet; Departed / Arrived = the LTL trip's stamps
   * (a line haul or delivery run leaves only after our warehouse's gate-in). Each through the
   * service's own checks, as the haulier.
   */
  async stamp(caller: PortalCaller, id: string, input: { kind: unknown; at: string | null }): Promise<PortalOrder> {
    const o = await this.load(caller, id);
    const trip = o.trip;
    if (!trip) throw APIError.failedPrecondition("A partner delivery is stamped per stop: Delivered and the POD");
    if (rejected(trip)) throw APIError.failedPrecondition("This transport order was rejected");
    const actor = await actingFor(caller.user);
    const who = { by: caller.who, source: "HAULIER" as const, manager: false };
    if (input.kind === "LOADED") {
      if (o.kind !== "FTL" && o.kind !== "PICKUP_RUN") throw APIError.failedPrecondition("Loading at our warehouse is stamped by the warehouse");
      const open = consignmentsOf(o).filter((c) => !c.pickedUpAt);
      if (!open.length) throw APIError.alreadyExists("Already stamped");
      for (const c of open) {
        const refusal = await consignmentService.stampRefusalOf(c, o.kind === "FTL" ? trip : null, "pickedUp", false);
        if (refusal) throw APIError.failedPrecondition(o.kind === "FTL" ? refusal : `${c.ref}: ${refusal}`);
      }
      for (const c of open) await consignmentService.stampChecked(actor, c.id, "pickedUp", input.at ?? null, who);
    } else if (input.kind === "DEPARTED" || input.kind === "ARRIVED") {
      await ltlService.tripStampChecked(actor, trip.id, input.kind === "DEPARTED" ? "departed" : "arrived", input.at ?? null, { by: caller.who });
    } else {
      throw APIError.invalidArgument("The stamp must be LOADED, DEPARTED or ARRIVED");
    }
    return this.get(caller, id);
  }

  /** The delivery stop of the order for the consignment; 404 when the order has none. */
  private deliveryStop(o: Loaded, consignmentId: string): TruckingConsignmentRecord {
    if (!deliversAt(o)) throw APIError.notFound("Stop not found");
    const stop = o.stops.find((s) => s.kind === "DELIVERY" && s.c.id === consignmentId);
    if (!stop) throw APIError.notFound("Stop not found");
    if (rejected(o.trip)) throw APIError.failedPrecondition("This transport order was rejected");
    return stop.c;
  }

  /** Delivered at one stop (null = now), through the consignment's own checks. */
  async delivered(caller: PortalCaller, id: string, consignmentId: string, input: { at: string | null; receiverName: unknown }): Promise<PortalOrder> {
    const o = await this.load(caller, id);
    const c = this.deliveryStop(o, consignmentId);
    const receiver = typeof input.receiverName === "string" ? input.receiverName.trim().slice(0, MAX_NAME) : "";
    const by = receiver ? `${caller.who}, received by ${receiver}` : caller.who;
    await consignmentService.stampChecked(await actingFor(caller.user), c.id, "delivered", input.at ?? null, { by, source: "HAULIER", manager: false });
    return this.get(caller, id);
  }

  /**
   * The POD of one stop (a photo or a PDF, at most 10 MB, the type taken from the bytes), as the
   * transport-order link takes it: only once the order is confirmed (a partner delivery has no
   * confirmation) and one per stop (a manager replaces it in the app). Stamps the delivery when
   * missing (an FTL pick-up first), then POD received (source HAULIER), which may send the job to
   * Billing. Refused before anything is stored when the delivery may not be stamped yet; the file
   * is removed again when the transaction fails.
   */
  async pod(
    caller: PortalCaller,
    id: string,
    consignmentId: string,
    input: { fileName: unknown; fileBase64: unknown; receiverName: unknown; deliveredAt: string | null },
  ): Promise<PortalOrder> {
    const o = await this.load(caller, id);
    const c = this.deliveryStop(o, consignmentId);
    if (o.trip && !o.trip.confirmedAt) throw APIError.failedPrecondition(CONFIRM_BEFORE_POD);
    const companyId = caller.companyId;
    if (await truckingDocumentRepository.hasPod(companyId, c.id)) throw APIError.failedPrecondition(POD_ON_FILE_HAULIER);
    const trip = o.kind === "FTL" ? o.trip : null;
    const now = new Date();
    const deliveredAt = stampTime(input.deliveredAt ?? null, now);
    if (!c.deliveredAt) {
      const first = trip && !c.pickedUpAt ? "pickedUp" : "delivered";
      const refusal = await consignmentService.stampRefusalOf(c, trip, first, false);
      if (refusal) throw APIError.failedPrecondition(refusal);
    }
    const file = checkUpload(input.fileName, input.fileBase64, true);
    const receiver = typeof input.receiverName === "string" ? input.receiverName.trim().slice(0, MAX_NAME) : "";
    const by = receiver ? `${caller.who}, received by ${receiver}` : caller.who;
    const actor = await actingFor(caller.user);
    await withStoredFile(companyId, c.id, file, (key) => inTx(async (tx) => {
      await assertNoPod(tx, companyId, c.id, POD_ON_FILE_HAULIER);
      await insertDocument(tx, companyId, c.id, file, key, { kind: "POD", source: "HAULIER", userId: null, name: by });
      // The stamps the POD proves, in order; each one guarded, each on the row the previous one left.
      let row = (await consignmentRepository.find(companyId, c.id, tx))!;
      if (trip && !row.pickedUpAt) row = await consignmentService.stampInTx(tx, actor, row, trip, "pickedUp", deliveredAt, by, "HAULIER");
      if (!row.deliveredAt) {
        const at = row.pickedUpAt && deliveredAt < row.pickedUpAt ? row.pickedUpAt : deliveredAt;
        row = await consignmentService.stampInTx(tx, actor, row, trip, "delivered", at, by, "HAULIER");
      }
      if (!row.podReceivedAt) await consignmentService.stampInTx(tx, actor, row, trip, "podReceived", now, by, "HAULIER");
    }));
    await deliverDue(c.id);
    return this.get(caller, id);
  }

  /** The transport order of a trip as a PDF, without a PIN. */
  async transportOrder(caller: PortalCaller, id: string): Promise<FileDownload> {
    const o = await this.load(caller, id);
    if (!o.trip) throw APIError.failedPrecondition("A partner delivery has no transport order");
    return transportOrderService.haulierCopy(o.trip, await actingFor(caller.user), caller.who);
  }
}

export const portalOrderService = new PortalOrderService();
