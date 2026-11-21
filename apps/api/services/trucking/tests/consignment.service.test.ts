import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The consignment service runs for real against in-memory repositories (truckingFakes) and
// stand-ins for the rate engine, the settings and the other services.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { customerGet: vi.fn() },
  shipments: { _internalShipmentBasics: vi.fn(), _internalShipmentCreateRoad: vi.fn(), _internalShipmentRoadRetire: vi.fn() },
  quotes: { salesQuoteGet: vi.fn() },
  holidays: { _internalHolidaysCzNational: vi.fn(async () => ({ dates: [] })) },
}));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../../../lib/outbox/serviceIdentity", async () => (await import("./truckingFakes")).serviceIdentityModule);
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
vi.mock("../services/rate.service", () => ({ rateService: { rate: vi.fn() }, eurRate: vi.fn() }));
vi.mock("../services/settings.service", async () => ({ settingsService: { get: vi.fn(async () => (await import("./truckingFakes")).settings()) } }));
vi.mock("../services/truckingOutbox.service", () => ({
  deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })),
  addUnsentReasons: vi.fn(async (_companyId: string, items: unknown[]) => items),
}));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

import { customers, quotes, shipments } from "~encore/clients";
import { consignmentService, countsOf, tariffRefusal, type ConsignmentCreateInput } from "../services/consignment.service";
import { shipmentChangesService } from "../services/shipmentChanges.service";
import { tripService } from "../services/trip.service";
import { APIError } from "../../../lib/tests/encoreApi.stub";
import { eurRate, rateService } from "../services/rate.service";
import { consignmentRepository } from "../repositories/consignment.repository";
import { recordSellingDifferences } from "../services/sellingDifference.service";
import type { ConsignmentListItem, PricedSide, RateLevelResult, RateResponse } from "../interfaces/interfaces";
import type { TruckingConsignmentRecord } from "../schemas/truckingConsignment.schema";
import { COMPANY, CUSTOMER, HAULIER, SERVICE_USER, SHIPMENT, eventsOf, load, manager, outboxOf, resetStore, stop, store, tripRepository, user, TX } from "./truckingFakes";

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
      expect.objectContaining({ customerId: CUSTOMER, pickupPostcode: "11000", deliveryPostcode: "60200", pickupDate: "2026-10-16", plannedDeliveryDate: "2026-10-19", loadType: "Full Load" }),
    );
  });

  it("refuses a job of another customer", async () => {
    vi.mocked(shipments._internalShipmentBasics).mockResolvedValue({ shipments: [{ id: SHIPMENT, jobNumber: "CZ1", customerId: HAULIER }] } as never);
    await expect(consignmentService.create(user, input())).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("refuses a tariff price the engine cannot give, with its reason and what to do instead (User Council T2)", async () => {
    const r = rated(1, []);
    r.results[0]!.sell = { reason: "No zone for postcode 790 01" };
    vi.mocked(rateService.rate).mockResolvedValue(r);
    await expect(consignmentService.create(user, input())).rejects.toMatchObject({ code: "failed_precondition", message: "No zone for postcode 790 01: use Agreed price instead" });
    r.results[0]!.sell = { reason: "No Standard LTL sell list" };
    await expect(consignmentService.create(user, input())).rejects.toMatchObject({
      code: "failed_precondition",
      message: "No Standard LTL sell list: add a Standard sell tariff under Tariffs or use Agreed price",
    });
    expect(store.consignments).toHaveLength(0);
  });

  it("advises Agreed price only where the tariff cannot price, not where a figure is missing (mock council S6-3)", () => {
    for (const reason of [
      "No zone for postcode 790 01 in Standard LTL",
      "Standard LTL has no EXP prices",
      "Standard LTL has no STD price for zone Z3",
      "Above the top band — price on request",
      "Standard LTL has no version valid on 15 Oct 2026",
      "Neither Kovo LTL nor the Standard LTL sell list has a version valid on 15 Oct 2026",
      "No ČNB rate for EUR on 15 Oct 2026",
    ]) {
      expect(tariffRefusal(reason)).toBe(`${reason}: use Agreed price instead`);
    }
    expect(tariffRefusal("Nothing to charge: give the pallet places")).toBe("Nothing to charge: give the pallet places");
    expect(tariffRefusal("Nothing to charge: give the weight or size")).toBe("Nothing to charge: give the weight or size");
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
      validUntil: "2026-10-31",
      roadMargin: { needsApproval: false },
      data: {
        road: { fromPostcode: "110 00", toPostcode: "602 00", scope: "FTL" },
        roadPricing: {
          ratedAt: "2026-10-10T09:00:00.000Z",
          serviceLevel: "D2",
          sell: { tariffId: "t1", tariffName: "Alfa FTL", tariffVersionId: "v1", versionNo: 2, currency: "CZK", total: 15000, totalCzk: 15000 },
          buy: { haulierCustomerId: HAULIER, haulierName: "Bravo", tariffVersionId: "vb", versionNo: 1, currency: "CZK", total: 11000, totalCzk: 11000, preferred: true },
        },
        sellingLines: [
          { chargeCode: "road_freight", description: "Freight", qty: 1, unit: "trip", unitPrice: 15000, amount: 15000, currency: "CZK", tariffRef: "trucking:v1:D2" },
          { chargeCode: "customs", description: "Customs", amount: 900, currency: "CZK" },
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

  it("an Express fixed date quote booked with no level of its own keeps the agreed day given: the level is the quote's", async () => {
    const data = quote().quote.data;
    const fixedQuote = quote({ data: { ...data, roadPricing: { ...data.roadPricing, serviceLevel: "EXP_FIXED" } } });
    vi.mocked(quotes.salesQuoteGet).mockResolvedValue(fixedQuote as never);
    const asQuote = { quoteNumber: "QCZ20261010001", serviceLevel: null, price: { source: "QUOTE" as const } };
    // The day is still asked, once the quote says the level.
    await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ message: "Express fixed date needs the fixed delivery date agreed with the customer" });
    const d = await consignmentService.create(user, input({ ...asQuote, fixedDeliveryDate: "2026-10-21" }));
    expect(d).toMatchObject({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21", promisedFinal: true });
    // A quote of another level counts its own day: the one given is ignored.
    store.consignments = [];
    vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote() as never);
    expect((await consignmentService.create(user, input({ ...asQuote, fixedDeliveryDate: "2026-12-24" }))).promisedDate).toBe("2026-10-20");
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

  describe("only a quote that may price it (decision 10, C9)", () => {
    const asQuote = { quoteNumber: "QCZ20261010001", serviceLevel: null, price: { source: "QUOTE" as const } };
    const refused = async (over: Record<string, unknown>, message: string | RegExp) => {
      vi.mocked(quotes.salesQuoteGet).mockResolvedValueOnce(quote(over) as never);
      await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ message: typeof message === "string" ? message : expect.stringMatching(message) });
    };
    const data = quote().quote.data;

    it("refuses a draft, an expired one, an unapproved low margin, another lane or scope", async () => {
      await refused({ status: "draft", effectiveStatus: "draft" }, /has not been sent to the customer/);
      // A replaced quote was sent - its revision is the one to price from now.
      await refused({ status: "replaced", effectiveStatus: "replaced", data: { ...data, replacedBy: "QCZ20261010001-R1" } }, "Quote QCZ20261010001 was replaced by its revision QCZ20261010001-R1: price from that one");
      await refused({ effectiveStatus: "expired" }, /is no longer valid/);
      await refused({ validUntil: "2026-10-14" }, "Quote QCZ20261010001 is no longer valid (valid until 2026-10-14)");
      await refused({ roadMargin: { needsApproval: true } }, "Quote QCZ20261010001 has a margin below the floor that no manager approved");
      await refused({ data: { ...data, road: { ...data.road, toPostcode: "700 30" } } }, /must have the same pick-up and delivery postcodes/);
      await refused({ data: { ...data, road: { ...data.road, scope: "LTL" } } }, "Quote QCZ20261010001 is priced for LTL, not FTL");
      await refused({ data: { ...data, road: undefined } }, /names no lane/);
      expect(store.consignments).toEqual([]);
    });

    it("a won quote prices it; a second consignment from the same quote is refused, a cancelled one frees it", async () => {
      vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote({ status: "won", effectiveStatus: "won" }) as never);
      const first = await consignmentService.create(user, input(asQuote));
      await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({ code: "already_exists", message: `Quote QCZ20261010001 is already on consignment ${first.ref}: one consignment per quote` });
      // Repricing the same consignment from its own quote is not a second use.
      const again = await consignmentService.update(user, first.id, { ...input(asQuote), version: store.consignments[0]!.version, reprice: true });
      expect(again.sell).toMatchObject({ source: "QUOTE", total: 15000 });
      await consignmentService.cancel(manager, first.id, "Booked twice");
      expect((await consignmentService.create(user, input(asQuote))).sell).toMatchObject({ source: "QUOTE" });
    });

    it("stores the quote as Sales numbers it now, and prices one consignment whatever spelling of it is sent", async () => {
      // The quote has taken its Freight Mode letters; the user typed it without them.
      vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote({ quoteNumber: "QCZROAD20261010001", status: "won", effectiveStatus: "won" }) as never);
      const first = await consignmentService.create(user, input({ ...asQuote, shipmentId: undefined }));
      expect(store.consignments[0]!.quoteNumber).toBe("QCZROAD20261010001");
      // The job made for it names the quote as Sales does now too.
      expect(shipments._internalShipmentCreateRoad).toHaveBeenCalledWith(expect.objectContaining({ quoteNumber: "QCZROAD20261010001" }));
      await expect(consignmentService.create(user, input({ ...asQuote, quoteNumber: "QCZROAD20261010001" }))).rejects.toMatchObject({
        code: "already_exists",
        message: `Quote QCZROAD20261010001 is already on consignment ${first.ref}: one consignment per quote`,
      });
    });

    // T4: the rule holds whatever the consignment is priced by - an agreed price naming the quote
    // takes it as one priced from it does, in any letter form of its number.
    it("refuses an agreed-price consignment naming a quote another consignment is priced from, and the other way round", async () => {
      vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote({ quoteNumber: "QCZROAD20261010001", status: "won", effectiveStatus: "won" }) as never);
      const manual = { price: { source: "MANUAL" as const, total: 400, currency: "EUR" as const, reason: "Agreed by phone" } };
      const fromQuote = await consignmentService.create(user, input(asQuote));
      await expect(consignmentService.create(user, input({ ...manual, quoteNumber: "QCZ20261010001" }))).rejects.toMatchObject({
        code: "already_exists",
        message: `Quote QCZ20261010001 is already on consignment ${fromQuote.ref}: one consignment per quote`,
      });
      await expect(consignmentService.create(user, input({ ...manual, quoteNumber: "QCZROAD20261010001" }))).rejects.toMatchObject({ code: "already_exists" });
      await consignmentService.cancel(manager, fromQuote.id, "Booked twice");

      const agreed = await consignmentService.create(user, input({ ...manual, quoteNumber: "QCZ20261010001" }));
      await expect(consignmentService.create(user, input(asQuote))).rejects.toMatchObject({
        code: "already_exists",
        message: `Quote QCZROAD20261010001 is already on consignment ${agreed.ref}: one consignment per quote`,
      });
      // Nor can another consignment take the quote by an edit; the consignment's own number stays its own.
      const other = await consignmentService.create(user, input(manual));
      const row = () => store.consignments.find((x) => x.id === other.id)!;
      await expect(consignmentService.update(user, other.id, { ...input({ ...manual, quoteNumber: "QCZROAD20261010001" }), version: row().version, reprice: false })).rejects.toMatchObject({ code: "already_exists" });
      const own = store.consignments.find((x) => x.id === agreed.id)!;
      await expect(consignmentService.update(user, agreed.id, { ...input({ ...manual, quoteNumber: "QCZ20261010001", pickupDate: "2026-10-19" }), version: own.version, reprice: false })).resolves.toMatchObject({ pickupDate: "2026-10-19" });
    });

    it("takes back the job it made when the consignment can't be saved (two bookings of one quote at once)", async () => {
      vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote({ status: "won", effectiveStatus: "won" }) as never);
      vi.mocked(consignmentRepository.insert).mockRejectedValueOnce(Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint: "trucking_consignment_quote_unique" } }));
      await expect(consignmentService.create(user, input({ ...asQuote, shipmentId: undefined }))).rejects.toMatchObject({ code: "already_exists", message: "Quote QCZ20261010001 is already on another consignment: one consignment per quote" });
      expect(shipments._internalShipmentRoadRetire).toHaveBeenCalledWith({ shipmentId: SHIPMENT }, { authData: { userID: user.userID, companyID: user.companyID, role: user.role } });
      expect(store.consignments).toEqual([]);
    });

    it("takes the total from the trucking lines as they stand (an amount edited by hand), not the tariff's", async () => {
      const edited = { ...data, sellingLines: [
        { chargeCode: "road_freight", description: "Freight", qty: 1, unit: "trip", unitPrice: 15000, amount: 13500, currency: "CZK", tariffRef: "trucking:v1:D2" },
        { chargeCode: "road_freight", description: "Fuel surcharge", qty: 1, unit: "", unitPrice: 1200, amount: 1200, currency: "CZK", tariffRef: "trucking:v1:D2" },
        { chargeCode: "customs", description: "Customs", amount: 900, currency: "CZK" },
      ] };
      vi.mocked(quotes.salesQuoteGet).mockResolvedValue(quote({ data: edited }) as never);
      const d = await consignmentService.create(user, input(asQuote));
      expect(d.sell).toMatchObject({ total: 14700, totalCzk: 14700, currency: "CZK" });
      expect(d.sell!.lines.map((l) => l.amount)).toEqual([13500, 1200]);
      expect(outboxOf("costs")[0]!.payload).toMatchObject({ selling: [expect.objectContaining({ amount: 13500, currency: "CZK" }), expect.objectContaining({ amount: 1200 })] });
    });

    it("keeps the lines' own currency (EUR at the quote's rate) and refuses mixed currencies", async () => {
      const eur = { ...data, roadPricing: { ...data.roadPricing, sell: { ...data.roadPricing.sell, currency: "EUR", total: 600, totalCzk: 15000 } }, sellingLines: [
        { chargeCode: "road_freight", description: "Freight", qty: 1, unit: "trip", unitPrice: 600, amount: 580, currency: "EUR", tariffRef: "trucking:v1:D2" },
      ] };
      const mixed = { ...data, sellingLines: [...data.sellingLines, { chargeCode: "road_freight", description: "Toll", amount: 40, currency: "EUR", tariffRef: "trucking:v1:D2" }] };
      await refused({ data: mixed }, "Quote QCZ20261010001 sells road transport in CZK and EUR: one currency only");
      vi.mocked(quotes.salesQuoteGet).mockResolvedValueOnce(quote({ data: eur }) as never);
      expect((await consignmentService.create(user, input(asQuote))).sell).toMatchObject({ currency: "EUR", total: 580, totalCzk: 14500 });
    });
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

  it("hands the POD on file to the job when it is stamped", async () => {
    const { c } = await seed(delivered, { trip: true, sent: true });
    store.documents.push({ consignmentId: c.id, kind: "POD", fileName: "pod.pdf", contentType: "application/pdf", sha256: "abc", storageKey: "k/1" } as never);
    await consignmentService.stamp(user, c.id, "podReceived", null);
    expect(outboxOf("pod")).toEqual([expect.objectContaining({ shipmentId: SHIPMENT, payload: expect.objectContaining({ fileName: "pod.pdf", sha256: "abc", storageKey: "k/1" }) })]);
  });

  it("hands over nothing when a manager stamps it with no file", async () => {
    const { c } = await seed(delivered, { trip: true, sent: true });
    await consignmentService.stamp(manager, c.id, "podReceived", null);
    expect(outboxOf("pod")).toEqual([]);
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

  it("a voided stamp takes back the fact of that very stamp; set again, it is a fact of its own", async () => {
    const { c } = await seed({}, { trip: true, sent: true });
    await consignmentService.stamp(user, c.id, "confirmed", null);
    await consignmentService.voidStamp(manager, c.id, "confirmed", "Wrong trip");
    vi.setSystemTime(new Date("2026-10-15T11:30:00Z"));
    await consignmentService.stamp(user, c.id, "confirmed", null);
    expect(outboxOf("stamp").map((r) => r.payload)).toEqual([
      { stamp: "confirmed", at: "2026-10-15T10:00:00.000Z" },
      { stamp: "confirmed", at: "2026-10-15T10:00:00.000Z", voided: true },
      { stamp: "confirmed", at: "2026-10-15T11:30:00.000Z" },
    ]);
  });

  // Two PODs of one job at the same moment each wrote their own consignment and then, in
  // settleBilling, locked all of the job's - each waiting for the other's: a deadlock. The job's
  // consignments are locked first now, in every transaction that stamps, voids or cancels.
  it("locks the job's consignments before it writes the stamp, the void or the cancel", async () => {
    const a = await seed(delivered, { trip: true, sent: true });
    await seed(delivered);
    const lockedBefore = (written: (values: Record<string, unknown>) => boolean) => {
      const writes = vi.mocked(consignmentRepository.update).mock;
      const at = writes.calls.findIndex((call) => written(call[3] as Record<string, unknown>));
      const locks = vi.mocked(consignmentRepository.forShipmentLocked).mock;
      return at >= 0 && locks.calls.some((call, i) => call[2] === SHIPMENT && locks.invocationCallOrder[i]! < writes.invocationCallOrder[at]!);
    };
    await consignmentService.stamp(manager, a.c.id, "podReceived", null);
    expect(lockedBefore((v) => !!v.podReceivedAt)).toBe(true);
    vi.clearAllMocks();
    await consignmentService.voidStamp(manager, a.c.id, "podReceived", "Wrong file");
    expect(lockedBefore((v) => "podReceivedAt" in v && v.podReceivedAt === null)).toBe(true);
    vi.clearAllMocks();
    // A plain stamp too: in one transaction the haulier's POD stamps the pick-up and delivery first.
    const open = await seed({}, { trip: true, sent: true });
    await consignmentService.stamp(user, open.c.id, "pickedUp", null);
    expect(lockedBefore((v) => !!v.pickedUpAt)).toBe(true);
    vi.clearAllMocks();
    await consignmentService.cancel(manager, (await seed()).c.id, "Not needed");
    expect(lockedBefore((v) => !!v.cancelledAt)).toBe(true);
  });

  it("a voided POD takes its fact off the job's timeline (the file stays in its Documents); a corrected one is a new fact", async () => {
    const { c } = await seed(delivered, { trip: true, sent: true });
    store.documents.push({ consignmentId: c.id, kind: "POD", fileName: "pod.pdf", contentType: "application/pdf", sha256: "abc", storageKey: "k/1" } as never);
    await consignmentService.stamp(user, c.id, "podReceived", null);
    await consignmentService.voidStamp(manager, c.id, "podReceived", "Wrong file");
    vi.setSystemTime(new Date("2026-10-15T11:30:00Z"));
    await consignmentService.stamp(user, c.id, "podReceived", null);
    expect(outboxOf("pod").map((r) => r.payload)).toEqual([
      expect.objectContaining({ sha256: "abc", stampedAt: "2026-10-15T10:00:00.000Z" }),
      { stampedAt: "2026-10-15T10:00:00.000Z", voided: true },
      expect.objectContaining({ sha256: "abc", stampedAt: "2026-10-15T11:30:00.000Z" }),
    ]);
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
      { sourceRef: `trucking:consignment:${c.id}`, buying: [], selling: [], differenceLabel: `${c.ref} · Price change after invoice` },
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

describe("buy: real once a haulier invoice is approved", () => {
  it("shows the estimate until an approved invoice covers the trip, then its real cost and number (as the Reports count it)", async () => {
    const { c, trip } = await seed({}, { trip: true, sent: true });
    expect(await consignmentService.get(user, c.id)).toMatchObject({ buyCzk: 9000, buyReal: false, buyInvoiceNumbers: [], marginCzk: 3000 });
    store.realCosts = [{ legId: "leg-1", consignmentId: c.id, tripId: trip!.id, realCzk: 7500.5, invoiceNumber: "TEST-PINV-001" }];
    const real = { buyCzk: 7500.5, buyReal: true, buyInvoiceNumbers: ["TEST-PINV-001"], marginCzk: 4499.5 };
    expect(await consignmentService.get(user, c.id)).toMatchObject(real);
    expect((await consignmentService.list(user, {})).consignments[0]).toMatchObject(real);
  });

  it("ignores an invoice of a trip the consignment is no longer on", async () => {
    const { c } = await seed({}, { trip: true, sent: true });
    store.realCosts = [{ legId: "leg-1", consignmentId: c.id, tripId: "old-trip", realCzk: 100, invoiceNumber: "TEST-PINV-002" }];
    expect(await consignmentService.get(user, c.id)).toMatchObject({ buyCzk: 9000, buyReal: false, buyInvoiceNumbers: [] });
  });

  it("judges a margin approval with the real cost", async () => {
    const { c, trip } = await seed({}, { trip: true, sent: true });
    store.realCosts = [{ legId: "leg-1", consignmentId: c.id, tripId: trip!.id, realCzk: 11900, invoiceNumber: "TEST-PINV-003" }];
    const d = await consignmentService.approveMargin(manager, c.id, "Haulier charged waiting time");
    expect(d).toMatchObject({ buyCzk: 11900, belowFloor: true, marginApproved: true, marginApproval: { marginCzk: 100 } });
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

  // The link was set at the send to run 30 days past the planned pick-up and only a new send moved
  // it: a pick-up moved later left the haulier with a link that ran out before the POD was due.
  it("a pick-up moved later carries the haulier's link as far, by the send's rule; one moved earlier keeps it", async () => {
    const { c, trip } = await seed({}, { trip: true, sent: true });
    const sent = { id: "l1", companyId: COMPANY, tripId: trip!.id, tokenHash: "h", revokedAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
    store.links.push({ ...sent, expiresAt: new Date("2026-11-15T22:59:59Z") } as never);
    await consignmentService.update(user, c.id, fields({ pickupDate: "2026-10-30" }));
    expect(store.trips[0]!.plannedPickupDate).toBe("2026-10-30");
    expect(store.links[0]!).toMatchObject({ tokenHash: "h", revokedAt: null });
    expect(store.links[0]!.expiresAt.toISOString()).toBe("2026-11-29T22:59:59.000Z");
    expect(eventsOf("consignment_updated").at(-1)!.payload).toMatchObject({
      summary: expect.stringContaining("the haulier's link is valid until"),
      facts: { linkExpiresAt: "2026-11-29T22:59:59.000Z" },
    });
    // Moved back: the link is never shortened.
    await consignmentService.update(user, c.id, fields({ version: 2, pickupDate: "2026-10-20" }));
    expect(store.trips[0]!.plannedPickupDate).toBe("2026-10-20");
    expect(store.links[0]!.expiresAt.toISOString()).toBe("2026-11-29T22:59:59.000Z");
    expect(eventsOf("consignment_updated").at(-1)!.payload).not.toHaveProperty("facts");
  });
});

// Express fixed date had no field for the agreed day: nothing was promised, so no "Delivery today"
// tile, no lateness and no Planned Delivery on the job (User Council T4, Q13).
describe("Express fixed date: the day agreed at booking is the promised date", () => {
  const agreed = { source: "MANUAL" as const, total: 14500, currency: "CZK" as const, reason: "Agreed with the customer" };
  const fixed = (over: Partial<ConsignmentCreateInput> = {}) => input({ serviceLevel: "EXP_FIXED", fixedDeliveryDate: "2026-10-21", price: agreed, ...over });
  const fields = (over: Record<string, unknown> = {}) => ({ ...fixed(), version: 1, reprice: false, ...over });

  it("is required, a real date and not before the pick-up - refused before anything is priced or stored", async () => {
    await expect(consignmentService.create(user, fixed({ fixedDeliveryDate: null }))).rejects.toMatchObject({
      code: "invalid_argument",
      message: "Express fixed date needs the fixed delivery date agreed with the customer",
    });
    await expect(consignmentService.create(user, fixed({ fixedDeliveryDate: "2026-02-30" }))).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(consignmentService.create(user, fixed({ fixedDeliveryDate: "2026-10-15" }))).rejects.toMatchObject({
      message: "The fixed delivery date cannot be before the pick-up date",
    });
    expect(rateService.rate).not.toHaveBeenCalled();
    expect(shipments._internalShipmentCreateRoad).not.toHaveBeenCalled();
    expect(store.consignments).toHaveLength(0);
  });

  it("is stored as the promised date (final, also for groupage) and the job's Planned Delivery hears it at once", async () => {
    const d = await consignmentService.create(user, fixed());
    expect(d).toMatchObject({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21", promisedFinal: true });
    expect(outboxOf("planned").map((o) => o.payload)).toEqual([{ plannedDeliveryDate: "2026-10-21" }]);
    const ltl = await consignmentService.create(user, fixed({ scope: "LTL", lastMile: "OWN_RUN" }));
    expect(ltl).toMatchObject({ promisedDate: "2026-10-21", promisedFinal: true });
  });

  it("priced from the tariff too; a new Road job is made with it as its Planned Delivery", async () => {
    const r = rated(12000, [9000]);
    Object.assign(r.results[0]!, { serviceLevel: "EXP_FIXED", promisedDate: null });
    vi.mocked(rateService.rate).mockResolvedValue(r);
    const d = await consignmentService.create(user, fixed({ shipmentId: null, price: { source: "TARIFF" } }));
    expect(d.promisedDate).toBe("2026-10-21");
    expect(shipments._internalShipmentCreateRoad).toHaveBeenCalledWith(expect.objectContaining({ plannedDeliveryDate: "2026-10-21" }));
    expect(outboxOf("planned")).toHaveLength(0);
  });

  it("is ignored for the other levels, which count their own date", async () => {
    const d = await consignmentService.create(user, input({ fixedDeliveryDate: "2026-12-24", price: agreed }));
    expect(d.promisedDate).toBe("2026-10-19");
    expect(outboxOf("planned")).toHaveLength(0);
  });

  it("puts it in the Delivery today tile on its day", async () => {
    await consignmentService.create(user, fixed({ pickupDate: "2026-10-15", fixedDeliveryDate: "2026-10-15" }));
    const all = await consignmentService.list(user, {});
    expect(all.counts.deliveryToday).toBe(1);
    expect((await consignmentService.list(user, { view: "deliveryToday" })).consignments).toHaveLength(1);
  });

  it("is edited like the other fields: a new day is promised and told to the job, a missing one refused", async () => {
    const { c } = await seed({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21" });
    await consignmentService.update(user, c.id, fields({ fixedDeliveryDate: "2026-10-23" }));
    expect(row(c.id).promisedDate).toBe("2026-10-23");
    expect(outboxOf("planned").map((o) => o.payload)).toEqual([{ plannedDeliveryDate: "2026-10-23" }]);
    await expect(consignmentService.update(user, c.id, fields({ version: 2, fixedDeliveryDate: null }))).rejects.toMatchObject({ code: "invalid_argument" });
    // Another level counts its own date again, and the job, which held the fixed day, learns it with no trip yet.
    await consignmentService.update(user, c.id, fields({ version: 2, serviceLevel: "D1", fixedDeliveryDate: null }));
    expect(row(c.id).promisedDate).toBe("2026-10-19");
    expect(outboxOf("planned").map((o) => o.payload)).toEqual([{ plannedDeliveryDate: "2026-10-23" }, { plannedDeliveryDate: "2026-10-19" }]);
    // From one counted level to another nothing is pushed before a trip, as before.
    await consignmentService.update(user, c.id, fields({ version: 3, serviceLevel: "D2", fixedDeliveryDate: null }));
    expect(row(c.id).promisedDate).toBe("2026-10-20");
    expect(outboxOf("planned")).toHaveLength(2);
  });

  it("after the pick-up it may not change, and an older one without a date still takes notes", async () => {
    const { c } = await seed({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21", pickedUpAt: new Date(), status: "PICKED_UP" });
    const delivery = stop({ city: "Brno", postcode: "602 00", notes: "Gate 4" });
    expect((await consignmentService.update(user, c.id, fields({ delivery, fixedDeliveryDate: "2026-10-21" }))).delivery.notes).toBe("Gate 4");
    await expect(consignmentService.update(user, c.id, fields({ version: 2, delivery, fixedDeliveryDate: "2026-10-23" }))).rejects.toMatchObject({
      code: "failed_precondition",
      message: "After the pick-up only notes and references can change",
    });
    const old = await seed({ serviceLevel: "EXP_FIXED", promisedDate: null, pickedUpAt: new Date(), status: "PICKED_UP" });
    const d = await consignmentService.update(user, old.c.id, fields({ delivery, fixedDeliveryDate: null }));
    expect(d.delivery.notes).toBe("Gate 4");
  });

  it("keeps the agreed day when the job's pick-up date moves in Shipments", async () => {
    const { c } = await seed({ serviceLevel: "EXP_FIXED", promisedDate: "2026-10-21" });
    await expect(shipmentChangesService.follow(user, SHIPMENT, { pickupDate: { from: "2026-10-16", to: "2026-10-19" } })).resolves.toEqual({ kept: [] });
    expect(row(c.id)).toMatchObject({ pickupDate: "2026-10-19", promisedDate: "2026-10-21" });
  });

  // An older one, booked before the agreed day was asked, has none (mock council R24, X-4).
  it("lets an older one without its day be edited, priced again and moved from Shipments, and names it under Needs attention", async () => {
    const { c } = await seed({ serviceLevel: "EXP_FIXED", promisedDate: null });
    const delivery = stop({ city: "Brno", postcode: "602 00", notes: "Gate 4" });
    expect((await consignmentService.update(user, c.id, fields({ delivery, fixedDeliveryDate: null }))).delivery.notes).toBe("Gate 4");
    expect(row(c.id).promisedDate).toBeNull();
    // Priced again from the tariff: still no day asked for.
    const r = rated(12000, [9000]);
    Object.assign(r.results[0]!, { serviceLevel: "EXP_FIXED", promisedDate: null });
    vi.mocked(rateService.rate).mockResolvedValue(r);
    await consignmentService.update(user, c.id, fields({ version: 2, delivery, fixedDeliveryDate: null, price: { source: "TARIFF" }, reprice: true }));
    expect(row(c.id).promisedDate).toBeNull();
    // The pick-up date pushed from the job is taken, not kept back for the missing day.
    await expect(shipmentChangesService.follow(user, SHIPMENT, { pickupDate: { from: "2026-10-16", to: "2026-10-19" } })).resolves.toEqual({ kept: [] });
    expect(row(c.id)).toMatchObject({ pickupDate: "2026-10-19", promisedDate: null });
    const [item] = (await consignmentService.list(user, {})).consignments;
    expect(item!.needsAttention).toContain("Express fixed date without the agreed delivery day: give it in Edit");
    // A day given is checked, and once given it is required as for any other.
    await expect(consignmentService.update(user, c.id, fields({ version: row(c.id).version, delivery, pickupDate: "2026-10-19", fixedDeliveryDate: "2026-10-16" }))).rejects.toMatchObject({
      message: "The fixed delivery date cannot be before the pick-up date",
    });
    await consignmentService.update(user, c.id, fields({ version: row(c.id).version, delivery, pickupDate: "2026-10-19", fixedDeliveryDate: "2026-10-22" }));
    expect(row(c.id).promisedDate).toBe("2026-10-22");
    expect((await consignmentService.list(user, {})).consignments[0]!.needsAttention).not.toContain("Express fixed date without the agreed delivery day: give it in Edit");
    await expect(consignmentService.update(user, c.id, fields({ version: row(c.id).version, delivery, pickupDate: "2026-10-19", fixedDeliveryDate: null }))).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("still asks the day of one moved to Express fixed date", async () => {
    const { c } = await seed({ serviceLevel: "D1", promisedDate: "2026-10-19" });
    await expect(consignmentService.update(user, c.id, fields({ fixedDeliveryDate: null }))).rejects.toMatchObject({
      message: "Express fixed date needs the fixed delivery date agreed with the customer",
    });
  });
});

// F6: a person moved the job's pick-up date or changed its plate in Shipments: its consignment takes
// it through Trucking's own edit, unless it holds its own value or may not change any more.
describe("a job's change in Shipments", () => {
  const moved = { pickupDate: { from: "2026-10-16", to: "2026-10-30" } };

  it("moves the consignment's pick-up date and its trip's planned pick-up, as an edit in Trucking would", async () => {
    const { c } = await seed({}, { trip: true });
    await expect(shipmentChangesService.follow(user, SHIPMENT, moved)).resolves.toEqual({ kept: [] });
    expect(row(c.id).pickupDate).toBe("2026-10-30");
    expect(store.trips[0]!.plannedPickupDate).toBe("2026-10-30");
    expect(eventsOf("consignment_updated").at(-1)).toMatchObject({ byUserId: user.userID });
    // Sent again (a retry): it holds the date already, nothing more is written.
    const version = row(c.id).version;
    await expect(shipmentChangesService.follow(user, SHIPMENT, moved)).resolves.toEqual({ kept: [] });
    expect(row(c.id).version).toBe(version);
  });

  it("keeps a date changed in Trucking since, and one picked up already - saying why, without failing", async () => {
    const { c } = await seed({ pickupDate: "2026-10-20" });
    const picked = await seed({ pickedUpAt: new Date(), status: "PICKED_UP" });
    const { kept } = await shipmentChangesService.follow(user, SHIPMENT, moved);
    expect(kept).toHaveLength(2);
    expect(kept).toEqual(
      expect.arrayContaining([`${c.ref} pick-up date: its pick-up date was changed in Trucking (2026-10-20)`, `${picked.c.ref} pick-up date: the cargo is picked up already`]),
    );
    expect(row(c.id).pickupDate).toBe("2026-10-20");
    expect(row(picked.c.id).pickupDate).toBe("2026-10-16");
  });

  it("keeps the date when Trucking's own edit refuses it (its sentence kept), and lets a conflict be tried again", async () => {
    const { c } = await seed();
    const follow = vi.spyOn(consignmentService, "followJobPickupDate").mockRejectedValueOnce(APIError.failedPrecondition("A leg of the groupage is on its way already"));
    try {
      await expect(shipmentChangesService.follow(user, SHIPMENT, moved)).resolves.toEqual({ kept: [`${c.ref} pick-up date: A leg of the groupage is on its way already`] });
      follow.mockRejectedValueOnce(APIError.aborted("The consignment was changed meanwhile"));
      await expect(shipmentChangesService.follow(user, SHIPMENT, moved)).rejects.toMatchObject({ code: "aborted" });
    } finally {
      follow.mockRestore();
    }
  });

  // The trip takes it through its own edit (tripService.update, tested with the trips).
  it("sets an FTL trip's tractor plate that still has the job's old one, as Trucking writes plates", async () => {
    const { trip } = await seed({}, { trip: true });
    const follow = vi.spyOn(tripService, "followJobPlate").mockResolvedValue();
    try {
      await expect(shipmentChangesService.follow(user, SHIPMENT, { plateNumber: { from: "", to: "4cd 5678" } })).resolves.toEqual({ kept: [] });
      expect(follow).toHaveBeenCalledWith(user, expect.objectContaining({ id: trip!.id }), "4CD5678");
    } finally {
      follow.mockRestore();
    }
  });
});

describe("the job was deleted in Shipments", () => {
  it("cancels the open consignments, keeps the picked-up ones with an event, cancels what is still owed", async () => {
    const open = await seed({}, { trip: true, sent: true });
    const picked = await seed({ pickedUpAt: new Date(), status: "PICKED_UP" });
    store.outbox.push({ shipmentId: SHIPMENT, kind: "planned", status: "pending" });
    await consignmentService.retireShipment(SHIPMENT, COMPANY);
    // What the cancellation owes (re-settled trips, cost lines) is written as the service identity, never as nobody.
    const owed = store.outbox.filter((r) => r.kind === "costs");
    expect(owed.length).toBeGreaterThan(0);
    expect(owed.every((r) => r.actingUserId === SERVICE_USER && r.actingRole === "user")).toBe(true);
    expect(row(open.c.id).status).toBe("CANCELLED");
    expect(row(picked.c.id).status).toBe("PICKED_UP");
    expect(eventsOf("shipment_deleted")).toEqual([expect.objectContaining({ consignmentId: picked.c.id })]);
    expect(store.outbox.every((r) => r.status === "cancelled")).toBe(true);
    // Idempotent: a second delivery of the message changes nothing more.
    await consignmentService.retireShipment(SHIPMENT, COMPANY);
    expect(eventsOf("consignment_cancelled")).toHaveLength(1);
    expect(eventsOf("shipment_deleted")).toHaveLength(1);
  });
});

describe("list", () => {
  it("counts and filters the worklist views", async () => {
    await seed({ pickupDate: "2026-10-15" });
    // POD missing = delivered more than 2 working days ago: Monday's delivery is missing on Thursday, Wednesday's is not yet.
    await seed({ status: "DELIVERED", pickedUpAt: new Date("2026-10-12T06:00:00Z"), deliveredAt: new Date("2026-10-12T08:00:00Z") });
    await seed({ status: "DELIVERED", pickedUpAt: new Date("2026-10-14T06:00:00Z"), deliveredAt: new Date("2026-10-14T08:00:00Z") });
    await seed({ status: "READY_TO_BILL" });
    const all = await consignmentService.list(user, {});
    expect(all.counts).toMatchObject({ pickupToday: 1, podMissing: 1, readyToBill: 1, openFtlWithoutHaulier: 1, attention: 2, avizacePending: 0, openExceptions: 0 });
    expect((await consignmentService.list(user, { view: "pickupToday" })).consignments).toHaveLength(1);
    expect((await consignmentService.list(user, { view: "podMissing" })).consignments.map((c) => c.deliveryCity)).toEqual(["Brno"]);
    expect((await consignmentService.list(user, { search: "brno" })).consignments).toHaveLength(4);
    expect((await consignmentService.list(user, { search: "nothing" })).consignments).toHaveLength(0);
  });

  it("says when more consignments match than the newest 1000 it read", async () => {
    await seed({});
    await seed({});
    await seed({ status: "READY_TO_BILL" });
    expect(await consignmentService.list(user, {})).toMatchObject({ listed: 3, total: 3, truncated: false });
    expect(await consignmentService.list(user, { status: "READY_TO_BILL" })).toMatchObject({ listed: 1, total: 1, truncated: false });
    // A view is worked out over what was read: still the same read, whatever the view keeps.
    expect(await consignmentService.list(user, { view: "readyToBill" })).toMatchObject({ listed: 3, total: 3, truncated: false });
    vi.mocked(consignmentRepository.count).mockResolvedValueOnce(1400);
    expect(await consignmentService.list(user, {})).toMatchObject({ listed: 3, total: 1400, truncated: true });
  });

  it("finds a consignment by its job's reference whatever the letters: the copy keeps what it was given, the job's letters follow its Freight Mode", async () => {
    await seed({});
    await seed({ jobNumber: "CZROAD00000077" });
    const found = async (search: string) => (await consignmentService.list(user, { search })).consignments.map((c) => c.jobNumber);
    // The consignment that copied CZ00000042 by the job's reference now, and while it is typed.
    expect(await found("CZROAD00000042")).toEqual(["CZ00000042"]);
    expect(await found("czroad0000004")).toEqual(["CZ00000042"]);
    // And the other way: one that copied the letters by the plain reference.
    expect(await found("CZ00000077")).toEqual(["CZROAD00000077"]);
    expect(await found("CZROAD00000043")).toEqual([]);
    // Letters that are no job's (a quote's CZQ…) find nothing by the number.
    expect(await found("CZQ00000042")).toEqual([]);
  });

  it("opens exactly the booked FTL consignments the 'Open FTL without haulier' tile counts", async () => {
    const ftl = await seed({});
    await seed({ scope: "LTL" });
    await seed({}, { trip: true });
    const { consignments, counts } = await consignmentService.list(user, { view: "openFtl" });
    expect(consignments.map((c) => c.id)).toEqual([ftl.c.id]);
    expect(counts.openFtlWithoutHaulier).toBe(consignments.length);
  });

  it("counts and opens the 'Pick-up date passed' tile: the day gone and no truck ordered (mock council R23)", async () => {
    const booked = await seed({ pickupDate: "2026-10-14" });
    const planned = await seed({ pickupDate: "2026-10-13" }, { trip: true });
    // Ordered (the truck is on its way, its pick-up not stamped), today's, and a cancelled one: not in it.
    await seed({ pickupDate: "2026-10-14" }, { trip: true, sent: true });
    await seed({ pickupDate: "2026-10-15" });
    await seed({ pickupDate: "2026-10-12", status: "CANCELLED", cancelledAt: new Date("2026-10-12T08:00:00Z") });
    // Groupage the customer brings to our warehouse gets no pick-up truck: ordering one cannot clear it.
    // One we collect does.
    await seed({ scope: "LTL", selfDelivered: true, lastMile: "OWN_RUN", pickupDate: "2026-10-13" });
    const collected = await seed({ scope: "LTL", selfDelivered: false, lastMile: "OWN_RUN", pickupDate: "2026-10-13" });
    const { consignments, counts } = await consignmentService.list(user, { view: "pickupPassed" });
    expect(consignments.map((c) => c.id).sort()).toEqual([booked.c.id, planned.c.id, collected.c.id].sort());
    expect(counts.pickupPassed).toBe(3);
  });

  it("the 'Pick-up date passed' count leaves out a self-delivered groupage consignment", () => {
    const item = { id: "c1", scope: "LTL", status: "BOOKED", pickupDate: "2026-10-14", needsAttention: [] } as unknown as ConsignmentListItem;
    const flags = { podMissing: new Set<string>(), avizacePending: new Set<string>(), selfDelivered: new Set(["c1"]) };
    expect(countsOf([item], "2026-10-15", flags).pickupPassed).toBe(0);
    expect(countsOf([item], "2026-10-15", { ...flags, selfDelivered: new Set<string>() }).pickupPassed).toBe(1);
  });
  it("gives each row its stamp times and the trip's truck and driver, so the job's Trucking tab needs no call per card", async () => {
    const { c, trip } = await seed({ status: "PICKED_UP", pickedUpAt: new Date("2026-10-15T06:00:00Z") }, { trip: true, sent: true });
    await tripRepository.update(TX as never, COMPANY, trip!.id, { tractorPlate: "1AB2345", driverName: "Petr Novák" } as never);
    const [item] = (await consignmentService.list(user, { shipmentId: SHIPMENT })).consignments.filter((x) => x.id === c.id);
    expect(item).toMatchObject({ pickedUpAt: "2026-10-15T06:00:00.000Z", deliveredAt: null, tractorPlate: "1AB2345", trailerPlate: "", driverName: "Petr Novák", driverPhone: "" });
  });
});

describe("a price change after the customer invoice (decision 9, C8)", () => {
  it("records each difference line Invoicing added once: an event and a notice in Needs attention until a manager clears it", async () => {
    const { c } = await seed();
    const diff = { sourceRef: `trucking:consignment:${c.id}:diff:1`, currency: "CZK", amount: 2240 };
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [diff])).toBe(1);
    // The push retried (or the next push answering the same line): nothing more.
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [diff])).toBe(0);
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [])).toBe(0);
    expect(eventsOf("selling_difference_pushed")).toEqual([
      expect.objectContaining({ payload: expect.objectContaining({ summary: 'The customer invoice was issued already: the price change of +2,240 CZK was added to job CZ00000042 as "Price change after invoice"' }) }),
    ]);
    const d = await consignmentService.get(user, c.id);
    expect(d.needsAttention).toContain("Price change after invoice: +2,240 CZK added to job CZ00000042 as its own line — invoice it");
    expect((await consignmentService.list(user, { view: "attention" })).consignments.map((x) => x.id)).toEqual([c.id]);
    await consignmentService.clearNotice(manager, c.id, `${diff.sourceRef}|CZK`, "Invoiced on 2026100123");
    expect((await consignmentService.get(user, c.id)).needsAttention.some((r) => r.startsWith("Price change after invoice"))).toBe(false);
    // The next reprice: Invoicing answers every difference line of the set again. Only the new one is
    // noticed; the cleared one (invoiced already) never comes back.
    const second = { sourceRef: `trucking:consignment:${c.id}:diff:2`, currency: "CZK", amount: 500 };
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [diff, second])).toBe(1);
    expect((await consignmentService.get(user, c.id)).needsAttention.filter((r) => r.startsWith("Price change after invoice"))).toEqual([
      "Price change after invoice: +500 CZK added to job CZ00000042 as its own line — invoice it",
    ]);
    expect(eventsOf("selling_difference_pushed")).toHaveLength(2);
  });

  it("one notice per set and currency: a newer difference line - the price changed again, or what a credit note left owed - replaces the earlier one's, so they never add up to more than is owed", async () => {
    const { c } = await seed();
    const ref = `trucking:consignment:${c.id}`;
    const attention = async () => (await consignmentService.get(user, c.id)).needsAttention.filter((r) => r.startsWith("Price change after invoice"));
    // 1000 → 950: a credit of 50 owed; an EUR line and another set's line beside it.
    await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [
      { sourceRef: `${ref}:diff:1`, currency: "CZK", amount: -50 },
      { sourceRef: `${ref}:diff:1`, currency: "EUR", amount: 20 },
      { sourceRef: `trucking:exception:${c.id}:diff:1`, currency: "CZK", amount: 300 },
    ]);
    // 950 → 900 before the credit was given: Invoicing answers one line of −100 in place of the −50.
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [
      { sourceRef: `${ref}:diff:1`, currency: "EUR", amount: 20 },
      { sourceRef: `${ref}:diff:2`, currency: "CZK", amount: -100 },
    ])).toBe(1);
    expect(await attention()).toEqual([
      "Price change after invoice: +20 EUR added to job CZ00000042 as its own line — invoice it",
      "Price change after invoice: +300 CZK added to job CZ00000042 as its own line — invoice it",
      "Price change after invoice: −100 CZK on job CZ00000042 — a credit is owed: give it on a credit note of the invoice",
    ]);
    // A credit note gave 60 of it: the line comes down to −60, and the −40 left owed is a line of its own.
    await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [
      { sourceRef: `${ref}:diff:3`, currency: "CZK", amount: -40 },
      { sourceRef: `${ref}:diff:2`, currency: "CZK", amount: -60 },
    ]);
    expect((await attention()).filter((r) => r.includes(" CZK on job"))).toEqual([
      "Price change after invoice: −40 CZK on job CZ00000042 — a credit is owed: give it on a credit note of the invoice",
    ]);
    // Every line is recorded once all the same; a replaced notice never comes back.
    expect(eventsOf("selling_difference_pushed")).toHaveLength(5);
    expect(await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [{ sourceRef: `${ref}:diff:2`, currency: "CZK", amount: -60 }])).toBe(0);
  });

  it("a cancel after invoicing: the negative difference keeps the cancelled consignment in Needs attention", async () => {
    const { c } = await seed();
    await consignmentService.cancel(manager, c.id, "Customer cancelled");
    expect(outboxOf("costs")[0]!.payload).toMatchObject({ selling: [], differenceLabel: `${c.ref} · Price change after invoice` });
    await recordSellingDifferences({ companyId: COMPANY, consignmentId: c.id }, [{ sourceRef: `trucking:consignment:${c.id}:diff:1`, currency: "CZK", amount: -12000 }]);
    const { consignments, counts } = await consignmentService.list(user, { view: "attention" });
    // A credit owed, not a charge: the job stays Invoiced, and a credit note of the invoice gives it (Y1 / P1).
    expect(consignments.map((x) => [x.status, x.needsAttention])).toEqual([["CANCELLED", ["Price change after invoice: −12,000 CZK on job CZ00000042 — a credit is owed: give it on a credit note of the invoice"]]]);
    expect(counts.attention).toBe(1);
  });
});
