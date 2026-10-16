import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Internal billing (Phase 6 C) runs for real against the in-memory repositories: which
// consignments are internal, what their jobs' Costs get, the charge on POD, the reversal, the
// month close with its ICZ statements, the statement PDF and the Excel export.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn(), _internalHaulierList: vi.fn(async () => ({ hauliers: [{ id: "00000000-0000-0000-0000-0000000000a2", companyName: "Gama Partner" }] })) },
  shipments: { _internalShipmentBasics: vi.fn(), _internalShipmentCreateRoad: vi.fn() },
  quotes: { salesQuoteGet: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
  warehouse: { _internalWarehouseExceptionsForShipments: vi.fn(async () => ({ exceptions: [] })) },
  invoicing: { invoiceProfileGet: vi.fn(async () => Promise.reject(new Error("no profile"))) },
  sales: { prefGet: vi.fn(async () => Promise.reject(new Error("no prefs"))) },
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
vi.mock("../services/haulier.service", async (orig) => ({ ...(await orig<object>()), haulierService: { get: vi.fn() } }));
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers, shipments } from "~encore/clients";
import ExcelJS from "exceljs";
import { consignmentService, type ConsignmentCreateInput } from "../services/consignment.service";
import { tripService } from "../services/trip.service";
import { internalMonthService } from "../services/internalMonth.service";
import { ltlTrips } from "../services/ltlTrips";
import { rateService } from "../services/rate.service";
import { haulierService } from "../services/haulier.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { departmentPlan } from "../lib/internalRules";
import type { PricedSide, RateLevelResult, RateResponse } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import { COMPANY, CUSTOMER, HAULIER, SHIPMENT, load, manager, outboxOf, resetStore, stop, store, tripRepository, legRepository, user, TX } from "./truckingFakes";

const OCEAN_JOB = "00000000-0000-0000-0000-0000000000d2";

const side = (total: number, over: Partial<PricedSide> = {}): PricedSide => ({
  tariffId: "t",
  tariffName: "Standard FTL",
  tariffVersionId: "00000000-0000-0000-0000-0000000000e1",
  versionNo: 3,
  ownerCustomerId: null,
  ownerName: null,
  currency: "CZK",
  zoneCode: "Z1",
  zoneLabel: "Zone 1",
  bandLabel: "Trip",
  chargeable: { basis: "KG", quantity: 5000, explanation: "" },
  lines: [{ code: "FREIGHT", label: "Freight", qty: 1, unit: "trip", unitPrice: total, amount: total }],
  total,
  totalCzk: total,
  fx: null,
  preferred: false,
  ...over,
});

const rated = (sell: number, buy: number[], internal: PricedSide | { reason: string } | null = null): RateResponse => ({
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
      buy: buy.map((b) => side(b, { ownerCustomerId: HAULIER, ownerName: "Bravo Trans", tariffName: "Bravo FTL" })),
      excluded: [],
      internal,
      marginCzk: null,
      marginPercent: null,
      belowFloor: false,
    } as RateLevelResult,
  ],
});

const input = (over: Partial<ConsignmentCreateInput> = {}): ConsignmentCreateInput => ({
  shipmentId: OCEAN_JOB,
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

const AIR_JOB = "00000000-0000-0000-0000-0000000000d3";
const jobs = (department: string) =>
  vi.mocked(shipments._internalShipmentBasics).mockImplementation(async ({ ids }) => ({
    shipments: ids.map((id) => ({
      id,
      jobNumber: id === OCEAN_JOB ? "CZ00000077" : id === AIR_JOB ? "CZ00000088" : "CZ00000042",
      customerId: CUSTOMER,
      department: id === OCEAN_JOB ? department : id === AIR_JOB ? "Air Department" : "Road Department",
    })),
  }) as never);

/** A delivered internal (or Road) consignment straight in the store. */
async function delivered(over: Partial<TruckingConsignmentRecord> = {}) {
  return consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: `TCZ2026${String(store.consignments.length + 1).padStart(6, "0")}`,
    shipmentId: OCEAN_JOB,
    jobNumber: "CZ00000077",
    customerId: CUSTOMER,
    customerName: "Alfa",
    serviceLevel: "D1",
    status: "DELIVERED",
    pickupDate: "2026-09-29",
    pickup: { ...stop(), postcode: "11000", id: "s1", kind: "PICKUP", actualArrival: null, actualDeparture: null },
    delivery: { ...stop({ city: "Brno" }), postcode: "60200", id: "s2", kind: "DELIVERY", actualArrival: null, actualDeparture: null },
    load: load(),
    pickedUpAt: new Date("2026-09-29T08:00:00Z"),
    deliveredAt: new Date("2026-09-30T08:00:00Z"),
    internal: true,
    department: "Ocean Department",
    ...over,
  });
}

const costs = () => outboxOf("costs").map((r) => r.payload as { sourceRef: string; buying: Record<string, unknown>[]; selling: Record<string, unknown>[] });

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-15T10:00:00Z"));
  vi.mocked(customers.customerGet).mockResolvedValue({ customer: { companyName: "Alfa s.r.o." } } as never);
  jobs("Ocean Department");
  vi.mocked(rateService.rate).mockResolvedValue(rated(12000, [9000], side(7000, { tariffName: "Internal FTL" })));
});

afterEach(() => vi.useRealTimers());

describe("which consignments are internal and what their jobs' Costs get", () => {
  it("a consignment on another department's job is internal: no selling lines", async () => {
    const d = await consignmentService.create(user, input());
    expect(d).toMatchObject({ internal: true, jobNumber: "CZ00000077" });
    expect(store.consignments[0]).toMatchObject({ internal: true, department: "Ocean Department" });
    expect(costs()).toEqual([]);
    // The customer's price is not this consignment's: the detail shows none (the internal price comes from the statement).
    expect(d.sell).toBeNull();
    expect((await consignmentService.get(user, d.id)).sell).toBeNull();
  });

  it("a Road Department job keeps Phase 4: the customer's selling lines", async () => {
    const d = await consignmentService.create(user, input({ shipmentId: SHIPMENT }));
    expect(d.internal).toBe(false);
    expect(d.sell).toMatchObject({ total: 12000 });
    expect(costs()).toEqual([expect.objectContaining({ sourceRef: `trucking:consignment:${d.id}`, selling: [expect.objectContaining({ amount: 12000 })] })]);
  });

  it("an FTL trip of an internal consignment keeps the haulier's cost out of the job (Road: buying lines)", async () => {
    vi.mocked(haulierService.get).mockResolvedValue({ customerId: HAULIER, companyName: "Bravo Trans", status: "ok", issues: [], profile: { adrCapable: true } } as never);
    const internal = await consignmentService.create(user, input());
    await tripService.createFtl(user, { consignmentId: internal.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    expect(costs().filter((p) => p.sourceRef.startsWith("trucking:trip:"))).toEqual([]);
    const road = await consignmentService.create(user, input({ shipmentId: SHIPMENT }));
    await tripService.createFtl(user, { consignmentId: road.id, haulierCustomerId: null, vehicleTypeCode: null, price: { source: "TARIFF" } });
    expect(costs().filter((p) => p.sourceRef.startsWith("trucking:trip:"))).toEqual([expect.objectContaining({ buying: [expect.objectContaining({ amount: 9000, vendor: "Bravo Trans" })] })]);
  });

  it("an LTL trip splits its price over every leg, but pushes shares only to Road jobs", async () => {
    const road = await delivered({ shipmentId: SHIPMENT, internal: false, department: "Road Department", scope: "LTL", deliveredAt: null, status: "PLANNED", chargeableKg: 1000 });
    const ocean = await delivered({ scope: "LTL", deliveredAt: null, status: "PLANNED", chargeableKg: 3000 });
    const trip = await tripRepository.insert(TX, {
      companyId: COMPANY,
      ref: "LCZ2026000009",
      kind: "PICKUP_RUN",
      haulierCustomerId: HAULIER,
      haulierName: "Bravo Trans",
      plannedPickupDate: "2026-10-16",
      buy: { ...side(4000), source: "MANUAL" } as never,
      buyCzk: 4000,
      costJobs: [{ shipmentId: OCEAN_JOB, consignmentId: ocean.id }],
    });
    await legRepository.insertMany(TX, [
      { companyId: COMPANY, consignmentId: road.id, tripId: trip.id, seq: 1, kind: "PICKUP", status: "PLANNED" },
      { companyId: COMPANY, consignmentId: ocean.id, tripId: trip.id, seq: 1, kind: "PICKUP", status: "PLANNED" },
    ]);
    const settled = await ltlTrips.settle(TX as never, user, (await tripRepository.find(COMPANY, trip.id))!);
    expect(store.ltlLegs.map((l) => l.costShareCzk)).toEqual([1000, 3000]);
    expect(settled.costJobs).toEqual([{ shipmentId: SHIPMENT, consignmentId: road.id }]);
    expect(costs()).toEqual([
      expect.objectContaining({ sourceRef: `trucking:trip:${trip.id}:job:${SHIPMENT}`, buying: [expect.objectContaining({ amount: 1000 })] }),
      { sourceRef: `trucking:trip:${trip.id}:job:${OCEAN_JOB}`, buying: [], selling: [] },
    ]);
  });

  it("a department change on edit moves the lines: selling and trip lines out, the internal line in", async () => {
    jobs("Road Department");
    const d = await consignmentService.create(user, input());
    expect(d.internal).toBe(false);
    jobs("Ocean Department");
    store.outbox = [];
    const after = await consignmentService.update(user, d.id, { ...input(), version: store.consignments[0]!.version, reprice: false });
    expect(after.internal).toBe(true);
    expect(costs()).toEqual([
      { sourceRef: `trucking:consignment:${d.id}`, buying: [], selling: [] },
      { sourceRef: `trucking:internal:${d.id}`, buying: [], selling: [] },
    ]);
  });
});

describe("the job's department: followed before the POD, frozen after it (C7, decision 8)", () => {
  it("plans: same, refresh before the POD, fill a missing department on the same side, frozen otherwise", () => {
    const pod = new Date();
    expect(departmentPlan({ department: "Road Department", internal: false, podReceivedAt: null }, "Road Department")).toEqual({ kind: "same" });
    expect(departmentPlan({ department: "Road Department", internal: false, podReceivedAt: null }, "Sea Department")).toEqual({ kind: "refresh", department: "Sea Department", internal: true });
    expect(departmentPlan({ department: "", internal: false, podReceivedAt: pod }, "Road Department")).toEqual({ kind: "fill", department: "Road Department" });
    expect(departmentPlan({ department: "", internal: false, podReceivedAt: pod }, "Sea Department")).toEqual({ kind: "frozen", department: "Sea Department" });
    expect(departmentPlan({ department: "Road Department", internal: false, podReceivedAt: pod }, "Air Department")).toEqual({ kind: "frozen", department: "Air Department" });
  });

  it("before the POD a read of the consignments takes the job's new department and moves its lines", async () => {
    jobs("Road Department");
    const d = await consignmentService.create(user, input());
    expect(d.internal).toBe(false);
    store.outbox = [];
    jobs("Ocean Department");
    const { consignments } = await consignmentService.list(user, {});
    expect(consignments[0]).toMatchObject({ internal: true });
    expect(store.consignments[0]).toMatchObject({ department: "Ocean Department", internal: true });
    expect(costs()).toEqual([
      { sourceRef: `trucking:consignment:${d.id}`, buying: [], selling: [] },
      { sourceRef: `trucking:internal:${d.id}`, buying: [], selling: [] },
    ]);
    expect(store.events.at(-1)).toMatchObject({ kind: "department_changed" });
    // Read again: nothing more to do.
    store.outbox = [];
    await consignmentService.get(user, d.id);
    expect(costs()).toEqual([]);
  });

  it("the POD takes the job's department as it is then: the internal charge is written although nobody read the change", async () => {
    jobs("Road Department");
    const c = await delivered({ internal: false, department: "Road Department" });
    jobs("Ocean Department");
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(store.consignments[0]).toMatchObject({ internal: true, department: "Ocean Department" });
    expect(store.internalCharges).toEqual([expect.objectContaining({ kind: "CHARGE", amount: 7000, department: "Ocean Department" })]);
  });

  it("after the POD a department change is logged once as a warning; billing and the ledger stay", async () => {
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    store.outbox = [];
    jobs("Road Department");
    await consignmentService.get(user, c.id);
    await consignmentService.get(user, c.id);
    const row = store.consignments[0]!;
    expect(row).toMatchObject({ internal: true, department: "Ocean Department" });
    expect(costs()).toEqual([]);
    expect(store.internalCharges).toHaveLength(1);
    expect(store.events.filter((e) => e.kind === "department_change_ignored")).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ facts: expect.objectContaining({ department: "Road Department", frozenDepartment: "Ocean Department" }) }) }),
    ]);
    // An edit after the POD keeps it frozen too.
    await consignmentService.update(user, c.id, { ...input({ pickupDate: row.pickupDate }), pickup: { ...stop(), postcode: "110 00", notes: "ramp 3" }, delivery: stop({ city: "Brno", postcode: "602 00" }), version: row.version, reprice: false }).catch(() => undefined);
    expect(store.consignments[0]).toMatchObject({ internal: true, department: "Ocean Department" });
  });

  it("an LTL job's share sums only its legs that are not internal", async () => {
    const road = await delivered({ shipmentId: SHIPMENT, internal: false, department: "Road Department", scope: "LTL", deliveredAt: null, status: "PLANNED", chargeableKg: 1000 });
    const stale = await delivered({ shipmentId: SHIPMENT, internal: true, department: "Ocean Department", scope: "LTL", deliveredAt: null, status: "PLANNED", chargeableKg: 3000 });
    const trip = await tripRepository.insert(TX, {
      companyId: COMPANY,
      ref: "LCZ2026000010",
      kind: "PICKUP_RUN",
      haulierCustomerId: HAULIER,
      haulierName: "Bravo Trans",
      plannedPickupDate: "2026-10-16",
      buy: { ...side(4000), source: "MANUAL" } as never,
      buyCzk: 4000,
    });
    await legRepository.insertMany(TX, [
      { companyId: COMPANY, consignmentId: road.id, tripId: trip.id, seq: 1, kind: "PICKUP", status: "PLANNED" },
      { companyId: COMPANY, consignmentId: stale.id, tripId: trip.id, seq: 1, kind: "PICKUP", status: "PLANNED" },
    ]);
    await ltlTrips.settle(TX as never, user, (await tripRepository.find(COMPANY, trip.id))!);
    expect(costs()).toEqual([
      expect.objectContaining({ sourceRef: `trucking:trip:${trip.id}:job:${SHIPMENT}`, buying: [expect.objectContaining({ amount: 1000, description: expect.stringContaining("(1 of 2 consignments)") })] }),
    ]);
  });

  it("a manager backfills the departments: a consignment made before they were recorded gets its job's; idempotent", async () => {
    jobs("Road Department");
    const old = await delivered({ shipmentId: SHIPMENT, internal: false, department: "", podReceivedAt: new Date("2026-10-01T08:00:00Z"), status: "POD_RECEIVED" });
    const open = await delivered({ shipmentId: OCEAN_JOB, internal: false, department: "", deliveredAt: null, status: "BOOKED" });
    jobs("Ocean Department");
    await expect(consignmentService.refreshAllDepartments(user)).rejects.toMatchObject({ code: "permission_denied" });
    expect(await consignmentService.refreshAllDepartments(manager)).toEqual({ checked: 2, written: 2 });
    expect(store.consignments.find((c) => c.id === old.id)).toMatchObject({ department: "Road Department", internal: false });
    expect(store.consignments.find((c) => c.id === open.id)).toMatchObject({ department: "Ocean Department", internal: true });
    expect(await consignmentService.refreshAllDepartments(manager)).toEqual({ checked: 1, written: 0 });
  });
});

describe("internal charges", () => {
  it("POD received: the Internal tariff's price in the month of the delivery, and the job's one internal buying line", async () => {
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(rateService.rate).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ includeInternal: true, includeBuy: false, pickupDate: "2026-09-29", serviceLevels: ["D1"], scope: "FTL" }), ["INTERNAL"]);
    expect(store.internalCharges).toEqual([
      expect.objectContaining({ kind: "CHARGE", month: "2026-09", amount: 7000, department: "Ocean Department", consignmentRef: c.ref, notPriced: false, tariffVersionId: "00000000-0000-0000-0000-0000000000e1" }),
    ]);
    expect(costs()).toEqual([
      {
        sourceRef: `trucking:internal:${c.id}`,
        selling: [],
        buying: [expect.objectContaining({ amount: 7000, realAmount: 7000, invoiceNumber: "", vendor: "Trucking (internal)", haulierId: null, currency: "CZK" })],
      },
    ]);
  });

  it("the delivery month closed: the charge goes into the current month as an adjustment saying so", async () => {
    store.closedMonths.push({ id: "m", companyId: COMPANY, month: "2026-09", status: "CLOSED", closedAt: new Date(), closedBy: "x", closedByUserId: null });
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(store.internalCharges).toEqual([expect.objectContaining({ kind: "ADJUSTMENT", month: "2026-10", amount: 7000, description: expect.stringContaining("belongs to 2026-09, which is closed") })]);
  });

  it("a voided POD reverses the charge (in the current month when its own is closed); never edits a closed month", async () => {
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    store.closedMonths.push({ id: "m", companyId: COMPANY, month: "2026-09", status: "CLOSED", closedAt: new Date(), closedBy: "x", closedByUserId: null });
    await consignmentService.voidStamp(manager, c.id, "podReceived", "Wrong consignment");
    const [charge, reversal] = store.internalCharges;
    expect(reversal).toMatchObject({ kind: "ADJUSTMENT", month: "2026-10", amount: -7000, reversesId: charge!.id });
    expect(costs().at(-1)!.buying).toEqual([expect.objectContaining({ amount: 0 })]);
    // Voided twice (after a new POD): only what is not reversed yet is reversed.
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    await consignmentService.voidStamp(manager, c.id, "podReceived", "Again");
    expect(store.internalCharges.filter((x) => x.reversesId)).toHaveLength(2);
  });

  it("no valid Internal tariff: recorded at 0 as Not priced", async () => {
    vi.mocked(rateService.rate).mockResolvedValue(rated(12000, [], { reason: "No internal FTL tariff" }));
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(store.internalCharges).toEqual([expect.objectContaining({ amount: 0, notPriced: true, description: "Not priced: No internal FTL tariff" })]);
  });
});

describe("month close", () => {
  async function chargedSeptember() {
    const a = await delivered();
    await consignmentService.stamp(manager, a.id, "podReceived", null);
    const b = await delivered({ shipmentId: AIR_JOB, department: "Air Department", jobNumber: "CZ00000088" });
    await consignmentService.stamp(manager, b.id, "podReceived", null);
    return { a, b };
  }

  it("a manager closes a past month: one ICZ statement per department, the jobs' lines get its number", async () => {
    const { a } = await chargedSeptember();
    await expect(internalMonthService.close(user, "2026-09")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(internalMonthService.close(manager, "2026-10")).rejects.toMatchObject({ code: "failed_precondition" });
    store.outbox = [];
    const month = await internalMonthService.close(manager, "2026-09");
    expect(month).toMatchObject({
      month: "2026-09",
      status: "CLOSED",
      closedBy: "Jana Nováková",
      statementNumbers: ["ICZ20260001", "ICZ20260002"],
      totals: [
        { department: "Air Department", count: 1, amount: 7000 },
        { department: "Ocean Department", count: 1, amount: 7000 },
      ],
    });
    expect(store.statements.map((s) => [s.number, s.department])).toEqual([
      ["ICZ20260001", "Air Department"],
      ["ICZ20260002", "Ocean Department"],
    ]);
    const line = costs().find((p) => p.sourceRef === `trucking:internal:${a.id}`)!;
    expect(line.buying[0]).toMatchObject({ invoiceNumber: "ICZ20260002", realAmount: 7000 });
    await expect(internalMonthService.close(manager, "2026-09")).rejects.toMatchObject({ message: "2026-09 is already closed" });
    const months = await internalMonthService.list(user);
    expect(months).toHaveLength(13);
    expect(months[0]).toMatchObject({ month: "2026-10", status: "OPEN" });
    expect(months[1]).toMatchObject({ month: "2026-09", status: "CLOSED" });
    expect(await internalMonthService.charges(user, "2026-09")).toHaveLength(2);
  });

  it("numbers a statement in the billed month's year: December 2026 closed in January 2027 is ICZ2026… (decision 12)", async () => {
    vi.setSystemTime(new Date("2026-12-20T10:00:00Z"));
    const c = await delivered({ pickupDate: "2026-12-14", deliveredAt: new Date("2026-12-15T08:00:00Z") });
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    vi.setSystemTime(new Date("2027-01-05T10:00:00Z"));
    expect(await internalMonthService.close(manager, "2026-12")).toMatchObject({ statementNumbers: ["ICZ20260001"] });
  });

  it("is refused while a charge of the month is not priced, until it is reversed", async () => {
    vi.mocked(rateService.rate).mockResolvedValue(rated(12000, [], { reason: "No internal FTL tariff" }));
    const c = await delivered();
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    await expect(internalMonthService.close(manager, "2026-09")).rejects.toMatchObject({ message: expect.stringContaining("not priced") });
    await consignmentService.voidStamp(manager, c.id, "podReceived", "Price it again");
    expect((await internalMonthService.close(manager, "2026-09")).status).toBe("CLOSED");
  });

  it("builds the statement PDF and the month's Excel export (a sheet per department and a summary)", async () => {
    await chargedSeptember();
    await internalMonthService.close(manager, "2026-09");
    const pdf = await internalMonthService.statementPdf(user, "ICZ20260001");
    expect(pdf).toMatchObject({ fileName: "ICZ20260001.pdf", contentType: "application/pdf" });
    expect(Buffer.from(pdf.fileBase64, "base64").subarray(0, 4).toString()).toBe("%PDF");
    await expect(internalMonthService.statementPdf(user, "ICZ20269999")).rejects.toMatchObject({ code: "not_found" });

    const file = await internalMonthService.exportMonth(user, "2026-09");
    expect(file.fileName).toBe("internal-billing-2026-09.xlsx");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(file.fileBase64, "base64") as never);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Summary", "Air Department", "Ocean Department"]);
    expect(wb.getWorksheet("Summary")!.getRow(2).values).toEqual([undefined, "Air Department", 1, 7000, "ICZ20260001"]);
    await expect(internalMonthService.exportMonth(user, "2026-13")).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

