import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Avizace records and delivery exceptions run for real against the in-memory repositories
// (truckingFakes); the rate engine, the settings and the other services are stand-ins.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(), _internalHaulierList: vi.fn(async () => ({ hauliers: [] })) },
  shipments: { _internalShipmentBasics: vi.fn(), _internalShipmentCreateRoad: vi.fn() },
  quotes: { salesQuoteGet: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
  warehouse: { _internalWarehouseExceptionsForShipments: vi.fn(async () => ({ exceptions: [] })) },
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
vi.mock("../repositories/tariff.repository", () => ({ tariffRepository: { list: vi.fn(async () => []), bindingOn: vi.fn(async () => []), findVersion: vi.fn(), find: vi.fn() } }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn(async () => []) } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), download: vi.fn() } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { avizaceService } from "../services/avizace.service";
import { exceptionService } from "../services/exception.service";
import { consignmentService } from "../services/consignment.service";
import { tariffRepository } from "../repositories/tariff.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import type { ExceptionInput } from "../lib/avizaceRules";
import { COMPANY, CUSTOMER, HAULIER, SHIPMENT, eventsOf, load, manager, outboxOf, resetStore, stop, store, tripRepository, user, TX } from "./truckingFakes";

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString("base64");

/** A consignment on an FTL trip with the transport order sent (or as `over` says). */
async function seed(over: Partial<TruckingConsignmentRecord> = {}) {
  const trip = await tripRepository.insert(TX, {
    companyId: COMPANY,
    ref: "LCZ2026000001",
    haulierCustomerId: HAULIER,
    haulierName: "Bravo Trans",
    plannedPickupDate: "2026-10-16",
    status: "ORDERED",
    orderSentAt: new Date("2026-10-14T08:00:00Z"),
    buyCzk: 9000,
  });
  const c = await consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `TCZ2026${String(store.consignments.length + 1).padStart(6, "0")}`,
    shipmentId: SHIPMENT,
    jobNumber: "CZ00000042",
    customerId: CUSTOMER,
    customerName: "Alfa",
    serviceLevel: "D1",
    status: "PICKED_UP",
    pickupDate: "2026-10-14",
    pickup: { ...stop(), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    sellCzk: 12000,
    sell: { source: "TARIFF", tariffId: "t", tariffVersionId: "v-sell", versionNo: 1, tariffName: "Standard", serviceLevel: "D1", currency: "CZK", total: 12000, totalCzk: 12000, lines: [], ratedAt: "", overrideReason: null },
    tripId: trip.id,
    pickedUpAt: new Date("2026-10-14T08:00:00Z"),
    ...over,
  });
  return { c, trip };
}

const exception = (over: Partial<ExceptionInput> = {}): ExceptionInput => ({
  kind: "DAMAGE",
  failedReason: null,
  cause: "HAULIER",
  description: "Two pallets crushed",
  pieces: 2,
  waitingMinutes: null,
  amount: 1500,
  currency: "CZK",
  legId: null,
  ...over,
});

const decide = (decision: string, over: Record<string, unknown> = {}) => ({ decision: decision as never, cause: null, amount: null, currency: null, reason: "Agreed by phone", ...over });

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("avizace", () => {
  it("prepares the text and records who was told; the consignment shows it", async () => {
    const { c } = await seed({ delivery: { ...stop({ city: "Brno", avizaceRequired: true }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null } });
    const t = await avizaceService.template(user, c.id);
    expect(t.cs).toContain(c.ref);
    expect((await consignmentService.get(user, c.id)).avizaceNeeded).toBe(true);
    const d = await avizaceService.record(user, c.id, { channel: "PHONE", contact: "Eva Nováková", agreedFrom: null, agreedTo: null, note: "" });
    expect(d).toMatchObject({ avizaceNeeded: true, avizaceDone: true, avizace: { channel: "PHONE", contact: "Eva Nováková", by: "Jana Nováková" } });
    expect(eventsOf("avizace_recorded")).toHaveLength(1);
  });

  it("an FTL trip warns while its delivery needs an avizace not recorded", async () => {
    const { c } = await seed({ load: load({ b2c: true }), status: "ORDERED", pickedUpAt: null });
    const { tripService } = await import("../services/trip.service");
    const [listed] = await tripService.list(user, {});
    expect(listed!.warnings).toEqual([`${c.ref}: avizace needed and not recorded yet`]);
    await avizaceService.record(user, c.id, { channel: "SMS", contact: "+420 777", agreedFrom: null, agreedTo: null, note: "" });
    expect((await tripService.list(user, {}))[0]!.warnings).toEqual([]);
  });
});

describe("exceptions", () => {
  it("is recorded pending, decided once by a manager, closed; the consignment counts it open until then", async () => {
    const { c } = await seed();
    const e = await exceptionService.create(user, c.id, exception());
    expect(e).toMatchObject({ kind: "DAMAGE", decision: "PENDING", amount: 1500, createdBy: "Jana Nováková", closedAt: null });
    expect((await consignmentService.list(user, { view: "openExceptions" })).consignments.map((x) => x.openExceptions)).toEqual([1]);
    await expect(exceptionService.close(user, e.id, "")).rejects.toMatchObject({ message: "Decide the exception before closing it" });
    await expect(exceptionService.decide(user, e.id, decide("CLAIM_HAULIER"))).rejects.toMatchObject({ code: "permission_denied" });
    const decided = await exceptionService.decide(manager, e.id, decide("CLAIM_HAULIER"));
    expect(decided).toMatchObject({ decision: "CLAIM_HAULIER", decidedBy: "Jana Nováková" });
    await expect(exceptionService.decide(manager, e.id, decide("ABSORB"))).rejects.toMatchObject({ message: "The exception is already decided" });
    const closed = await exceptionService.close(user, e.id, "Claim sent");
    expect(closed.closedAt).not.toBeNull();
    expect((await consignmentService.get(user, c.id)).exceptions).toEqual([expect.objectContaining({ id: e.id, closedAt: closed.closedAt })]);
    expect(eventsOf("exception_created").length + eventsOf("exception_decided").length + eventsOf("exception_closed").length).toBe(3);
  });

  it("anyone may absorb nothing; absorbing an amount is a manager's", async () => {
    const { c } = await seed();
    const e = await exceptionService.create(user, c.id, exception({ amount: null }));
    await expect(exceptionService.decide(user, e.id, decide("ABSORB", { amount: 100 }))).rejects.toMatchObject({ code: "permission_denied" });
    expect(await exceptionService.decide(user, e.id, decide("ABSORB"))).toMatchObject({ decision: "ABSORB" });
  });

  it("a claim records the trip it is against (for the haulier invoice match)", async () => {
    const { c, trip } = await seed();
    const e = await exceptionService.create(user, c.id, exception());
    await exceptionService.decide(manager, e.id, decide("CLAIM_HAULIER", { amount: 1200 }));
    expect(store.exceptions[0]).toMatchObject({ claimTargetKind: "TRIP", claimTargetId: trip!.id, claimHaulierCustomerId: HAULIER, amount: 1200 });
    const { exceptionRepository } = await import("../repositories/exception.repository");
    expect(await exceptionRepository.claimsFor(COMPANY, [trip!.id])).toEqual([expect.objectContaining({ targetKind: "TRIP", amount: 1200, currency: "CZK" })]);
    expect(outboxOf("costs")).toEqual([]);
  });

  it("charging the customer adds a selling line to the job: trucking:exception:<id>", async () => {
    const { c } = await seed();
    const e = await exceptionService.create(user, c.id, exception({ kind: "WAITING_TIME", pieces: null, waitingMinutes: 45, amount: 450 }));
    await exceptionService.decide(manager, e.id, decide("CHARGE_CUSTOMER"));
    const [row] = outboxOf("costs");
    expect(row!.payload).toEqual({
      sourceRef: `trucking:exception:${e.id}`,
      buying: [],
      selling: [expect.objectContaining({ chargeCode: "road_freight", description: `${c.ref} · Waiting time 45 min`, amount: 450, currency: "CZK" })],
    });
    expect(store.internalCharges).toEqual([]);
  });

  it("for a job of another department it adds to the internal charge instead (CZK only)", async () => {
    const { c } = await seed({ internal: true, department: "Ocean Department", deliveredAt: new Date("2026-10-15T08:00:00Z") });
    const eur = await exceptionService.create(user, c.id, exception({ kind: "REDELIVERY", pieces: null, amount: 40, currency: "EUR" }));
    await expect(exceptionService.decide(manager, eur.id, decide("CHARGE_CUSTOMER"))).rejects.toMatchObject({ message: "The job is billed internally: give the amount in CZK" });
    const e = await exceptionService.create(user, c.id, exception({ kind: "REDELIVERY", pieces: null, amount: 900 }));
    await exceptionService.decide(manager, e.id, decide("CHARGE_CUSTOMER"));
    expect(store.internalCharges).toEqual([expect.objectContaining({ kind: "EXCEPTION", month: "2026-10", amount: 900, department: "Ocean Department", exceptionId: e.id })]);
    const [line] = outboxOf("costs");
    expect(line!.payload).toMatchObject({ sourceRef: `trucking:internal:${c.id}`, selling: [], buying: [expect.objectContaining({ amount: 900, vendor: "Trucking (internal)" })] });
  });

  it("an open exception keeps the job from Billing; closing the last one makes it ready to bill", async () => {
    const { c } = await seed({ deliveredAt: new Date("2026-10-15T08:00:00Z"), status: "DELIVERED" });
    const e = await exceptionService.create(user, c.id, exception());
    const d = await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(d.status).toBe("POD_RECEIVED");
    expect(outboxOf("billing")).toEqual([]);
    await exceptionService.decide(manager, e.id, decide("ABSORB"));
    await exceptionService.close(user, e.id, "");
    expect(store.consignments[0]!.status).toBe("READY_TO_BILL");
    expect(outboxOf("billing")).toHaveLength(1);
  });

  it("a failed delivery is refused once the delivery is stamped", async () => {
    const { c } = await seed({ deliveredAt: new Date("2026-10-15T08:00:00Z"), status: "DELIVERED" });
    await expect(exceptionService.create(user, c.id, exception({ kind: "FAILED_DELIVERY", failedReason: "ABSENT", pieces: null }))).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("waiting time without an amount is priced from the sell tariff's WAITING_TIME surcharge after the free time", async () => {
    const { c } = await seed();
    vi.mocked(tariffRepository.findVersion).mockResolvedValue({
      id: "v-sell",
      tariffId: "t",
      input: { surcharges: [{ code: "WAITING_TIME", calc: "PER_HOUR", value: 600, min: null, onBasePlusSurcharges: false }], rounding: { moneyStep: 1, weightStepKg: 1 } },
    } as never);
    vi.mocked(tariffRepository.find).mockResolvedValue({ id: "t", currency: "CZK" } as never);
    // FTL free time 120 min: 165 min waited → 3 started quarters at 600 / h.
    const e = await exceptionService.create(user, c.id, exception({ kind: "WAITING_TIME", pieces: null, waitingMinutes: 165, amount: null }));
    expect(e).toMatchObject({ amount: 450, currency: "CZK", waitingMinutes: 165 });
    expect(tariffRepository.findVersion).toHaveBeenCalledWith(COMPANY, "v-sell");
  });

  it("keeps photos as consignment documents; lists with the consignment's ref", async () => {
    const { c } = await seed();
    const e = await exceptionService.create(user, c.id, exception());
    const withPhoto = await exceptionService.addPhoto(user, e.id, { fileName: "crushed.png", fileBase64: PNG });
    expect(withPhoto.photos).toEqual([{ id: store.documents[0]!.id, fileName: "crushed.png" }]);
    expect(store.documents[0]).toMatchObject({ kind: "OTHER", consignmentId: c.id });
    await expect(exceptionService.addPhoto(user, e.id, { fileName: "x.txt", fileBase64: Buffer.from("hello").toString("base64") })).rejects.toMatchObject({ code: "invalid_argument" });
    const list = await exceptionService.list(user, { open: true });
    expect(list).toEqual([expect.objectContaining({ id: e.id, consignmentRef: c.ref, customerName: "Alfa", jobNumber: "CZ00000042" })]);
    expect(await exceptionService.list(user, { open: false })).toEqual([]);
  });
});
