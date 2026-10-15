import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The LTL flow (consignments with legs, planning board, runs and line hauls, partner deliveries,
// the warehouse's gate, transport order, manifest and labels) runs for real against the
// in-memory repositories (truckingFakes); the rate engine, the hauliers, the settings and the
// PDF builders are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(), customerSiteList: vi.fn(), contactList: vi.fn(async () => ({ data: [] })), _internalHaulierList: vi.fn() },
  invoicing: { invoiceProfileGet: vi.fn(async () => ({ profile: null })) },
  sales: { prefGet: vi.fn(async () => ({ value: null })) },
  shipments: { _internalShipmentBasics: vi.fn(), _internalShipmentCreateRoad: vi.fn() },
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
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn(async () => []) } }));
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: { list: vi.fn(async () => []), bindingOn: vi.fn(async () => []) } }));
vi.mock("../services/haulier.service", async (orig) => ({ ...(await orig<object>()), haulierService: { get: vi.fn() } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: { get: vi.fn(), vehicleCodes: vi.fn(async () => ["van", "solo_72", "tautliner_136"]) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../../../lib/email", () => ({ sendMail: vi.fn(async () => ({ sent: false, error: "E-mail sending is disabled", providerId: "" })) }));
vi.mock("../lib/ltlTransportOrderPdf", () => ({ buildLtlTransportOrderPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../lib/manifestPdf", () => ({ buildManifestPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../lib/labelsPdf", () => ({ buildLabelsPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));

import { customers, holidays, shipments } from "~encore/clients";
import { ltlService } from "../services/ltl.service";
import { ltlDocumentService } from "../services/ltlDocument.service";
import { consignmentService, newLegs } from "../services/consignment.service";
import { tripService } from "../services/trip.service";
import { transportOrderService } from "../services/transportOrder.service";
import { haulierService } from "../services/haulier.service";
import { rateService } from "../services/rate.service";
import { settingsService } from "../services/settings.service";
import { haulierRepository } from "../repositories/haulier.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import { legRepository } from "../repositories/leg.repository";
import { buildLtlTransportOrderPdf } from "../lib/ltlTransportOrderPdf";
import { buildManifestPdf } from "../lib/manifestPdf";
import { buildLabelsPdf } from "../lib/labelsPdf";
import type { HaulierDetail, HubAddress, LastMile, LoadInput, PricedSide, RateRequest, RateResponse, TruckingSettings } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord, TruckingLegRecord } from "../schemas/truckingConsignment.schema";
import type { GateStampedEvent } from "../lib/warehouseLink";
import { COMPANY, CUSTOMER, HAULIER, HAULIER2, SHIPMENT, TX, eventsOf, load, manager, outboxOf, resetStore, settings, stop, store, user } from "./truckingFakes";

const SHIPMENT2 = "00000000-0000-0000-0000-0000000000d2";
const DEPOT = "00000000-0000-0000-0000-0000000000e1";
const HUB: HubAddress = { name: "Sklad Brandýs", street: "Skladová 1", postcode: "25001", city: "Brandýs nad Labem", country: "CZ" };

const withHub = (hub: HubAddress = HUB): TruckingSettings => ({ ...settings(), hub });

const haulier = (id: string, name: string, over: Partial<HaulierDetail> = {}): HaulierDetail =>
  ({ customerId: id, companyName: name, ico: "1", dic: "CZ1", city: "Brno", profile: { adrCapable: false, paymentDays: 30 }, status: "ok", issues: [], ...over }) as HaulierDetail;

const side = (owner: string, total: number, basis: "TRIP" | "KG" = "KG"): PricedSide => ({
  tariffId: `t-${owner}`,
  tariffName: `Tariff ${owner.slice(-2)}`,
  tariffVersionId: `v-${owner}`,
  versionNo: 1,
  ownerCustomerId: owner,
  ownerName: owner === HAULIER ? "Bravo" : "Gama",
  currency: "CZK",
  zoneCode: "Z1",
  zoneLabel: "Zone 1",
  bandLabel: "b",
  chargeable: { basis, quantity: 1, explanation: "" },
  lines: [{ code: "FREIGHT", label: "Freight", qty: 1, unit: "x", unitPrice: total, amount: total }],
  total,
  totalCzk: total,
  fx: null,
  preferred: false,
});

/** The rate engine: sell 2000; each haulier's buy is 1 CZK per kg rated (Bravo) / 2 CZK (Gama); TRIP basis for LINEHAUL. */
const rate = async (_companyId: string, r: RateRequest): Promise<RateResponse> =>
  ({
    request: r,
    ratedAt: "2026-10-15T10:00:00.000Z",
    results: [
      {
        serviceLevel: "D1",
        label: "+1 day",
        promisedDate: "2026-10-16",
        promisedTime: null,
        promiseNote: "",
        sell: { ...side(CUSTOMER, 2000), chargeable: { basis: "KG", quantity: 500, explanation: "" } },
        buy:
          r.scope === "LINEHAUL"
            ? [side(HAULIER, 7000, "TRIP")]
            : [side(HAULIER, r.weightKg), side(HAULIER2, r.weightKg * 2)],
        excluded: [],
        internal: null,
        marginCzk: null,
        marginPercent: null,
        belowFloor: false,
      },
    ],
  }) as unknown as RateResponse;

let refNo = 0;
/** An LTL consignment with its legs (as a create writes them). */
async function ltl(over: Partial<TruckingConsignmentRecord> & { shipment?: string; weightKg?: number; lastMileOf?: LastMile; loadOver?: Partial<LoadInput> } = {}) {
  refNo += 1;
  const { shipment, weightKg, lastMileOf, loadOver, ...rest } = over;
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `TCZ2026${String(refNo).padStart(6, "0")}`,
    shipmentId: shipment ?? SHIPMENT,
    jobNumber: shipment === SHIPMENT2 ? "CZ00000043" : "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    scope: "LTL",
    lastMile: lastMileOf ?? "OWN_RUN",
    serviceLevel: "D1",
    status: "BOOKED",
    pickupDate: "2026-10-15",
    pickup: { ...stop({ name: "Alfa" }), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ name: "Beta", city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load({ pieces: 2, palletPlaces: 2, ldm: 0.8, weightKg: weightKg ?? 500, cbm: 2, ...loadOver }),
    chargeableKg: weightKg ?? 500,
    sellCzk: 2000,
    estBuyCzk: 600,
    promisedDate: "2026-10-16",
    ...rest,
  });
  await legRepository.insertMany(
    TX as never,
    newLegs(COMPANY, c, { selfDelivered: c.selfDelivered, lastMile: c.lastMile ?? "OWN_RUN", partnerHaulierCustomerId: c.partnerHaulierCustomerId }, HUB),
  );
  return c;
}

const legOf = (consignmentId: string, kind: string) => store.ltlLegs.find((l) => l.consignmentId === consignmentId && l.kind === kind && !l.deletedAt)!;
const cOf = (id: string) => store.consignments.find((c) => c.id === id)!;
const manual = (total: number) => ({ source: "MANUAL" as const, total, currency: "CZK" as const, reason: "spot deal" });

async function pickupRun(legs: TruckingLegRecord[], price: Parameters<typeof ltlService.createTrip>[1]["price"] = manual(3000)) {
  return ltlService.createTrip(user, { kind: "PICKUP_RUN", date: "2026-10-15", haulierCustomerId: HAULIER, vehicleTypeCode: "van", legIds: legs.map((l) => l.id), price });
}

const costRows = () => outboxOf("costs").map((r) => r.payload as { sourceRef: string; buying: { description: string; amount: number }[] });
const lastCostsOf = (sourceRef: string) => costRows().filter((p) => p.sourceRef === sourceRef).at(-1);

beforeEach(() => {
  resetStore();
  refNo = 0;
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T08:00:00Z"));
  vi.mocked(settingsService.get).mockResolvedValue(withHub());
  vi.mocked(rateService.rate).mockImplementation(rate);
  vi.mocked(haulierService.get).mockImplementation(async (_c, id) => (id === HAULIER ? haulier(HAULIER, "Bravo") : haulier(HAULIER2, "Gama")));
  vi.mocked(haulierRepository.findMany).mockResolvedValue([]);
  vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alfa s.r.o.", registeredAddress: "", country: "CZ" } } as never);
  vi.mocked(shipments._internalShipmentBasics).mockResolvedValue({ shipments: [{ id: SHIPMENT, jobNumber: "CZ00000042", customerId: CUSTOMER }] } as never);
});

afterEach(() => vi.useRealTimers());

describe("LTL consignment and its legs", () => {
  it("is priced from the customer's LTL sell list and gets a pick-up and a delivery leg via our warehouse", async () => {
    const c = await consignmentService.create(user, {
      shipmentId: SHIPMENT,
      customerId: CUSTOMER,
      quoteNumber: null,
      serviceLevel: "D1",
      pickupDate: "2026-10-15",
      pickupTime: null,
      pickup: stop({ name: "Alfa" }),
      delivery: stop({ name: "Beta", postcode: "602 00", city: "Brno" }),
      load: load({ weightKg: 500 }),
      price: { source: "TARIFF" },
      scope: "LTL",
      lastMile: "PARTNER",
      partnerHaulierCustomerId: HAULIER2,
    });
    expect(vi.mocked(rateService.rate).mock.calls[0]![1].scope).toBe("LTL");
    expect(c).toMatchObject({ scope: "LTL", lastMile: "PARTNER", partnerHaulierCustomerId: HAULIER2, status: "BOOKED", promisedFinal: false, gateInAt: null });
    expect(c.legs.map((l) => [l.kind, l.seq, l.status, l.fromText, l.toText, l.haulierCustomerId])).toEqual([
      ["PICKUP", 1, "OPEN", "Alfa, 110 00 Praha", "Sklad Brandýs, 250 01 Brandýs nad Labem", null],
      ["DELIVERY", 3, "OPEN", "Sklad Brandýs, 250 01 Brandýs nad Labem", "Beta, 602 00 Brno", HAULIER2],
    ]);
  });

  it("brought by the customer: only the delivery leg; FTL ↔ LTL cannot change later", async () => {
    const c = await consignmentService.create(user, {
      shipmentId: SHIPMENT,
      customerId: CUSTOMER,
      quoteNumber: null,
      serviceLevel: "D1",
      pickupDate: "2026-10-15",
      pickupTime: null,
      pickup: stop(),
      delivery: stop({ postcode: "602 00", city: "Brno" }),
      load: load(),
      price: { source: "TARIFF" },
      scope: "LTL",
      selfDelivered: true,
    });
    expect(c.legs.map((l) => l.kind)).toEqual(["DELIVERY"]);
    await expect(
      consignmentService.update(user, c.id, {
        quoteNumber: null,
        serviceLevel: "D1",
        pickupDate: c.pickupDate,
        pickupTime: null,
        load: c.load,
        pickup: stop(),
        delivery: stop({ postcode: "602 00", city: "Brno" }),
        price: { source: "TARIFF" },
        scope: "FTL",
        version: c.version,
        reprice: false,
      }),
    ).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("draws the legs again when the last mile changes while every leg is open; refuses once a leg is planned", async () => {
    const c = await ltl();
    const fields = { quoteNumber: null, serviceLevel: "D1" as const, pickupDate: c.pickupDate, pickupTime: null, pickup: stop({ name: "Alfa" }), delivery: stop({ name: "Beta", city: "Brno", postcode: "60200" }), load: c.load, price: { source: "TARIFF" as const }, reprice: false };
    const brought = await consignmentService.update(user, c.id, { ...fields, scope: "LTL", selfDelivered: true, lastMile: "OWN_RUN", version: c.version });
    expect(brought.legs.map((l) => l.kind)).toEqual(["DELIVERY"]);
    await ltlService.createTrip(user, { kind: "DELIVERY_RUN", date: "2026-10-16", haulierCustomerId: HAULIER, vehicleTypeCode: "van", legIds: [brought.legs[0]!.id], price: manual(1000) });
    const now = await consignmentService.get(user, c.id);
    await expect(consignmentService.update(user, c.id, { ...fields, scope: "LTL", selfDelivered: false, lastMile: "OWN_RUN", version: now.version })).rejects.toThrow(/take its legs off/);
  });
});

describe("planning board", () => {
  it("is refused until our warehouse's address is set", async () => {
    vi.mocked(settingsService.get).mockResolvedValue(withHub({ name: "", street: "", postcode: "", city: "", country: "CZ" }));
    await expect(ltlService.board(user, "2026-10-15", "PICKUP_RUN")).rejects.toThrow("Set the warehouse address in Trucking settings");
  });

  it("shows the open legs of the kind with deadlines and the day's trips with fill and stops; a partner's delivery is not on our runs", async () => {
    const a = await ltl({ pickupDate: "2026-10-14" });
    const b = await ltl({ pickupDate: "2026-10-16", lastMileOf: "PARTNER" });
    const pickups = await ltlService.board(user, "2026-10-15", "PICKUP_RUN");
    expect(pickups.unplanned.map((l) => [l.consignmentRef, l.deadline])).toEqual([
      [a.ref, "overdue"],
      [b.ref, "tomorrow"],
    ]);
    const deliveries = await ltlService.board(user, "2026-10-16", "DELIVERY_RUN");
    expect(deliveries.unplanned.map((l) => l.consignmentRef)).toEqual([a.ref]);
    await pickupRun([legOf(a.id, "PICKUP")]);
    const after = await ltlService.board(user, "2026-10-15", "PICKUP_RUN");
    expect(after.unplanned.map((l) => l.consignmentRef)).toEqual([b.ref]);
    expect(after.trips).toHaveLength(1);
    expect(after.trips[0]).toMatchObject({ kind: "PICKUP_RUN", haulierName: "Bravo", buyTotal: 3000, transportOrderSent: false });
    expect(after.trips[0]!.fill).toEqual({ ldm: 0.8, kg: 500, palletPlaces: 2, ldmPercent: 26.7, kgPercent: 41.7 });
    expect(after.trips[0]!.stops.map((s) => s.consignmentRef)).toEqual([a.ref]);
  });
});

describe("pick-up runs: legs, cost split and costs per job", () => {
  it("splits an agreed price over the legs by chargeable weight and pushes one buying line per job", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 1000 });
    const c = await ltl({ weightKg: 1500, shipment: SHIPMENT2 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP"), legOf(c.id, "PICKUP")], manual(1000));
    expect(trip).toMatchObject({ kind: "PICKUP_RUN", status: "DRAFT", stopOrder: [legOf(a.id, "PICKUP").id, legOf(b.id, "PICKUP").id, legOf(c.id, "PICKUP").id] });
    expect(trip.legs.map((l) => l.costShareCzk)).toEqual([166.67, 333.33, 500]);
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT}`)!.buying).toEqual([
      expect.objectContaining({ description: `${trip.ref} pick-up run share (2 of 3 consignments)`, amount: 500, currency: "CZK", vendor: "Bravo" }),
    ]);
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT2}`)!.buying[0]!.amount).toBe(500);
    // Only the pick-up is planned: the delivery leg is still open.
    expect(cOf(a.id).status).toBe("BOOKED");
    const detail = await consignmentService.get(user, a.id);
    expect(detail).toMatchObject({ buyCzk: 166.67, tripRef: trip.ref, haulierName: "Bravo" });
  });

  it("uses the haulier's cost-split basis (LDM)", async () => {
    vi.mocked(haulierRepository.findMany).mockResolvedValue([
      { profile: { customerId: HAULIER, costSplitBasis: "ldm", adrCapable: true, vehicleTypes: [], blocked: false, blockedAt: null }, lanes: [] } as never,
    ]);
    const a = await ltl({ weightKg: 2000, loadOver: { ldm: 1 } });
    const b = await ltl({ weightKg: 100, loadOver: { ldm: 3 } });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], manual(1000));
    expect(trip.legs.map((l) => l.costShareCzk)).toEqual([250, 750]);
  });

  it("is PLANNED once every leg is planned", async () => {
    const a = await ltl();
    await pickupRun([legOf(a.id, "PICKUP")]);
    await ltlService.createTrip(user, { kind: "DELIVERY_RUN", date: "2026-10-16", haulierCustomerId: HAULIER2, vehicleTypeCode: "van", legIds: [legOf(a.id, "DELIVERY").id], price: manual(800) });
    expect(cOf(a.id).status).toBe("PLANNED");
    expect((await consignmentService.get(user, a.id)).buyCzk).toBe(3800);
  });

  it("refuses legs of another kind, legs already planned, a blocked haulier and a missing hub", async () => {
    const a = await ltl();
    await expect(pickupRun([legOf(a.id, "DELIVERY")])).rejects.toThrow(/delivery leg cannot go on a pick-up run/);
    await pickupRun([legOf(a.id, "PICKUP")]);
    await expect(pickupRun([legOf(a.id, "PICKUP")])).rejects.toThrow(/already planned/);
    vi.mocked(haulierService.get).mockResolvedValueOnce(haulier(HAULIER, "Bravo", { status: "blocked", issues: [{ code: "blocked", severity: "block", message: "Blocked: claims" }] }));
    await expect(pickupRun([])).rejects.toThrow("Bravo cannot be put on a trip: Blocked: claims");
    vi.mocked(settingsService.get).mockResolvedValue(withHub({ name: "", street: "", postcode: "", city: "", country: "CZ" }));
    await expect(pickupRun([])).rejects.toThrow("Set the warehouse address in Trucking settings");
  });

  it("adds and removes legs with the version read; a removed job's lines are removed and the price split again", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 500, shipment: SHIPMENT2 });
    const c = await ltl({ weightKg: 1000 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], manual(1000));
    await expect(ltlService.assignLegs(user, trip.id, { add: [], remove: [], stopOrder: null, version: trip.version - 1 })).rejects.toMatchObject({ code: "aborted" });
    const next = await ltlService.assignLegs(user, trip.id, { add: [legOf(c.id, "PICKUP").id], remove: [legOf(b.id, "PICKUP").id], stopOrder: null, version: trip.version });
    expect(next.legs.map((l) => [l.consignmentRef, l.costShareCzk])).toEqual([
      [a.ref, 333.33],
      [c.ref, 666.67],
    ]);
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT2}`)).toEqual({ sourceRef: `trucking:trip:${trip.id}:job:${SHIPMENT2}`, buying: [], selling: [] });
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT}`)!.buying[0]).toMatchObject({ amount: 1000, description: `${trip.ref} pick-up run share (2 of 2 consignments)` });
    expect(legOf(b.id, "PICKUP")).toMatchObject({ tripId: null, status: "OPEN", costShareCzk: null });
    const reordered = await ltlService.assignLegs(user, trip.id, { add: [], remove: [], stopOrder: [legOf(c.id, "PICKUP").id, legOf(a.id, "PICKUP").id], version: next.version });
    expect(reordered.legs.map((l) => l.consignmentRef)).toEqual([c.ref, a.ref]);
    expect(eventsOf("legs_planned").map((e) => (e.payload as { summary: string }).summary)).toContain(`Pick-up taken off ${trip.ref} (Bravo)`);
  });

  it("prices from the tariff: a TRIP-band tariff once for the trip, otherwise each leg and summed; follows the legs", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 700 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], { source: "TARIFF" });
    expect(trip.buy).toMatchObject({ source: "TARIFF", total: 1200, tariffName: "Tariff a1 (per consignment)" });
    expect(trip.buy!.lines.map((l) => l.label)).toEqual([`${a.ref}: Freight`, `${b.ref}: Freight`]);
    const req = vi.mocked(rateService.rate).mock.calls.at(-1)![1];
    expect(req).toMatchObject({ scope: "LTL", fromPostcode: "11000", toPostcode: "25001", weightKg: 700 });
    const fewer = await ltlService.assignLegs(user, trip.id, { add: [], remove: [legOf(b.id, "PICKUP").id], stopOrder: null, version: trip.version });
    expect(fewer.buy!.total).toBe(500);
    expect(fewer.legs[0]!.costShareCzk).toBe(500);

    const lh = await ltl({ lastMileOf: "PARTNER" });
    vi.mocked(customers.customerSiteList).mockResolvedValue({ data: [{ id: DEPOT, kind: "delivery", label: "depot", postcode: "70200", city: "Ostrava", country: "CZ" }] } as never);
    await ltlService.legPartner(user, legOf(lh.id, "DELIVERY").id, { haulierCustomerId: HAULIER2, depotSiteId: DEPOT, price: manual(400) });
    const line = await ltlService.createTrip(user, { kind: "LINEHAUL", date: "2026-10-16", haulierCustomerId: HAULIER, vehicleTypeCode: "tautliner_136", legIds: [legOf(lh.id, "LINEHAUL").id], price: { source: "TARIFF" } });
    expect(line.buy).toMatchObject({ total: 7000, tariffName: "Tariff a1" });
    expect(vi.mocked(rateService.rate).mock.calls.at(-1)![1]).toMatchObject({ scope: "LINEHAUL", fromPostcode: "25001", toPostcode: "70200" });
  });

  it("re-prices with an agreed price and splits it again", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 1500 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], manual(1000));
    const repriced = await ltlService.reprice(user, trip.id, manual(2000));
    expect(repriced.legs.map((l) => l.costShareCzk)).toEqual([500, 1500]);
    expect(eventsOf("trip_repriced")).toHaveLength(1);
  });

  it("warns (never blocks) about ADR on a haulier without ADR and an overloaded van", async () => {
    const a = await ltl({ weightKg: 1500, loadOver: { adr: true, adrUn: "1263", adrClass: "3" } });
    const trip = await pickupRun([legOf(a.id, "PICKUP")]);
    expect(trip.warnings).toEqual(["Over capacity: 1 500 of 1 200 kg", `${a.ref} is ADR goods and Bravo is not ADR-capable`]);
  });

  it("shows the fill and the warnings in the trips list too", async () => {
    const a = await ltl({ weightKg: 1500, loadOver: { adr: true, adrUn: "1263", adrClass: "3" } });
    const trip = await pickupRun([legOf(a.id, "PICKUP")]);
    const [item] = (await tripService.list(user, {})).filter((t) => t.id === trip.id);
    expect(item).toMatchObject({ kind: "PICKUP_RUN", fill: trip.fill, warnings: trip.warnings });
  });
});

describe("transport order, our warehouse and the trip's stamps", () => {
  it("sends the run's order (one PDF with every stop, no haulier link), orders the consignments and announces the trip to the warehouse per job", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 300, shipment: SHIPMENT2 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], manual(600));
    const sent = await transportOrderService.send(user, trip.id, { pickupPin: null, language: "en", to: [], note: "" });
    expect(sent.recordedOnly).toBe(true);
    expect(sent.trip.status).toBe("ORDERED");
    expect(store.links).toHaveLength(0);
    const doc = vi.mocked(buildLtlTransportOrderPdf).mock.calls[0]![0];
    expect(doc.stops.map((s) => [s.kind, s.consignmentRef])).toEqual([
      ["PICKUP", a.ref],
      ["PICKUP", b.ref],
    ]);
    expect(cOf(a.id).status).toBe("ORDERED");
    expect(outboxOf("expect_arrival").map((r) => r.payload)).toEqual([
      expect.objectContaining({ shipmentId: SHIPMENT, tripRef: trip.ref, tripKind: "PICKUP_RUN", haulierName: "Bravo", weightKg: 500, pieces: 2, expectedAt: "2026-10-15T12:00:00.000Z" }),
      expect.objectContaining({ shipmentId: SHIPMENT2, weightKg: 300 }),
    ]);
    // A new plate is announced again; a job taken off the trip is withdrawn.
    const t = await tripService.get(user, trip.id);
    await tripService.update(user, trip.id, { vehicleTypeCode: "van", tractorPlate: "1ab 2345", trailerPlate: "", driverName: "Petr", driverPhone: "+420 1", version: t.version });
    expect(outboxOf("expect_arrival").at(-1)!.payload).toMatchObject({ plate: "1AB2345", driver: "Petr" });
    const t2 = await tripService.get(user, trip.id);
    await ltlService.assignLegs(user, trip.id, { add: [], remove: [legOf(b.id, "PICKUP").id], stopOrder: null, version: t2.version });
    expect(outboxOf("cancel_expected").map((r) => r.payload)).toEqual([{ shipmentId: SHIPMENT2, tripRef: trip.ref }]);
  });

  it("refuses the order while a consignment's margin (its share of the trip) is below the floor", async () => {
    const a = await ltl();
    const trip = await pickupRun([legOf(a.id, "PICKUP")], manual(3000));
    await expect(transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "en" })).rejects.toThrow(`${a.ref}: The margin is below the floor`);
    await consignmentService.approveMargin(manager, a.id, "new customer, worth it");
    const file = await transportOrderService.pdf(user, trip.id, { pickupPin: null, language: "en" });
    expect(file.fileName).toBe(`${trip.ref}.pdf`);
  });

  it("cancels a trip until the truck leaves: legs back to planning, lines removed, the warehouse told", async () => {
    const a = await ltl();
    const trip = await pickupRun([legOf(a.id, "PICKUP")], manual(600));
    await transportOrderService.send(user, trip.id, { pickupPin: null, language: "en", to: [], note: "" });
    const cancelled = await tripService.cancel(manager, trip.id, "haulier has no truck");
    expect(cancelled.status).toBe("CANCELLED");
    expect(legOf(a.id, "PICKUP")).toMatchObject({ tripId: null, status: "OPEN" });
    expect(cOf(a.id).status).toBe("BOOKED");
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT}`)!.buying).toEqual([]);
    expect(outboxOf("cancel_expected").map((r) => r.payload)).toEqual([{ shipmentId: SHIPMENT, tripRef: trip.ref }]);
  });

  it("stamps departure then arrival; a pick-up run's arrival stamps the pick-ups and the legs can no longer change", async () => {
    const a = await ltl();
    const trip = await pickupRun([legOf(a.id, "PICKUP")], manual(600));
    await expect(ltlService.tripStamp(user, trip.id, "departed", null)).rejects.toThrow("Send the transport order first");
    await transportOrderService.send(user, trip.id, { pickupPin: null, language: "en", to: [], note: "" });
    await expect(ltlService.tripStamp(user, trip.id, "arrived", null)).rejects.toThrow("Stamp the departure first");
    const gone = await ltlService.tripStamp(user, trip.id, "departed", null);
    expect(gone.status).toBe("IN_TRANSIT");
    await expect(ltlService.tripStamp(user, trip.id, "departed", null)).rejects.toMatchObject({ code: "already_exists" });
    await expect(ltlService.assignLegs(user, trip.id, { add: [], remove: [legOf(a.id, "PICKUP").id], stopOrder: null, version: gone.version })).rejects.toThrow(/truck has left/);
    await expect(tripService.cancel(manager, trip.id, "too late now")).rejects.toThrow(/truck has left/);
    const back = await ltlService.tripStamp(user, trip.id, "arrived", null);
    expect(back.status).toBe("DONE");
    expect(cOf(a.id)).toMatchObject({ status: "PICKED_UP", pickedUpBy: "Jana Nováková" });
  });
});

describe("the warehouse's gate", () => {
  const gate = (kind: GateStampedEvent["kind"], at: string, stampKind: string = kind): GateStampedEvent => ({
    companyId: COMPANY,
    shipmentId: SHIPMENT,
    positionId: "pos-1",
    wczRef: "WCZ2026000011",
    kind,
    stampKind,
    at,
    userId: "00000000-0000-0000-0000-000000000002",
  });

  it("gate-in: AT_HUB, the pick-up done and the promised date final from the gate-in (after the cut-off: next working day); once only", async () => {
    const a = await ltl({ promisedDate: "2026-10-16" });
    await pickupRun([legOf(a.id, "PICKUP")]);
    // 15 Oct 2026 13:00 Prague: after the 12:00 cut-off → counts from Fri 16 → D1 = Mon 19 Oct
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T11:00:00.000Z"));
    expect(cOf(a.id)).toMatchObject({ status: "AT_HUB", promisedDate: "2026-10-19", promisedFinal: true });
    expect(cOf(a.id).gateInAt!.toISOString()).toBe("2026-10-15T11:00:00.000Z");
    expect(legOf(a.id, "PICKUP").status).toBe("DONE");
    expect(outboxOf("planned").at(-1)!.payload).toEqual({ plannedDeliveryDate: "2026-10-19" });
    const events = eventsOf("gate_in").length;
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T11:00:00.000Z"));
    expect(eventsOf("gate_in")).toHaveLength(events);
    const detail = await consignmentService.get(user, a.id);
    expect(detail).toMatchObject({ gateInAt: "2026-10-15T11:00:00.000Z", promisedFinal: true });
  });

  it("gate event: the holidays read names the company itself (a pub/sub message carries no login)", async () => {
    const a = await ltl({ promisedDate: "2026-10-16" });
    await pickupRun([legOf(a.id, "PICKUP")]);
    vi.mocked(holidays._internalHolidaysCzNational).mockClear();
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T11:00:00.000Z"));
    expect(holidays._internalHolidaysCzNational).toHaveBeenCalled();
    for (const call of vi.mocked(holidays._internalHolidaysCzNational).mock.calls) {
      expect(call[1]).toMatchObject({ authData: { companyID: COMPANY } });
    }
  });

  it("a gate-out that arrives before its gate-in waits for it (retried), then applies; an old one no longer waits", async () => {
    const own = await ltl();
    const soon = new Date(Date.now() + 60_000).toISOString();
    // Out of order, as after an outage: refused for a retry, and not recorded as seen.
    await expect(ltlService.handleGateStamped(gate("gateOut", soon))).rejects.toThrow("before its gate-in");
    expect(cOf(own.id).status).not.toBe("OUT_FOR_DELIVERY");
    await ltlService.handleGateStamped(gate("gateIn", new Date(Date.now() - 60_000).toISOString()));
    expect(cOf(own.id).status).toBe("AT_HUB");
    // The retry now goes through.
    await ltlService.handleGateStamped(gate("gateOut", soon));
    expect(cOf(own.id).status).toBe("OUT_FOR_DELIVERY");

    // A gate-out older than the wait with no gate-in at all is taken as it is (nothing to apply).
    const late = await ltl();
    await expect(
      ltlService.handleGateStamped({ ...gate("gateOut", new Date(Date.now() - 7 * 3600_000).toISOString()), positionId: "pos-2" }),
    ).resolves.toBeUndefined();
    expect(cOf(late.id).status).not.toBe("OUT_FOR_DELIVERY");
  });

  it("gate-out: OUT_FOR_DELIVERY (or ON_LINEHAUL when a line haul follows); voided stamps are taken back", async () => {
    const own = await ltl();
    const partner = await ltl({ lastMileOf: "PARTNER" });
    vi.mocked(customers.customerSiteList).mockResolvedValue({ data: [{ id: DEPOT, kind: "both", label: "depot", postcode: "70200", city: "Ostrava", country: "CZ" }] } as never);
    await ltlService.legPartner(user, legOf(partner.id, "DELIVERY").id, { haulierCustomerId: HAULIER2, depotSiteId: DEPOT, price: manual(400) });
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T09:00:00.000Z"));
    await ltlService.handleGateStamped(gate("gateOut", "2026-10-16T05:00:00.000Z"));
    expect(cOf(own.id).status).toBe("OUT_FOR_DELIVERY");
    expect(cOf(partner.id).status).toBe("ON_LINEHAUL");
    await ltlService.handleGateStamped(gate("voided", "2026-10-16T06:00:00.000Z", "gateOut"));
    expect(cOf(own.id)).toMatchObject({ status: "AT_HUB", gateOutAt: null });
    await ltlService.handleGateStamped(gate("voided", "2026-10-16T06:10:00.000Z", "gateIn"));
    expect(cOf(own.id)).toMatchObject({ gateInAt: null, promisedFinal: false, status: "BOOKED" });
    expect(legOf(own.id, "PICKUP").status).toBe("OPEN");
    expect(eventsOf("gate_voided").length).toBe(4);
  });

  it("ignores a gate event of a job without LTL consignments, or without a job", async () => {
    await ltlService.handleGateStamped({ ...gate("gateIn", "2026-10-15T09:00:00.000Z"), shipmentId: null });
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T09:00:00.000Z"));
    expect(store.events).toHaveLength(0);
  });

  it("a delivery is stamped only after the gate-in; it finishes the delivery leg", async () => {
    const a = await ltl({ selfDelivered: true });
    await expect(consignmentService.stamp(user, a.id, "delivered", null)).rejects.toThrow(/no gate-in/);
    await expect(consignmentService.stamp(user, a.id, "pickedUp", null)).rejects.toThrow(/customer brings/);
    await ltlService.handleGateStamped(gate("gateIn", "2026-10-15T07:00:00.000Z"));
    expect(cOf(a.id).status).toBe("AT_HUB");
    const done = await consignmentService.stamp(user, a.id, "delivered", null);
    expect(done.status).toBe("DELIVERED");
    expect(legOf(a.id, "DELIVERY").status).toBe("DONE");
  });
});

describe("a partner's delivery", () => {
  it("is priced from the partner's BUY tariff (LTL) from its depot, adds the line haul and pushes its own lines", async () => {
    const a = await ltl({ lastMileOf: "PARTNER", weightKg: 400 });
    vi.mocked(customers.customerSiteList).mockResolvedValue({
      data: [
        { id: DEPOT, kind: "delivery", label: "depot", postcode: "70200", city: "Ostrava", country: "CZ" },
        { id: "00000000-0000-0000-0000-0000000000e2", kind: "loading", label: "yard", postcode: "70200", city: "Ostrava", country: "CZ" },
      ],
    } as never);
    const c = await ltlService.legPartner(user, legOf(a.id, "DELIVERY").id, { haulierCustomerId: HAULIER2, depotSiteId: DEPOT, price: { source: "TARIFF" } });
    expect(vi.mocked(rateService.rate).mock.calls.at(-1)![1]).toMatchObject({ scope: "LTL", fromPostcode: "70200", toPostcode: "60200" });
    expect(c.legs.map((l) => [l.kind, l.status])).toEqual([
      ["PICKUP", "OPEN"],
      ["LINEHAUL", "OPEN"],
      ["DELIVERY", "PLANNED"],
    ]);
    const delivery = c.legs.find((l) => l.kind === "DELIVERY")!;
    expect(delivery).toMatchObject({ haulierCustomerId: HAULIER2, depotSiteId: DEPOT, fromText: "Gama depot, 702 00 Ostrava" });
    expect(delivery.buy).toMatchObject({ source: "TARIFF", total: 800 });
    expect(lastCostsOf(`trucking:leg:${delivery.id}`)!.buying[0]).toMatchObject({ amount: 800, description: `${a.ref} partner delivery · Freight` });
    // Back to collecting at our warehouse: the line haul goes.
    const again = await ltlService.legPartner(user, delivery.id, { haulierCustomerId: HAULIER2, depotSiteId: null, price: manual(500) });
    expect(again.legs.map((l) => l.kind)).toEqual(["PICKUP", "DELIVERY"]);
    await expect(
      ltlService.legPartner(user, delivery.id, { haulierCustomerId: HAULIER2, depotSiteId: "00000000-0000-0000-0000-0000000000e2", price: manual(500) }),
    ).rejects.toThrow(/must be a delivery site of Gama/);
  });

  it("only for a delivery leg of a partner last mile", async () => {
    const own = await ltl();
    await expect(ltlService.legPartner(user, legOf(own.id, "DELIVERY").id, { haulierCustomerId: HAULIER2, depotSiteId: null, price: manual(1) })).rejects.toThrow(/not delivered by a partner/);
    await expect(ltlService.legPartner(user, legOf(own.id, "PICKUP").id, { haulierCustomerId: HAULIER2, depotSiteId: null, price: manual(1) })).rejects.toThrow(/Only the delivery leg/);
  });
});

describe("cancelling an LTL consignment", () => {
  it("takes its legs off their trips (split again over the others) and removes its partner's delivery lines", async () => {
    const a = await ltl({ weightKg: 500, lastMileOf: "PARTNER" });
    const b = await ltl({ weightKg: 500 });
    const trip = await pickupRun([legOf(a.id, "PICKUP"), legOf(b.id, "PICKUP")], manual(1000));
    const partnerLeg = legOf(a.id, "DELIVERY");
    await ltlService.legPartner(user, partnerLeg.id, { haulierCustomerId: HAULIER2, depotSiteId: null, price: manual(300) });
    await consignmentService.cancel(manager, a.id, "customer cancelled");
    expect(cOf(a.id).status).toBe("CANCELLED");
    expect(store.ltlLegs.filter((l) => l.consignmentId === a.id).every((l) => l.deletedAt)).toBe(true);
    expect(legOf(b.id, "PICKUP").costShareCzk).toBe(1000);
    expect(lastCostsOf(`trucking:leg:${partnerLeg.id}`)!.buying).toEqual([]);
    expect(lastCostsOf(`trucking:trip:${trip.id}:job:${SHIPMENT}`)!.buying[0]).toMatchObject({ amount: 1000, description: `${trip.ref} pick-up run share (1 of 1 consignment)` });
  });

  it("is refused once the goods are at our warehouse", async () => {
    const a = await ltl({ selfDelivered: true });
    await ltlService.handleGateStamped({ companyId: COMPANY, shipmentId: SHIPMENT, positionId: "p", wczRef: "", kind: "gateIn", stampKind: "gateIn", at: "2026-10-15T07:00:00.000Z", userId: "" });
    await expect(consignmentService.cancel(manager, a.id, "too late")).rejects.toThrow(/at our warehouse/);
  });
});

describe("manifest and labels", () => {
  it("prints the run's manifest from its legs in stop order", async () => {
    const a = await ltl({ weightKg: 500 });
    const b = await ltl({ weightKg: 700 });
    const trip = await pickupRun([legOf(b.id, "PICKUP"), legOf(a.id, "PICKUP")]);
    const file = await ltlDocumentService.manifest(user, trip.id, "en");
    expect(file).toMatchObject({ fileName: `${trip.ref}-manifest.pdf`, contentType: "application/pdf" });
    const doc = vi.mocked(buildManifestPdf).mock.calls[0]![0];
    expect(doc.rows.map((r) => r.consignmentRef)).toEqual([b.ref, a.ref]);
    expect(doc).toMatchObject({ tripKindLabel: "Pick-up run", totals: { weightKg: 1200 } });
    expect(doc.to?.name).toBe("Sklad Brandýs");
    expect(eventsOf("manifest_printed")).toHaveLength(1);
  });

  it("prints a label per piece with the service level", async () => {
    const a = await ltl();
    const file = await ltlDocumentService.labels(user, [a.id], true);
    expect(file.fileName).toBe(`${a.ref}-labels.pdf`);
    const labels = vi.mocked(buildLabelsPdf).mock.calls[0]![0];
    expect(labels.map((l) => `${l.pieceNo}/${l.pieceCount}`)).toEqual(["1/2", "2/2"]);
    expect(labels[0]).toMatchObject({ serviceLabel: "+1 day", toPostcode: "602 00" });
    await expect(ltlDocumentService.labels(user, [], false)).rejects.toMatchObject({ code: "invalid_argument" });
  });
});
