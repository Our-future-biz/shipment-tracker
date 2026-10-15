import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What a logged-in haulier sees and does in the portal, run for real against the in-memory
// repositories (truckingFakes): its own orders only (FTL, pick-up run, line haul, delivery run,
// partner delivery), the one answer, the stamps through the trucking services' own checks, the
// POD per stop with the Billing rule, and the transport order without a PIN.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(async () => ({ customer: null })), contactList: vi.fn(async () => ({ data: [] })), _internalHaulierList: vi.fn() },
  invoicing: { invoiceProfileGet: vi.fn(async () => ({ profile: null })) },
  sales: { prefGet: vi.fn(async () => ({ value: null })) },
  shipments: {},
  quotes: {},
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
}));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../repositories/consignment.repository", async (orig) => ({
  ...(await orig<object>()),
  consignmentRepository: (await import("./truckingFakes")).consignmentRepository,
}));
vi.mock("../repositories/trip.repository", async () => ({ tripRepository: (await import("./truckingFakes")).tripRepository }));
vi.mock("../repositories/leg.repository", async () => ({ legRepository: (await import("./truckingFakes")).legRepository }));
vi.mock("../repositories/truckingDocument.repository", async () => ({ truckingDocumentRepository: (await import("./truckingFakes")).truckingDocumentRepository }));
vi.mock("../repositories/truckingOutbox.repository", async () => ({ truckingOutboxRepository: (await import("./truckingFakes")).truckingOutboxRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
vi.mock("../repositories/exception.repository", async () => ({ exceptionRepository: (await import("./truckingFakes")).exceptionRepository }));
vi.mock("../repositories/internal.repository", async () => ({ internalRepository: (await import("./truckingFakes")).internalRepository }));
vi.mock("../repositories/portal.repository", async () => ({ portalRepository: (await import("./portalFakes")).portalRepository }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { find: vi.fn(async () => null), findMany: vi.fn(async () => []) } }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: { list: vi.fn(async () => []), bindingOn: vi.fn(async () => []) } }));
vi.mock("../services/haulier.service", async (orig) => ({ ...(await orig<object>()), haulierService: { get: vi.fn() } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: { upload: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../lib/transportOrderPdf", () => ({ buildTransportOrderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../lib/ltlTransportOrderPdf", () => ({ buildLtlTransportOrderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

import { customers } from "~encore/clients";
import { portalOrderService, ORDER_NOT_FOUND } from "../services/portalOrder.service";
import type { PortalCaller } from "../services/portalAuth.service";
import { haulierService } from "../services/haulier.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { buildTransportOrderPdf } from "../lib/transportOrderPdf";
import { buildLtlTransportOrderPdf } from "../lib/ltlTransportOrderPdf";
import type { HaulierDetail, TripKind } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { PortalUserRecord } from "../schemas/portal.schema";
import { COMPANY, CUSTOMER, HAULIER, HAULIER2, SHIPMENT, TX, USER, eventsOf, load, outboxOf, resetStore, stop, store } from "./truckingFakes";

const SENDER = "00000000-0000-0000-0000-000000000003";
const SHIPMENT2 = "00000000-0000-0000-0000-0000000000d2";
const PDF = Buffer.from("%PDF-1.7\n%…").toString("base64");
const HTML = Buffer.from("<html><script>alert(1)</script></html>").toString("base64");

/** A logged-in portal user of `haulierId` (the session check itself is portalAuth.test's). */
const callerOf = (haulierId: string): PortalCaller => ({
  session: { id: "s1" } as never,
  user: { id: "u1", companyId: COMPANY, haulierCustomerId: haulierId, name: "Eva Malá", email: "eva@bravo.cz", createdBy: USER } as PortalUserRecord,
  companyId: COMPANY,
  haulierId,
  who: "Eva Malá (haulier)",
});
const eva = callerOf(HAULIER);
const other = callerOf(HAULIER2);

let refNo = 0;
async function consignment(over: Partial<TruckingConsignmentRecord> = {}) {
  refNo += 1;
  return consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `TCZ2026${String(refNo).padStart(6, "0")}`,
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    status: "ORDERED",
    pickupDate: "2026-10-15",
    pickup: { ...stop({ name: "Alfa s.r.o.", windowFrom: "2026-10-15T06:00:00Z", windowTo: "2026-10-15T10:00:00Z" }), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ name: "Beta a.s.", city: "Brno", notes: "Ramp 3" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load({ adr: true, adrUn: "1203", adrClass: "3", adrPackingGroup: "II" }),
    sell: { source: "TARIFF", total: 12345, currency: "CZK" } as never,
    sellCzk: 12345,
    estBuyCzk: 7777,
    ...over,
  });
}

async function trip(kind: TripKind, over: Partial<TruckingTripRecord> = {}) {
  refNo += 1;
  return tripRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `LCZ2026${String(refNo).padStart(6, "0")}`,
    kind,
    haulierCustomerId: HAULIER,
    haulierName: "Bravo Trans",
    plannedPickupDate: "2026-10-16",
    status: "ORDERED",
    orderSentAt: new Date("2026-10-14T08:00:00Z"),
    orderSentByUserId: SENDER,
    orderSentByRole: "user",
    pinPrinted: true,
    tractorPlate: "1AB2345",
    driverName: "Karel",
    driverPhone: "+420 600",
    buy: { source: "MANUAL", total: 9000, currency: "CZK" } as never,
    ...over,
  });
}

/** An FTL trip sent to Bravo and its consignment. */
async function ftl(over: Partial<TruckingTripRecord> = {}) {
  const t = await trip("FTL", over);
  const c = await consignment({ tripId: t.id });
  return { trip: t, c };
}

/** An LTL trip of `kind` carrying one leg of each consignment, in stop order. */
async function run(kind: Exclude<TripKind, "FTL">, cs: TruckingConsignmentRecord[], over: Partial<TruckingTripRecord> = {}) {
  const t = await trip(kind, over);
  const legKind = kind === "PICKUP_RUN" ? "PICKUP" : kind === "LINEHAUL" ? "LINEHAUL" : "DELIVERY";
  const legs = await legRepository.insertMany(
    TX as never,
    cs.map((c) => ({
      companyId: COMPANY,
      consignmentId: c.id,
      tripId: t.id,
      seq: legKind === "PICKUP" ? 1 : legKind === "LINEHAUL" ? 2 : 3,
      kind: legKind,
      status: "PLANNED",
      fromText: legKind === "PICKUP" ? "Alfa s.r.o., 110 00 Praha" : "Sklad Brandýs, 250 01 Brandýs nad Labem",
      toText: legKind === "PICKUP" ? "Sklad Brandýs, 250 01 Brandýs nad Labem" : legKind === "LINEHAUL" ? "Bravo depot, 602 00 Brno" : "Beta a.s., 602 00 Brno",
      fromPostcode: "25001",
      toPostcode: "60200",
    })),
  );
  store.trips.find((x) => x.id === t.id)!.stopOrder = legs.map((l) => l.id);
  return { trip: store.trips.find((x) => x.id === t.id)!, legs };
}

const ltl = (over: Partial<TruckingConsignmentRecord> = {}) => consignment({ scope: "LTL", lastMile: "OWN_RUN", status: "PLANNED", ...over });

/** An LTL consignment Bravo delivers as the partner: its delivery leg priced with Bravo, on no trip. */
async function partner(over: Partial<TruckingConsignmentRecord> = {}) {
  const c = await ltl({ lastMile: "PARTNER", partnerHaulierCustomerId: HAULIER, ...over });
  const [leg] = await legRepository.insertMany(TX as never, [
    {
      companyId: COMPANY,
      consignmentId: c.id,
      seq: 3,
      kind: "DELIVERY",
      status: "PLANNED",
      fromText: "Sklad Brandýs, 250 01 Brandýs nad Labem",
      toText: "Beta a.s., 602 00 Brno",
      haulierCustomerId: HAULIER,
      buy: { source: "MANUAL", total: 1500, currency: "CZK" } as never,
    },
  ]);
  return { c, leg: leg! };
}

const cOf = (id: string) => store.consignments.find((c) => c.id === id)!;
const tripOf = (id: string) => store.trips.find((t) => t.id === id)!;
const gateIn = (id: string) => (cOf(id).gateInAt = new Date("2026-10-15T07:00:00Z"));

const haulier = (id: string, name: string) =>
  ({ customerId: id, companyName: name, ico: "1", dic: "CZ1", city: "Brno", profile: { adrCapable: false, paymentDays: 30 }, status: "ok", issues: [] }) as unknown as HaulierDetail;

beforeEach(() => {
  resetStore();
  refNo = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.mocked(haulierService.get).mockImplementation(async (_c, id) => haulier(id, id === HAULIER ? "Bravo Trans" : "Gama"));
});

afterEach(() => vi.useRealTimers());

describe("scope: a portal user sees and acts on its own haulier's orders only", () => {
  it("lists its trips and partner deliveries, not another haulier's, a cancelled trip or a transport order not sent", async () => {
    const own = await ftl();
    await ftl({ haulierCustomerId: HAULIER2, haulierName: "Gama" });
    await ftl({ cancelledAt: new Date(), status: "CANCELLED" });
    await ftl({ orderSentAt: null, status: "DRAFT" });
    const p = await partner();
    const orders = await portalOrderService.list(eva, "open");
    expect(orders.map((o) => [o.kind, o.id])).toEqual(expect.arrayContaining([["FTL", own.trip.id], ["PARTNER_DELIVERY", p.leg.id]]));
    expect(orders).toHaveLength(2);
    expect(await portalOrderService.list(other, "open")).toHaveLength(1);
  });

  it("answers another haulier's order, a cancelled trip, an unsent one and an unknown id with the same 404 - for reading and acting", async () => {
    const own = await ftl();
    const p = await partner();
    const cancelled = await ftl({ cancelledAt: new Date(), status: "CANCELLED" });
    const draft = await ftl({ orderSentAt: null, status: "DRAFT" });
    const notFound = { code: "not_found", message: ORDER_NOT_FOUND };
    for (const id of [own.trip.id, p.leg.id]) {
      await expect(portalOrderService.get(other, id)).rejects.toMatchObject(notFound);
      await expect(portalOrderService.respond(other, id, { action: "CONFIRM", reason: "" })).rejects.toMatchObject(notFound);
      await expect(portalOrderService.stamp(other, id, { kind: "LOADED", at: null })).rejects.toMatchObject(notFound);
      await expect(portalOrderService.transportOrder(other, id)).rejects.toMatchObject(notFound);
    }
    await expect(portalOrderService.delivered(other, own.trip.id, own.c.id, { at: null, receiverName: "" })).rejects.toMatchObject(notFound);
    await expect(portalOrderService.pod(other, p.leg.id, p.c.id, { fileName: "pod.pdf", fileBase64: PDF, receiverName: "", deliveredAt: null })).rejects.toMatchObject(notFound);
    for (const id of [cancelled.trip.id, draft.trip.id, "00000000-0000-0000-0000-00000000ffff", "not-a-uuid"]) {
      await expect(portalOrderService.get(eva, id)).rejects.toMatchObject(notFound);
    }
    await expect(portalOrderService.stamp(eva, cancelled.trip.id, { kind: "LOADED", at: null })).rejects.toMatchObject(notFound);
    expect(store.events).toHaveLength(0);
  });

  it("a partner delivery that was handed to another partner is no longer the old partner's", async () => {
    const p = await partner();
    cOf(p.c.id).partnerHaulierCustomerId = HAULIER2;
    store.ltlLegs.find((l) => l.id === p.leg.id)!.haulierCustomerId = HAULIER2;
    await expect(portalOrderService.get(eva, p.leg.id)).rejects.toMatchObject({ code: "not_found" });
  });

  it("never shows the customer's price, a margin, the estimate or a PIN", async () => {
    const own = await ftl();
    const p = await partner();
    for (const out of [await portalOrderService.list(eva, "open"), await portalOrderService.get(eva, own.trip.id), await portalOrderService.get(eva, p.leg.id)]) {
      const json = JSON.stringify(out);
      for (const secret of ["12345", "7777", "sell", "margin", "pickupPin", "pinPrinted", "customerName", "jobNumber"]) expect(json).not.toContain(secret);
    }
  });
});

describe("order views", () => {
  it("an FTL order: pick-up and delivery with windows, contacts and load, the agreed price, the truck, awaiting confirmation", async () => {
    const { trip: t, c } = await ftl();
    const order = await portalOrderService.get(eva, t.id);
    expect(order).toMatchObject({
      id: t.id,
      kind: "FTL",
      ref: t.ref,
      date: "2026-10-16",
      status: "ORDERED",
      from: "11000 Praha",
      to: "60200 Brno",
      palletPlaces: 10,
      weightKg: 5000,
      agreedPrice: { total: 9000, currency: "CZK" },
      needsAction: "Confirm the order",
      plates: "1AB2345",
      driver: "Karel, +420 600",
      confirmation: { status: "AWAITING", at: null, by: null },
      stamps: { loaded: null, departed: null, arrived: null },
    });
    expect(order.stops).toEqual([
      expect.objectContaining({ kind: "PICKUP", consignmentId: c.id, consignmentRef: c.ref, name: "Alfa s.r.o.", postcode: "110 00", windowText: expect.stringContaining("15 Oct 2026"), contact: "Jan Novák, +420 777 000 111" }),
      expect.objectContaining({ kind: "DELIVERY", name: "Beta a.s.", city: "Brno", notes: "Ramp 3", deliveredAt: null, podUploaded: false }),
    ]);
    expect(order.stops[0]!.load).toEqual({ pieces: 10, palletPlaces: 10, ldm: 4, weightKg: 5000, adr: "UN 1203 3 II", tailLift: false });
  });

  it("a pick-up run: one pick-up stop per consignment in stop order, to our warehouse", async () => {
    const a = await ltl();
    const b = await ltl({ pickup: { ...cOfStop("Gama s.r.o.") } });
    const { trip: t } = await run("PICKUP_RUN", [b, a]);
    const order = await portalOrderService.get(eva, t.id);
    expect(order).toMatchObject({ kind: "PICKUP_RUN", to: "Sklad Brandýs, 250 01 Brandýs nad Labem", palletPlaces: 20 });
    expect(order.stops.map((s) => [s.kind, s.consignmentRef, s.name])).toEqual([
      ["PICKUP", b.ref, "Gama s.r.o."],
      ["PICKUP", a.ref, "Alfa s.r.o."],
    ]);
  });

  it("a line haul: the drop at the partner's depot, without the consignees' contacts", async () => {
    const a = await ltl();
    const { trip: t } = await run("LINEHAUL", [a]);
    const order = await portalOrderService.get(eva, t.id);
    expect(order).toMatchObject({ kind: "LINEHAUL", from: "Sklad Brandýs, 250 01 Brandýs nad Labem" });
    expect(order.stops[0]).toMatchObject({ kind: "DELIVERY", name: "Bravo depot, 602 00 Brno", contact: "", notes: "", deliveredAt: null, podUploaded: false });
  });

  it("a delivery run: one delivery stop per consignment", async () => {
    const a = await ltl();
    const b = await ltl();
    const { trip: t } = await run("DELIVERY_RUN", [a, b]);
    const order = await portalOrderService.get(eva, t.id);
    expect(order.stops.map((s) => [s.kind, s.consignmentRef])).toEqual([
      ["DELIVERY", a.ref],
      ["DELIVERY", b.ref],
    ]);
  });

  it("a partner delivery: the consignee, the partner's agreed price, nothing to confirm", async () => {
    const { c, leg } = await partner({ promisedDate: "2026-10-17" });
    const order = await portalOrderService.get(eva, leg.id);
    expect(order).toMatchObject({
      id: leg.id,
      kind: "PARTNER_DELIVERY",
      ref: c.ref,
      date: "2026-10-17",
      status: "PLANNED",
      from: "Sklad Brandýs, 250 01 Brandýs nad Labem",
      agreedPrice: { total: 1500, currency: "CZK" },
      needsAction: null,
      plates: "",
      confirmation: { status: "CONFIRMED", at: null, by: null },
    });
    expect(order.stops).toEqual([expect.objectContaining({ kind: "DELIVERY", consignmentId: c.id, name: "Beta a.s." })]);
  });

  it("open and done: a delivered FTL order asks for its POD; with the POD in it is done", async () => {
    const { trip: t, c } = await ftl({ confirmedAt: new Date("2026-10-14T09:00:00Z"), status: "CONFIRMED" });
    await portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null });
    await portalOrderService.delivered(eva, t.id, c.id, { at: null, receiverName: "" });
    expect((await portalOrderService.list(eva, "open"))[0]!.needsAction).toBe("Upload POD for 1 stop");
    await portalOrderService.pod(eva, t.id, c.id, { fileName: "pod.jpg", fileBase64: PDF, receiverName: "", deliveredAt: null });
    expect(await portalOrderService.list(eva, "open")).toHaveLength(0);
    expect((await portalOrderService.list(eva, "done")).map((o) => o.id)).toEqual([t.id]);
    await expect(portalOrderService.list(eva, "everything")).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("the history shows the order's own steps in our words, never an internal summary", async () => {
    const { trip: t, c } = await ftl();
    store.events.push(
      { kind: "transport_order_sent", tripId: t.id, consignmentId: c.id, at: new Date("2026-10-14T08:00:00Z"), id: "e1", payload: { changes: {}, summary: "Transport order sent to boss@bravo.cz (PIN printed)" } },
      { kind: "margin_approved", consignmentId: c.id, at: new Date("2026-10-14T07:00:00Z"), id: "e2", payload: { changes: {}, summary: "Margin 12345 CZK approved" } },
      { kind: "consignment_updated", consignmentId: c.id, at: new Date("2026-10-14T07:30:00Z"), id: "e3", payload: { changes: {}, summary: "Internal note: call the boss" } },
    );
    await portalOrderService.respond(eva, t.id, { action: "CONFIRM", reason: "" });
    await portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null });
    const { history } = await portalOrderService.get(eva, t.id);
    expect(history.map((h) => h.text)).toEqual([expect.stringContaining(`${c.ref}: Picked up`), "Order confirmed", "Transport order sent"]);
    expect(JSON.stringify(history)).not.toMatch(/boss|12345|Internal/);
  });
});

describe("confirm or reject, once (trips only)", () => {
  it("confirms an FTL order as the portal user: trip and consignment confirmed, an event by the haulier", async () => {
    const { trip: t, c } = await ftl();
    const order = await portalOrderService.respond(eva, t.id, { action: "CONFIRM", reason: "" });
    expect(order.confirmation).toMatchObject({ status: "CONFIRMED", by: "Eva Malá (haulier)" });
    expect(tripOf(t.id)).toMatchObject({ status: "CONFIRMED", confirmedVia: "LINK", confirmedBy: "Eva Malá (haulier)" });
    expect(cOf(c.id)).toMatchObject({ status: "CONFIRMED", confirmedBy: "Eva Malá (haulier)" });
    expect(eventsOf("transport_order_confirmed")[0]).toMatchObject({ byUserId: null, byName: "Eva Malá (haulier)", payload: expect.objectContaining({ facts: { via: "PORTAL" } }) });
    await expect(portalOrderService.respond(eva, t.id, { action: "REJECT", reason: "No truck" })).rejects.toMatchObject({ code: "failed_precondition", message: "This transport order was already answered" });
  });

  it("rejects an LTL run with the reason (required); no stamp after a rejection", async () => {
    const { trip: t } = await run("DELIVERY_RUN", [await ltl()]);
    await expect(portalOrderService.respond(eva, t.id, { action: "REJECT", reason: " " })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(portalOrderService.respond(eva, t.id, { action: "MAYBE", reason: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    const order = await portalOrderService.respond(eva, t.id, { action: "REJECT", reason: "No driver that day" });
    expect(order).toMatchObject({ status: "REJECTED", confirmation: { status: "REJECTED" } });
    expect(tripOf(t.id)).toMatchObject({ rejectReason: "No driver that day" });
    await expect(portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null })).rejects.toMatchObject({ message: "This transport order was rejected" });
    expect((await portalOrderService.list(eva, "done")).map((o) => o.id)).toEqual([t.id]);
  });

  it("a partner delivery has nothing to confirm", async () => {
    const { leg } = await partner();
    await expect(portalOrderService.respond(eva, leg.id, { action: "CONFIRM", reason: "" })).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("stamps through the trucking services' own checks", () => {
  it("FTL: Loaded is the pick-up, by the haulier; Departed / Arrived are refused with the service's own words", async () => {
    const { trip: t, c } = await ftl();
    const order = await portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null });
    expect(order.stamps.loaded).toBe("2026-10-15T10:00:00.000Z");
    expect(cOf(c.id)).toMatchObject({ pickedUpBy: "Eva Malá (haulier)", status: "PICKED_UP" });
    expect(eventsOf("stamp_set")[0]).toMatchObject({ byUserId: null, byName: "Eva Malá (haulier)", payload: expect.objectContaining({ facts: { kind: "pickedUp", source: "HAULIER" } }) });
    await expect(portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null })).rejects.toMatchObject({ code: "already_exists" });
    await expect(portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null })).rejects.toMatchObject({ code: "failed_precondition", message: "An FTL trip follows its consignment's stamps" });
    await expect(portalOrderService.stamp(eva, t.id, { kind: "UNLOADED", at: null })).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("FTL: Delivered before the pick-up is refused by the consignment's rules; a time in the future too", async () => {
    const { trip: t, c } = await ftl();
    await expect(portalOrderService.delivered(eva, t.id, c.id, { at: null, receiverName: "" })).rejects.toMatchObject({ code: "failed_precondition", message: "Stamp the pick-up first" });
    await portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null });
    await expect(portalOrderService.delivered(eva, t.id, c.id, { at: "2026-10-16T10:00:00Z", receiverName: "" })).rejects.toMatchObject({ code: "invalid_argument" });
    const order = await portalOrderService.delivered(eva, t.id, c.id, { at: null, receiverName: "Petr Brož" });
    expect(order.stops[1]!.deliveredAt).toBe("2026-10-15T10:00:00.000Z");
    expect(cOf(c.id)).toMatchObject({ deliveredBy: "Eva Malá (haulier), received by Petr Brož", status: "DELIVERED" });
    expect(outboxOf("delivered")).toEqual([expect.objectContaining({ actingUserId: SENDER, payload: { actualDeliveryDate: "2026-10-15" } })]);
    // The pick-up stop is no delivery stop.
    await expect(portalOrderService.delivered(eva, t.id, "00000000-0000-0000-0000-00000000ffff", { at: null, receiverName: "" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("pick-up run: Loaded picks up every consignment of the run; Departed, then Arrived", async () => {
    const a = await ltl();
    const b = await ltl();
    const { trip: t } = await run("PICKUP_RUN", [a, b]);
    await expect(portalOrderService.stamp(eva, t.id, { kind: "ARRIVED", at: null })).rejects.toMatchObject({ message: "Stamp the departure first" });
    const loaded = await portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null });
    expect(loaded.stamps.loaded).toBe("2026-10-15T10:00:00.000Z");
    expect([cOf(a.id).pickedUpBy, cOf(b.id).pickedUpBy]).toEqual(["Eva Malá (haulier)", "Eva Malá (haulier)"]);
    await portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null });
    const arrived = await portalOrderService.stamp(eva, t.id, { kind: "ARRIVED", at: null });
    expect(arrived.stamps).toMatchObject({ departed: "2026-10-15T10:00:00.000Z", arrived: "2026-10-15T10:00:00.000Z" });
    expect(tripOf(t.id)).toMatchObject({ departedBy: "Eva Malá (haulier)", arrivedBy: "Eva Malá (haulier)", status: "DONE" });
    expect(eventsOf("trip_stamp_set")[0]).toMatchObject({ byUserId: null, payload: expect.objectContaining({ facts: { source: "HAULIER" } }) });
    expect(await portalOrderService.list(eva, "open")).toHaveLength(0);
  });

  it("line haul: cannot depart before our warehouse's gate-in of its goods; Loaded is the warehouse's", async () => {
    const a = await ltl();
    const { trip: t } = await run("LINEHAUL", [a]);
    await expect(portalOrderService.stamp(eva, t.id, { kind: "LOADED", at: null })).rejects.toMatchObject({ message: "Loading at our warehouse is stamped by the warehouse" });
    await expect(portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining(`gate-in of ${a.ref}`) });
    gateIn(a.id);
    await portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null });
    await portalOrderService.stamp(eva, t.id, { kind: "ARRIVED", at: null });
    expect(store.ltlLegs.find((l) => l.tripId === t.id)!.status).toBe("DONE");
    // A line haul's drop at the depot is no delivery: no Delivered, no POD.
    await expect(portalOrderService.delivered(eva, t.id, a.id, { at: null, receiverName: "" })).rejects.toMatchObject({ code: "not_found" });
  });

  it("delivery run: cannot depart before the gate-in; per stop Delivered and POD; the last POD of the job sends it to Billing", async () => {
    const a = await ltl();
    const b = await ltl();
    const { trip: t } = await run("DELIVERY_RUN", [a, b]);
    await expect(portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null })).rejects.toMatchObject({ message: expect.stringContaining("gate-in") });
    await expect(portalOrderService.delivered(eva, t.id, a.id, { at: null, receiverName: "" })).rejects.toMatchObject({ message: expect.stringContaining("no gate-in") });
    gateIn(a.id);
    gateIn(b.id);
    await portalOrderService.respond(eva, t.id, { action: "CONFIRM", reason: "" });
    await portalOrderService.stamp(eva, t.id, { kind: "DEPARTED", at: null });
    const order = await portalOrderService.delivered(eva, t.id, a.id, { at: null, receiverName: "" });
    expect(order.stops[0]!.deliveredAt).toBe("2026-10-15T10:00:00.000Z");
    expect(order.needsAction).toBe("Upload POD for 1 stop");
    await portalOrderService.pod(eva, t.id, a.id, { fileName: "a.pdf", fileBase64: PDF, receiverName: "", deliveredAt: null });
    expect(cOf(a.id)).toMatchObject({ podSource: "HAULIER" });
    expect(outboxOf("billing")).toHaveLength(0);
    // The second stop: the POD stamps the delivery it proves, then POD received.
    const done = await portalOrderService.pod(eva, t.id, b.id, { fileName: "b.jpg", fileBase64: PDF, receiverName: "Jana", deliveredAt: null });
    expect(cOf(b.id)).toMatchObject({ deliveredBy: "Eva Malá (haulier), received by Jana", podReceivedBy: "Eva Malá (haulier), received by Jana" });
    expect(done.stops.every((s) => s.podUploaded)).toBe(true);
    expect([cOf(a.id).status, cOf(b.id).status]).toEqual(["READY_TO_BILL", "READY_TO_BILL"]);
    expect(outboxOf("billing")).toEqual([expect.objectContaining({ shipmentId: SHIPMENT, actingUserId: SENDER })]);
  });

  it("partner delivery: Delivered and the POD per stop (acting as the portal user's creator); no Loaded / Departed, no transport order", async () => {
    const { c, leg } = await partner({ shipmentId: SHIPMENT2 });
    await expect(portalOrderService.stamp(eva, leg.id, { kind: "LOADED", at: null })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(portalOrderService.transportOrder(eva, leg.id)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(portalOrderService.pod(eva, leg.id, c.id, { fileName: "pod.pdf", fileBase64: PDF, receiverName: "", deliveredAt: null })).rejects.toMatchObject({ message: expect.stringContaining("no gate-in") });
    expect(store.documents).toHaveLength(0);
    gateIn(c.id);
    const order = await portalOrderService.pod(eva, leg.id, c.id, { fileName: "pod.pdf", fileBase64: PDF, receiverName: "", deliveredAt: "2026-10-15T09:00:00Z" });
    expect(order).toMatchObject({ status: "DONE", stops: [expect.objectContaining({ deliveredAt: "2026-10-15T09:00:00.000Z", podUploaded: true })] });
    expect(store.ltlLegs.find((l) => l.id === leg.id)!.status).toBe("DONE");
    expect(store.documents[0]).toMatchObject({ kind: "POD", source: "HAULIER", uploadedByUserId: null, uploadedBy: "Eva Malá (haulier)" });
    expect(outboxOf("billing")).toEqual([expect.objectContaining({ shipmentId: SHIPMENT2, actingUserId: USER })]);
  });

  it("FTL POD: a photo or PDF only; stamps the pick-up and delivery it proves, POD received, and Billing", async () => {
    const { trip: t, c } = await ftl();
    await expect(portalOrderService.pod(eva, t.id, c.id, { fileName: "x.html", fileBase64: HTML, receiverName: "", deliveredAt: null })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(store.documents).toHaveLength(0);
    await portalOrderService.pod(eva, t.id, c.id, { fileName: "pod.pdf", fileBase64: PDF, receiverName: "", deliveredAt: null });
    expect(cOf(c.id)).toMatchObject({ pickedUpBy: "Eva Malá (haulier)", deliveredBy: "Eva Malá (haulier)", podSource: "HAULIER", status: "READY_TO_BILL" });
    expect(outboxOf("billing")).toEqual([expect.objectContaining({ actingUserId: SENDER })]);
  });
});

describe("the transport order PDF", () => {
  it("is regenerated without a PIN - it says the dispatcher gives it - and the download is logged", async () => {
    const { trip: t } = await ftl();
    const file = await portalOrderService.transportOrder(eva, t.id);
    expect(file).toMatchObject({ fileName: `${t.ref}.pdf`, contentType: "application/pdf" });
    const doc = vi.mocked(buildTransportOrderPdf).mock.calls[0]![0];
    expect(doc).toMatchObject({ pickupPin: null, pinAsGiven: true, podLink: null, language: "both" });
    expect(doc.terms.join(" ")).not.toContain("PIN");
    expect(eventsOf("transport_order_printed")[0]).toMatchObject({ byUserId: null, byName: "Eva Malá (haulier)", payload: expect.objectContaining({ facts: expect.objectContaining({ pinPrinted: false, via: "PORTAL" }) }) });
    expect(tripOf(t.id).pinPrinted).toBe(true);
    // The internal calls go as the portal user's creator with the least role.
    expect(customers.customerGet).toHaveBeenCalledWith({ id: HAULIER }, { authData: { userID: USER, companyID: COMPANY, role: "user" } });
  });

  it("an LTL run's order too", async () => {
    const { trip: t } = await run("DELIVERY_RUN", [await ltl()]);
    await portalOrderService.transportOrder(eva, t.id);
    expect(vi.mocked(buildLtlTransportOrderPdf).mock.calls[0]![0]).toMatchObject({ pickupPin: null, pinAsGiven: true });
  });

  it("the PIN-less PDF really builds", async () => {
    const { buildTransportOrderPdf: real } = await vi.importActual<typeof import("../lib/transportOrderPdf")>("../lib/transportOrderPdf");
    const { trip: t } = await ftl();
    await portalOrderService.transportOrder(eva, t.id);
    const doc = vi.mocked(buildTransportOrderPdf).mock.calls[0]![0];
    const bytes = await real(doc);
    expect(Buffer.from(bytes.slice(0, 4)).toString()).toBe("%PDF");
  });
});

/** A pick-up stop named `name` (for a second consignment of a run). */
function cOfStop(name: string): TruckingConsignmentRecord["pickup"] {
  return { ...stop({ name }), postcode: "11000", id: "s3", kind: "PICKUP", actualArrival: null, actualDeparture: null };
}
