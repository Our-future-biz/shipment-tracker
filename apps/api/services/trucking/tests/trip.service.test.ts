import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The trip service (with the consignment service) runs for real against in-memory repositories
// (truckingFakes); the rate engine, the settings and the haulier profiles are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(), _internalHaulierList: vi.fn() },
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
vi.mock("../repositories/truckingDocument.repository", async () => ({ truckingDocumentRepository: (await import("./truckingFakes")).truckingDocumentRepository }));
vi.mock("../repositories/truckingOutbox.repository", async () => ({ truckingOutboxRepository: (await import("./truckingFakes")).truckingOutboxRepository }));
vi.mock("../repositories/event.repository", async () => (await import("./truckingFakes")).eventModule);
vi.mock("../repositories/exception.repository", async () => ({ exceptionRepository: (await import("./truckingFakes")).exceptionRepository }));
vi.mock("../repositories/internal.repository", async () => ({ internalRepository: (await import("./truckingFakes")).internalRepository }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn(async () => []) } }));
vi.mock("../services/haulier.service", async (orig) => ({ ...(await orig<object>()), haulierService: { get: vi.fn() } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => {
  const { settings } = await import("./truckingFakes");
  return { settingsService: { get: vi.fn(async () => settings()), vehicleCodes: vi.fn(async () => settings().vehicleTypes.map((v) => v.code)) } };
});
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { tripService } from "../services/trip.service";
import { haulierService } from "../services/haulier.service";
import { eurRate, rateService } from "../services/rate.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import type { HaulierDetail, PricedSide, RateResponse } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import { COMPANY, CUSTOMER, HAULIER, HAULIER2, SHIPMENT, TX, eventsOf, load, manager, outboxOf, resetStore, stop, store, user } from "./truckingFakes";

const buySide = (owner: string, name: string, total: number, preferred = false): PricedSide => ({
  tariffId: `t-${owner}`,
  tariffName: `${name} FTL`,
  tariffVersionId: `v-${owner}`,
  versionNo: 1,
  ownerCustomerId: owner,
  ownerName: name,
  currency: "CZK",
  zoneCode: "Z1",
  zoneLabel: "Zone 1",
  bandLabel: "Trip",
  chargeable: { basis: "TRIP", quantity: 1, explanation: "1 trip" },
  lines: [{ code: "FREIGHT", label: "Freight", qty: 1, unit: "trip", unitPrice: total, amount: total }],
  total,
  totalCzk: total,
  fx: null,
  preferred,
});

const rated = (buy: PricedSide[]): RateResponse =>
  ({ request: {}, ratedAt: "2026-10-15T10:00:00.000Z", results: [{ serviceLevel: "D1", buy, excluded: [], sell: { reason: "n/a" } }] }) as unknown as RateResponse;

const haulier = (id: string, name: string, over: Partial<HaulierDetail> = {}, adrCapable = false): HaulierDetail =>
  ({
    customerId: id,
    companyName: name,
    ico: "12345678",
    dic: "CZ12345678",
    city: "Brno",
    profile: { adrCapable, paymentDays: 30 },
    status: "ok",
    issues: [],
    ...over,
  }) as HaulierDetail;

async function booked(over: Partial<TruckingConsignmentRecord> = {}) {
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "TCZ2026000001",
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    serviceLevel: "D1",
    status: "BOOKED",
    pickupDate: "2026-10-16",
    pickup: { ...stop(), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    sellCzk: 12000,
    estBuyCzk: 9000,
    ...over,
  });
  return c;
}

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.mocked(rateService.rate).mockResolvedValue(rated([buySide(HAULIER, "Bravo Trans", 9000, true), buySide(HAULIER2, "Alfa Cargo", 8500)]));
  vi.mocked(haulierService.get).mockImplementation(async (_c, id) => (id === HAULIER ? haulier(HAULIER, "Bravo Trans") : haulier(HAULIER2, "Alfa Cargo")));
  vi.mocked(eurRate).mockResolvedValue({ rate: 25, date: "2026-10-15" });
});

afterEach(() => vi.useRealTimers());

describe("FTL trip: haulier and buy price", () => {
  it("takes the engine's first candidate (preferred) at its tariff price; plans the consignment; LCZ ref, leg", async () => {
    const c = await booked();
    const { trip, consignment } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: "tautliner_136", price: { source: "TARIFF" } });
    expect(trip).toMatchObject({ ref: "LCZ2026000001", status: "DRAFT", haulierCustomerId: HAULIER, haulierName: "Bravo Trans", vehicleTypeCode: "tautliner_136" });
    expect(trip.buy).toMatchObject({ source: "TARIFF", total: 9000, tariffVersionId: `v-${HAULIER}` });
    expect(trip.buyCandidates).toHaveLength(2);
    expect(consignment).toMatchObject({ status: "PLANNED", tripId: trip.id, tripRef: "LCZ2026000001", haulierName: "Bravo Trans", buyCzk: 9000, marginCzk: 3000 });
    expect(store.legs).toEqual([{ consignmentId: c.id, tripId: trip.id, deletedAt: null }]);
    expect(eventsOf("trip_created")[0]!.payload).toMatchObject({ facts: { changedFromSuggestion: false } });
  });

  it("lists an FTL trip with its consignment's fill and no warnings", async () => {
    const c = await booked();
    const { trip } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: "tautliner_136", price: { source: "TARIFF" } });
    const [item] = await tripService.list(user, {});
    expect(item).toMatchObject({ id: trip.id, consignmentRefs: [c.ref], fill: trip.fill, warnings: [] });
    expect(item!.fill.kgPercent).not.toBeNull();
  });

  it("owes the job the planned dates and the buy lines (outbox rows written with the plan)", async () => {
    const c = await booked();
    const { trip } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    expect(outboxOf("planned")).toEqual([
      expect.objectContaining({ consignmentId: c.id, shipmentId: SHIPMENT, payload: { pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19" }, actingUserId: user.userID }),
    ]);
    const costs = outboxOf("costs")[0]!.payload as { sourceRef: string; buying: { vendor: string; haulierId: string; description: string }[] };
    expect(costs.sourceRef).toBe(`trucking:trip:${trip.id}`);
    expect(costs.buying).toEqual([expect.objectContaining({ vendor: "Bravo Trans", haulierId: HAULIER, description: "LCZ2026000001 · Freight" })]);
  });

  it("logs a haulier other than the suggested one", async () => {
    const c = await booked();
    await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: HAULIER2, vehicleTypeCode: null, price: { source: "TARIFF" } });
    const ev = eventsOf("trip_created")[0]!;
    expect(ev.payload).toMatchObject({ facts: { suggestedHaulierId: HAULIER, haulierCustomerId: HAULIER2, changedFromSuggestion: true } });
    expect((ev.payload as { summary: string }).summary).toContain("suggested haulier was Bravo Trans");
  });

  it("refuses a blocked haulier with its issues", async () => {
    const c = await booked();
    vi.mocked(haulierService.get).mockResolvedValue(
      haulier(HAULIER2, "Alfa Cargo", { status: "blocked", issues: [{ code: "insurance_expired", severity: "block", message: "Carrier liability insurance expired on 30 Sep 2026" }] }),
    );
    await expect(tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: HAULIER2, vehicleTypeCode: null, price: { source: "TARIFF" } })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Alfa Cargo cannot be put on a trip: Carrier liability insurance expired on 30 Sep 2026",
      details: { issues: [expect.objectContaining({ code: "insurance_expired" })] },
    });
    expect(store.trips).toHaveLength(0);
  });

  it("refuses a haulier that is not ADR-capable for ADR goods", async () => {
    const c = await booked({ load: load({ adr: true, adrUn: "1203", adrClass: "3" }) });
    await expect(tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } })).rejects.toMatchObject({
      message: "Bravo Trans is not ADR-capable",
    });
  });

  it("takes an agreed price (MANUAL) when the haulier has no tariff price; refuses TARIFF then", async () => {
    vi.mocked(rateService.rate).mockResolvedValue(rated([]));
    const c = await booked();
    await expect(tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } })).rejects.toMatchObject({
      code: "failed_precondition",
    });
    await expect(tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: HAULIER, vehicleTypeCode: null, price: { source: "TARIFF" } })).rejects.toMatchObject({
      message: "Bravo Trans has no tariff price for this consignment: give the agreed price",
    });
    const { trip, consignment } = await tripService.createFtl(user, {
      consignmentId: c.id,
      haulierCustomerId: HAULIER,
      vehicleTypeCode: null,
      price: { source: "MANUAL", total: 450, currency: "EUR", reason: "Spot price by phone" },
    });
    expect(trip.buy).toMatchObject({ source: "MANUAL", total: 450, totalCzk: 11250, overrideReason: "Spot price by phone" });
    expect(consignment).toMatchObject({ belowFloor: true, marginCzk: 750 });
  });

  it("refuses a consignment already on a trip, and a stale plan", async () => {
    const c = await booked();
    await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    await expect(tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } })).rejects.toMatchObject({
      message: "The consignment is already on a trip",
    });
  });
});

describe("trip update and cancel", () => {
  it("normalises plates and owes the job a new tractor plate", async () => {
    const c = await booked();
    const { trip } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    const t = await tripService.update(user, trip.id, { vehicleTypeCode: null, tractorPlate: "1ab 2345", trailerPlate: "2cd-6789", driverName: "Petr", driverPhone: "+420 1", version: trip.version });
    expect(t).toMatchObject({ tractorPlate: "1AB2345", trailerPlate: "2CD6789" });
    expect(outboxOf("plate")).toEqual([expect.objectContaining({ payload: { plateNumber: "1AB2345" } })]);
    await expect(tripService.update(user, trip.id, { vehicleTypeCode: null, tractorPlate: "X", trailerPlate: "", driverName: "", driverPhone: "", version: trip.version })).rejects.toMatchObject({
      code: "aborted",
    });
  });

  it("cancel (manager): the consignment goes back to BOOKED, the link is revoked, the buy lines removed", async () => {
    const c = await booked();
    const { trip } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    store.links.push({ tripId: trip.id, revokedAt: null } as never);
    await expect(tripService.cancel(user, trip.id, "Truck broke down")).rejects.toMatchObject({ code: "permission_denied" });
    const t = await tripService.cancel(manager, trip.id, "Truck broke down");
    expect(t.status).toBe("CANCELLED");
    expect(store.consignments[0]).toMatchObject({ status: "BOOKED", tripId: null });
    expect(store.links[0]!.revokedAt).not.toBeNull();
    expect(store.legs[0]!.deletedAt).not.toBeNull();
    expect(outboxOf("costs").at(-1)!.payload).toEqual({ sourceRef: `trucking:trip:${trip.id}`, buying: [], selling: [] });
  });

  it("refuses to cancel a trip once the goods are picked up", async () => {
    const c = await booked();
    const { trip } = await tripService.createFtl(user, { consignmentId: c.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    store.consignments[0]!.pickedUpAt = new Date();
    await expect(tripService.cancel(manager, trip.id, "Too late")).rejects.toMatchObject({ code: "failed_precondition" });
  });
});
