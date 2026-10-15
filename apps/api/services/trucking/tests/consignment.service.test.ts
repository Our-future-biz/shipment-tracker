import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The consignment service runs for real against in-memory repositories (truckingFakes) and
// stand-ins for the rate engine, the settings and the other services.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn() },
  shipments: { _internalShipmentBasics: vi.fn(), _internalShipmentCreateRoad: vi.fn() },
  quotes: { salesQuoteGet: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
}));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../repositories/consignment.repository", async (orig) => ({
  ...(await orig<object>()),
  consignmentRepository: (await import("./truckingFakes")).consignmentRepository,
}));
vi.mock("../repositories/trip.repository", async () => ({ tripRepository: (await import("./truckingFakes")).tripRepository }));
vi.mock("../repositories/truckingDocument.repository", async () => ({ truckingDocumentRepository: (await import("./truckingFakes")).truckingDocumentRepository }));
vi.mock("../repositories/truckingOutbox.repository", async () => ({ truckingOutboxRepository: (await import("./truckingFakes")).truckingOutboxRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers, quotes, shipments } from "~encore/clients";
import { consignmentService, type ConsignmentCreateInput } from "../services/consignment.service";
import { eurRate, rateService } from "../services/rate.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import type { PricedSide, RateLevelResult, RateResponse } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import { COMPANY, CUSTOMER, HAULIER, SHIPMENT, eventsOf, load, manager, outboxOf, resetStore, stop, store, tripRepository, user, TX } from "./truckingFakes";

const side = (total: number, over: Partial<PricedSide> = {}): PricedSide => ({
  tariffId: "t-sell",
  tariffName: "Standard FTL",
  tariffVersionId: "v-sell",
  versionNo: 3,
  ownerCustomerId: null,
  ownerName: null,
  currency: "CZK",
  zoneCode: "Z1",
  zoneLabel: "Zone 1",
  bandLabel: "Trip",
  chargeable: { basis: "KG", quantity: 5000, explanation: "5 000 kg (actual weight)" },
  lines: [
    { code: "FREIGHT", label: "Freight", qty: 1, unit: "trip", unitPrice: total - 500, amount: total - 500 },
    { code: "FUEL", label: "Fuel surcharge", qty: 1, unit: "", unitPrice: 500, amount: 500 },
  ],
  total,
  totalCzk: total,
  fx: null,
  preferred: false,
  ...over,
});

const rated = (sell: number, buy: number[]): RateResponse => ({
  request: {} as RateResponse["request"],
  ratedAt: "2026-10-15T10:00:00.000Z",
  results: [
    {
      serviceLevel: "D1",
      label: "+1 day",
      promisedDate: "2026-10-19",
      promisedTime: null,
      promiseNote: "",
      sell: side(sell),
      buy: buy.map((b, i) => side(b, { tariffId: `t-buy-${i}`, ownerCustomerId: HAULIER, ownerName: "Bravo Trans" })),
      excluded: [],
      internal: null,
      marginCzk: null,
      marginPercent: null,
      belowFloor: false,
    } as RateLevelResult,
  ],
});

const input = (over: Partial<ConsignmentCreateInput> = {}): ConsignmentCreateInput => ({
  shipmentId: SHIPMENT,
  customerId: CUSTOMER,
  quoteNumber: null,
  serviceLevel: "D1",
  pickupDate: "2026-10-16",
  pickupTime: null,
  pickup: stop(),
  delivery: stop({ name: "Beta a.s.", postcode: "602 00", city: "Brno" }),
  load: load(),
  price: { source: "TARIFF" },
  ...over,
});

/** A consignment straight in the store: booked, or on a trip with the transport order sent. */
async function seed(over: Partial<TruckingConsignmentRecord> = {}, opts: { trip?: boolean; sent?: boolean } = {}) {
  const trip = opts.trip
    ? await tripRepository.insert(TX, {
        companyId: COMPANY,
        ref: "LCZ2026000001",
        haulierCustomerId: HAULIER,
        haulierName: "Bravo Trans",
        plannedPickupDate: "2026-10-16",
        status: opts.sent ? "ORDERED" : "DRAFT",
        orderSentAt: opts.sent ? new Date("2026-10-15T08:00:00Z") : null,
        orderSentByUserId: "00000000-0000-0000-0000-000000000003",
        orderSentByRole: "user",
        buyCzk: 9000,
      })
    : null;
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `TCZ2026${String(store.consignments.length + 1).padStart(6, "0")}`,
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    serviceLevel: "D1",
    status: trip ? (opts.sent ? "ORDERED" : "PLANNED") : "BOOKED",
    pickupDate: "2026-10-16",
    pickup: { ...stop(), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    sellCzk: 12000,
    estBuyCzk: 9000,
    tripId: trip?.id ?? null,
    ...over,
  });
  store.written = [];
  return { c, trip };
}

const row = (id: string) => store.consignments.find((c) => c.id === id)!;

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alfa s.r.o." } } as never);
  vi.mocked(shipments._internalShipmentBasics).mockResolvedValue({ shipments: [{ id: SHIPMENT, jobNumber: "CZ00000042", customerId: CUSTOMER }] } as never);
  vi.mocked(shipments._internalShipmentCreateRoad).mockResolvedValue({ shipmentId: SHIPMENT, jobNumber: "CZ00000099" });
  vi.mocked(rateService.rate).mockResolvedValue(rated(12000, [9000, 9500]));
  vi.mocked(eurRate).mockResolvedValue({ rate: 25, date: "2026-10-15" });
});

afterEach(() => vi.useRealTimers());

describe("create and price sources", () => {
  it("prices from the tariff: TCZ ref, snapshot, margin estimate, event and the sell lines owed to Costs", async () => {
    const d = await consignmentService.create(user, input());
    expect(d.ref).toBe("TCZ2026000001");
    expect(d.status).toBe("BOOKED");
    expect(d.jobNumber).toBe("CZ00000042");
    expect(d.sell).toMatchObject({ source: "TARIFF", tariffVersionId: "v-sell", versionNo: 3, total: 12000, serviceLevel: "D1" });
    expect(d).toMatchObject({ sellCzk: 12000, buyCzk: 9000, marginCzk: 3000, belowFloor: false, promisedDate: "2026-10-19", chargeableKg: 5000 });
    expect(d.pickup.postcode).toBe("11000");
    expect(eventsOf("consignment_created")).toHaveLength(1);
    const [costs] = outboxOf("costs");
    expect(costs).toMatchObject({ shipmentId: SHIPMENT, actingUserId: user.userID, actingRole: "user" });
    const payload = costs!.payload as { sourceRef: string; selling: { description: string; amount: number }[]; buying: unknown[] };
    expect(payload.sourceRef).toBe(`trucking:consignment:${d.id}`);
    expect(payload.buying).toEqual([]);
    expect(payload.selling.map((l) => l.description)).toEqual(["TCZ2026000001 · Freight", "TCZ2026000001 · Fuel surcharge"]);
    expect(rateService.rate).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ scope: "FTL", fromPostcode: "11000", toPostcode: "60200", serviceLevels: ["D1"], includeBuy: true }));
  });

  it("creates a Road / Domestic job when the order has none", async () => {
    const d = await consignmentService.create(user, input({ shipmentId: null }));
    expect(d.jobNumber).toBe("CZ00000099");
    expect(shipments._internalShipmentCreateRoad).toHaveBeenCalledWith(
      expect.objectContaining({ customerId: CUSTOMER, pickupPostcode: "11000", deliveryPostcode: "60200", pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19" }),
    );
  });

  it("refuses a job of another customer", async () => {
    vi.mocked(shipments._internalShipmentBasics).mockResolvedValue({ shipments: [{ id: SHIPMENT, jobNumber: "CZ1", customerId: HAULIER }] } as never);
    await expect(consignmentService.create(user, input())).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("refuses a tariff price the engine cannot give, with its reason", async () => {
    const r = rated(1, []);
    r.results[0]!.sell = { reason: "No zone for postcode 790 01" };
    vi.mocked(rateService.rate).mockResolvedValue(r);
    await expect(consignmentService.create(user, input())).rejects.toMatchObject({ code: "failed_precondition", message: "No zone for postcode 790 01" });
  });

  it("marks a price below the floor (saved, not refused)", async () => {
    vi.mocked(rateService.rate).mockResolvedValue(rated(10000, [9900]));
    const d = await consignmentService.create(user, input());
    expect(d).toMatchObject({ belowFloor: true, marginApproved: false });
    expect(d.needsAttention).toContain("Margin below the floor: needs a manager's approval");
  });

  const quote = (over: Record<string, unknown> = {}) => ({
    quote: {
      quoteNumber: "QCZ20261010001",
      customerId: CUSTOMER,
      status: "quoted",
      effectiveStatus: "quoted",
      data: {
        roadPricing: {
          ratedAt: "2026-10-10T09:00:00.000Z",
          serviceLevel: "D2",
          sell: { tariffId: "t1", tariffName: "Alfa FTL", tariffVersionId: "v1", versionNo: 2, currency: "CZK", total: 15000, totalCzk: 15000 },
          buy: { haulierCustomerId: HAULIER, haulierName: "Bravo", tariffVersionId: "vb", versionNo: 1, currency: "CZK", total: 11000, totalCzk: 11000, preferred: true },
        },
        sellingLines: [
          { chargeCode: "road_freight", description: "Freight", qty: 1, unit: "trip", unitPrice: 15000, amount: 15000, tariffRef: "trucking:v1:D2" },
          { chargeCode: "customs", description: "Customs", amount: 900 },
        ],
      },
      ...over,
    },
  });

  it("takes the price of a road quote: its trucking lines, its buy estimate", async () => {
    vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote() as never);
    const d = await consignmentService.create(user, input({ quoteNumber: "QCZ20261010001", serviceLevel: null, price: { source: "QUOTE" } }));
    expect(d.sell).toMatchObject({ source: "QUOTE", total: 15000, tariffVersionId: "v1", serviceLevel: "D2" });
    expect(d.sell!.lines).toEqual([{ code: "road_freight", label: "Freight", qty: 1, unit: "trip", unitPrice: 15000, amount: 15000 }]);
    expect(d).toMatchObject({ serviceLevel: "D2", buyCzk: 11000, marginCzk: 4000 });
    expect(rateService.rate).not.toHaveBeenCalled();
  });

  it("refuses a quote of another customer, a lost one and one not priced from the tariffs", async () => {
    const asQuote = { quoteNumber: "QCZ20261010001", serviceLevel: null, price: { source: "QUOTE" as const } };
    vi.mocked(quotes.salesQuoteGet).mockResolvedValueOnce(quote({ customerId: HAULIER }) as never);
    await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ message: "Quote QCZ20261010001 is for another customer" });
    vi.mocked(quotes.salesQuoteGet).mockResolvedValueOnce(quote({ status: "lost", effectiveStatus: "lost" }) as never);
    await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ message: "Quote QCZ20261010001 is lost" });
    vi.mocked(quotes.salesQuoteGet).mockResolvedValueOnce(quote({ data: {} }) as never);
    await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("takes an agreed price in EUR at the ČNB rate, with the reason", async () => {
    const d = await consignmentService.create(user, input({ price: { source: "MANUAL", total: 400, currency: "EUR", reason: "Agreed by phone" } }));
    expect(d.sell).toMatchObject({ source: "MANUAL", currency: "EUR", total: 400, totalCzk: 10000, overrideReason: "Agreed by phone" });
    expect(d.buyCzk).toBe(9000);
    await expect(consignmentService.create(user, input({ price: { source: "MANUAL", total: 400, currency: "EUR", reason: "" } }))).rejects.toMatchObject({
      code: "invalid_argument",
    });
  });
});

describe("stamps", () => {
  it("keeps the order: no pick-up before the transport order is sent", async () => {
    const { c } = await seed({}, { trip: true, sent: false });
    await expect(consignmentService.stamp(user, c.id, "pickedUp", null)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(consignmentService.stamp(user, c.id, "delivered", null)).rejects.toMatchObject({ message: "Stamp the pick-up first" });
  });

  it("stamps the pick-up once: status, trip in transit, event; a second stamp is 409 Already stamped", async () => {
    const { c, trip } = await seed({}, { trip: true, sent: true });
    const d = await consignmentService.stamp(user, c.id, "pickedUp", null);
    expect(d.status).toBe("PICKED_UP");
    expect(d.stamps.pickedUp).toEqual({ at: "2026-10-15T10:00:00.000Z", by: "Jana Nováková" });
    expect(store.trips.find((t) => t.id === trip!.id)!.status).toBe("IN_TRANSIT");
    expect(eventsOf("stamp_set")).toHaveLength(1);
    await expect(consignmentService.stamp(user, c.id, "pickedUp", null)).rejects.toMatchObject({ code: "already_exists", message: "Already stamped" });
  });

  it("answers Already stamped when another stamp won the race (the guarded update touched no row)", async () => {
    const { c } = await seed({}, { trip: true, sent: true });
    const stale = structuredClone(row(c.id));
    row(c.id).pickedUpAt = new Date("2026-10-15T09:00:00Z");
    vi.mocked(consignmentRepository.find).mockResolvedValueOnce(stale);
    await expect(consignmentService.stamp(user, c.id, "pickedUp", null)).rejects.toMatchObject({ code: "already_exists", message: "Already stamped" });
  });

  it("allows a past time within 7 days, not a future one, and not a delivery before the pick-up", async () => {
    const { c } = await seed({}, { trip: true, sent: true });
    await expect(consignmentService.stamp(user, c.id, "pickedUp", "2026-10-01T10:00:00Z")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(consignmentService.stamp(user, c.id, "pickedUp", "2026-10-15T12:00:00Z")).rejects.toMatchObject({ code: "invalid_argument" });
    await consignmentService.stamp(user, c.id, "pickedUp", "2026-10-15T08:00:00Z");
    await expect(consignmentService.stamp(user, c.id, "delivered", "2026-10-15T07:00:00Z")).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("owes the job its actual delivery date when delivered", async () => {
    const { c } = await seed({ pickedUpAt: new Date("2026-10-15T06:00:00Z"), status: "PICKED_UP" }, { trip: true, sent: true });
    const d = await consignmentService.stamp(user, c.id, "delivered", null);
    expect(d.status).toBe("DELIVERED");
    expect(outboxOf("delivered")).toEqual([expect.objectContaining({ consignmentId: c.id, shipmentId: SHIPMENT, payload: { actualDeliveryDate: "2026-10-15" } })]);
  });

  const delivered = { pickedUpAt: new Date("2026-10-14T06:00:00Z"), deliveredAt: new Date("2026-10-14T14:00:00Z"), status: "DELIVERED" as const };

  it("POD received needs a POD document - or a manager", async () => {
    const { c } = await seed(delivered, { trip: true, sent: true });
    await expect(consignmentService.stamp(user, c.id, "podReceived", null)).rejects.toMatchObject({ code: "failed_precondition" });
    const d = await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(d.stamps.podReceived).not.toBeNull();
  });

  it("Billing: the last POD of the job makes every consignment ready to bill and owes the Billing step once", async () => {
    const a = await seed(delivered, { trip: true, sent: true });
    const b = await seed(delivered);
    await seed({ cancelledAt: new Date(), status: "CANCELLED" });
    store.documents.push({ consignmentId: a.c.id, kind: "POD" } as never, { consignmentId: b.c.id, kind: "POD" } as never);

    const first = await consignmentService.stamp(user, a.c.id, "podReceived", null);
    expect(first.status).toBe("POD_RECEIVED");
    expect(outboxOf("billing")).toHaveLength(0);

    const second = await consignmentService.stamp(user, b.c.id, "podReceived", null);
    expect(second.status).toBe("READY_TO_BILL");
    expect(row(a.c.id).status).toBe("READY_TO_BILL");
    expect(outboxOf("billing")).toEqual([expect.objectContaining({ shipmentId: SHIPMENT, payload: {} })]);
    expect(eventsOf("ready_to_bill")).toHaveLength(2);
  });

  it("voids a stamp (manager), last one first; a voided POD takes the job's others back to POD received", async () => {
    const a = await seed({ ...delivered, podReceivedAt: new Date("2026-10-14T15:00:00Z"), readyToBillAt: new Date(), status: "READY_TO_BILL" });
    const b = await seed({ ...delivered, podReceivedAt: new Date("2026-10-14T15:00:00Z"), readyToBillAt: new Date(), status: "READY_TO_BILL" });
    await expect(consignmentService.voidStamp(user, a.c.id, "podReceived", "Wrong file")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(consignmentService.voidStamp(manager, a.c.id, "delivered", "Wrong day")).rejects.toMatchObject({ message: "Void the later stamp first" });
    const d = await consignmentService.voidStamp(manager, a.c.id, "podReceived", "Wrong file");
    expect(d.status).toBe("DELIVERED");
    expect(d.stamps.podReceived).toBeNull();
    expect(row(b.c.id)).toMatchObject({ status: "POD_RECEIVED", readyToBillAt: null });
    expect(eventsOf("stamp_voided")).toHaveLength(2);
  });
});

describe("cancel and margin approval", () => {
  it("is a manager's, with a reason, and refused after the pick-up", async () => {
    const { c } = await seed({}, { trip: true, sent: true });
    await expect(consignmentService.cancel(user, c.id, "Customer called")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(consignmentService.cancel(manager, c.id, "")).rejects.toMatchObject({ code: "invalid_argument" });
    const picked = await seed({ pickedUpAt: new Date(), status: "PICKED_UP" });
    await expect(consignmentService.cancel(manager, picked.c.id, "Customer called")).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("cancels the trip too, revokes the link and removes both sides' Trucking cost lines", async () => {
    const { c, trip } = await seed({}, { trip: true, sent: true });
    store.links.push({ tripId: trip!.id, revokedAt: null } as never);
    const d = await consignmentService.cancel(manager, c.id, "Customer called");
    expect(d.status).toBe("CANCELLED");
    expect(store.trips[0]!.status).toBe("CANCELLED");
    expect(store.links[0]!.revokedAt).not.toBeNull();
    expect(outboxOf("costs").map((r) => r.payload)).toEqual([
      { sourceRef: `trucking:consignment:${c.id}`, buying: [], selling: [] },
      { sourceRef: `trucking:trip:${trip!.id}`, buying: [], selling: [] },
    ]);
  });

  it("cancelling the job's last consignment without POD makes the others ready to bill", async () => {
    const done = await seed({ pickedUpAt: new Date("2026-10-14T06:00:00Z"), deliveredAt: new Date("2026-10-14T09:00:00Z"), podReceivedAt: new Date("2026-10-14T10:00:00Z"), status: "POD_RECEIVED" });
    const open = await seed();
    await consignmentService.cancel(manager, open.c.id, "Not needed");
    expect(row(done.c.id).status).toBe("READY_TO_BILL");
    expect(outboxOf("billing")).toHaveLength(1);
  });

  it("approves a margin below the floor once (manager); then the gate is open", async () => {
    const { c } = await seed({ sellCzk: 10000, estBuyCzk: 9900 });
    await expect(consignmentService.approveMargin(user, c.id, "Strategic customer")).rejects.toMatchObject({ code: "permission_denied" });
    const d = await consignmentService.approveMargin(manager, c.id, "Strategic customer");
    expect(d).toMatchObject({ belowFloor: true, marginApproved: true, marginApproval: { byName: "Jana Nováková", reason: "Strategic customer", marginCzk: 100 } });
    await expect(consignmentService.approveMargin(manager, c.id, "Again")).rejects.toMatchObject({ message: "This margin is already approved" });
    const fine = await seed({ sellCzk: 12000, estBuyCzk: 9000 });
    await expect(consignmentService.approveMargin(manager, fine.c.id, "No need")).rejects.toMatchObject({ message: "The margin is not below the floor" });
  });
});

describe("update", () => {
  const fields = (over: Record<string, unknown> = {}) => ({ ...input(), price: { source: "TARIFF" as const }, version: 1, reprice: false, ...over });

  it("refuses a stale version", async () => {
    const { c } = await seed();
    await expect(consignmentService.update(user, c.id, fields({ version: 7 }))).rejects.toMatchObject({ code: "aborted" });
  });

  it("after the pick-up only notes and references may change", async () => {
    const { c } = await seed({ pickedUpAt: new Date(), status: "PICKED_UP" });
    const same = { delivery: stop({ city: "Brno", postcode: "602 00" }) };
    await expect(consignmentService.update(user, c.id, fields({ ...same, load: load({ weightKg: 6000 }) }))).rejects.toMatchObject({ code: "failed_precondition" });
    const d = await consignmentService.update(user, c.id, fields({ delivery: stop({ city: "Brno", postcode: "602 00", notes: "Gate 4", reference: "PO-9" }) }));
    expect(d.delivery).toMatchObject({ notes: "Gate 4", reference: "PO-9", id: "s2" });
  });

  it("never reprices silently; reprice prices again and owes the new sell lines", async () => {
    const { c } = await seed({ sell: { source: "TARIFF", total: 12000, totalCzk: 12000, currency: "CZK", lines: [] } as never });
    vi.mocked(rateService.rate).mockResolvedValue(rated(13000, [9000]));
    await consignmentService.update(user, c.id, fields({ delivery: stop({ name: "Beta a.s.", city: "Brno", postcode: "602 00", notes: "x" }) }));
    expect(row(c.id).sellCzk).toBe(12000);
    expect(outboxOf("costs")).toHaveLength(0);
    await consignmentService.update(user, c.id, fields({ version: 2, reprice: true }));
    expect(row(c.id).sellCzk).toBe(13000);
    expect(outboxOf("costs")).toHaveLength(1);
  });
});

describe("the job was deleted in Shipments", () => {
  it("cancels the open consignments, keeps the picked-up ones with an event, cancels what is still owed", async () => {
    const open = await seed({}, { trip: true, sent: true });
    const picked = await seed({ pickedUpAt: new Date(), status: "PICKED_UP" });
    store.outbox.push({ shipmentId: SHIPMENT, kind: "planned", status: "pending" });
    await consignmentService.retireShipment(SHIPMENT, COMPANY);
    expect(row(open.c.id).status).toBe("CANCELLED");
    expect(row(picked.c.id).status).toBe("PICKED_UP");
    expect(eventsOf("shipment_deleted")).toEqual([expect.objectContaining({ consignmentId: picked.c.id })]);
    expect(store.outbox.every((r) => r.status === "cancelled")).toBe(true);
    // Idempotent: a second delivery of the message changes nothing more.
    await consignmentService.retireShipment(SHIPMENT, COMPANY);
    expect(eventsOf("consignment_cancelled")).toHaveLength(1);
  });
});

describe("list", () => {
  it("counts and filters the worklist views", async () => {
    await seed({ pickupDate: "2026-10-15" });
    await seed({ status: "DELIVERED", pickedUpAt: new Date(), deliveredAt: new Date("2026-10-15T08:00:00Z") });
    await seed({ status: "READY_TO_BILL" });
    const all = await consignmentService.list(user, {});
    expect(all.counts).toMatchObject({ pickupToday: 1, podMissing: 1, readyToBill: 1, openFtlWithoutHaulier: 1, attention: 1 });
    expect((await consignmentService.list(user, { view: "pickupToday" })).consignments).toHaveLength(1);
    expect((await consignmentService.list(user, { search: "brno" })).consignments).toHaveLength(3);
    expect((await consignmentService.list(user, { search: "nothing" })).consignments).toHaveLength(0);
  });
});
