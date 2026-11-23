import { beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  get: vi.fn(),
  listByService: vi.fn(),
  boxShipments: vi.fn(),
  boxShipmentsOf: vi.fn(),
  setDetails: vi.fn(),
  shipmentsToLink: vi.fn(),
  sailingsOf: vi.fn(),
  link: vi.fn(),
  move: vi.fn(),
}));
const boxCosts = vi.hoisted(() => {
  class BoxCostsChangedMeanwhile extends Error {
    constructor(readonly by: string) {
      super("box costs changed meanwhile");
    }
  }
  return { BoxCostsChangedMeanwhile, repo: { list: vi.fn(), listOf: vi.fn(), save: vi.fn(), changes: vi.fn(), costedContainers: vi.fn(), recordSailingChanges: vi.fn() } };
});
const services = vi.hoisted(() => ({ get: vi.fn(), requireOpen: vi.fn(), planningVolumePct: vi.fn() }));
const fx = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
const invoicing = vi.hoisted(() => ({ _internalCoLoadingMoney: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ fx, invoicing }));
vi.mock("../../lib/userName", () => ({ userNameOf: async () => "Jana Nová" }));
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: repo }));
vi.mock("../../repositories/coLoadingBoxCost.repository", () => ({ coLoadingBoxCostRepository: boxCosts.repo, BoxCostsChangedMeanwhile: boxCosts.BoxCostsChangedMeanwhile }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));

import { coLoadingSailingService as service } from "../../services/coLoadingSailing.service";

// The promises of a sailing's Earnings (Council Review 7, K18), against stand-ins for the database
// and the other services: who is asked what, what a failed read looks like, who may change what,
// and that the list's batch gives the figures of the sailing's own page. The arithmetic itself is
// tests/coLoadingEarnings.test.ts and tests/coLoadingBoxCosts.test.ts.

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SERVICE = "11111111-1111-4111-8111-111111111111";
const SAILING = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const MANAGER = { userID: "u-manager", companyID: COMPANY, role: "manager" };
const USER = { userID: "u-user", companyID: COMPANY, role: "user" };

const sailing = (more = {}) => ({
  id: SAILING,
  companyId: COMPANY,
  serviceId: SERVICE,
  vessel: "WEEK 51",
  voyage: "",
  pol: "Shanghai (CNSHA)",
  pod: "Hamburg (DEHAM)",
  hub: "Praha (CZPRG)",
  containerType: "40' HC",
  containerCount: 1,
  cutoffDate: null as string | null,
  departureDate: null as string | null,
  createdByName: "Jan",
  createdAt: new Date("2026-11-23T08:00:00Z"),
  ...more,
});
let n = 0;
const shipment = (more = {}) => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  jobNumber: `CZLCL${String(n).padStart(8, "0")}`,
  customer: "Alfa s.r.o.",
  status: "Booked [IMP]",
  dangerous: "",
  outOfGauge: "",
  temperatureControlled: "",
  pcs: "1",
  totalWeightTons: "1",
  totalVolumeCbm: "2",
  cargoDimensions: [],
  freightMode: "Sea Freight",
  loadType: "Consolidation",
  tradeDirection: "Import",
  estimatedArrival: "2026-12-20",
  estimatedDeparture: "2026-11-20",
  actualArrival: null,
  actualDeparture: null,
  masterJobId: null as string | null,
  ...more,
});
const money = (shipmentId: string, sellingCzk: number) => ({
  shipmentId,
  sellingCzk,
  invoicedCzk: 0,
  inlandCzk: 0,
  otherCzk: 0,
  ownBoxCzk: 0,
  masterJobCzk: 0,
  sellingLines: 1,
  untickedLines: 0,
  unrecognisedLines: 0,
  handRoadLines: 0,
  missingCurrencies: [],
  eurRate: 25,
});
const cost = (kind: string, amount: string | null, currency = "EUR", more = {}) => ({ sailingId: SAILING, containerNo: 1, kind, amount, currency, note: "", updatedByName: "Eva", ...more });
const rates = (more = {}) => ({ date: "2026-11-23", fixingDate: "2026-11-23", provisional: false, missing: false, roePct: 0, rates: [{ currency: "EUR", rate: 25 }, { currency: "USD", rate: 20 }], retired: [], ...more });

beforeEach(() => {
  vi.clearAllMocks();
  repo.get.mockResolvedValue(sailing());
  repo.boxShipments.mockResolvedValue([]);
  boxCosts.repo.list.mockResolvedValue([]);
  boxCosts.repo.costedContainers.mockResolvedValue([]);
  services.get.mockResolvedValue({ id: SERVICE, mode: "sea_lcl", inlandWeightKg: null, serviceName: "ISHA", closedAt: null });
  services.requireOpen.mockResolvedValue({ id: SERVICE, mode: "sea_lcl", inlandWeightKg: null, serviceName: "ISHA", closedAt: null });
  services.planningVolumePct.mockResolvedValue(85);
  fx.fxRatesOn.mockResolvedValue(rates());
  invoicing._internalCoLoadingMoney.mockImplementation(async ({ jobs }: { jobs: { shipmentId: string }[] }) => ({ items: jobs.map((j) => money(j.shipmentId, 50000)) }));
});

describe("a sailing's earnings, read", () => {
  it("ask Invoicing once, with each shipment's dates and trade direction", async () => {
    const a = shipment();
    repo.boxShipments.mockResolvedValue([a]);
    const e = await service.earnings(SAILING, COMPANY);
    expect(invoicing._internalCoLoadingMoney).toHaveBeenCalledTimes(1);
    expect(invoicing._internalCoLoadingMoney).toHaveBeenCalledWith({
      jobs: [{ shipmentId: a.id, tradeDirection: "Import", estimatedArrival: "2026-12-20", estimatedDeparture: "2026-11-20", actualArrival: null, actualDeparture: null }],
    });
    expect(e.totals.selling).toEqual({ czk: 50000, eur: 2000 });
  });

  it("ask nobody for money when no shipment is linked", async () => {
    const e = await service.earnings(SAILING, COMPANY);
    expect(invoicing._internalCoLoadingMoney).not.toHaveBeenCalled();
    expect(e).toMatchObject({ moneyKnown: true, rows: [] });
  });

  it("say the money is not known when Invoicing fails: never 0 as a fact", async () => {
    repo.boxShipments.mockResolvedValue([shipment()]);
    invoicing._internalCoLoadingMoney.mockRejectedValue(new Error("down"));
    const e = await service.earnings(SAILING, COMPANY);
    expect(e.moneyKnown).toBe(false);
    expect(e.complete).toBe(false);
    expect(e.rows[0]!.moneyKnown).toBe(false);
  });

  it("read 500 shipments' money at a time", async () => {
    repo.boxShipments.mockResolvedValue(Array.from({ length: 501 }, () => shipment()));
    const e = await service.earnings(SAILING, COMPANY);
    expect(invoicing._internalCoLoadingMoney.mock.calls.map((c) => c[0].jobs.length)).toEqual([500, 1]);
    expect(e.rows.every((r) => r.moneyKnown)).toBe(true);
  });

  it("mark a shipment a master job holds", async () => {
    repo.boxShipments.mockResolvedValue([shipment({ masterJobId: "m1" })]);
    expect((await service.earnings(SAILING, COMPANY)).rows[0]!.inMasterJob).toBe(true);
  });

  it("ask for no rates while no box cost is set", async () => {
    boxCosts.repo.list.mockResolvedValue([cost("ocean", null)]);
    const e = await service.earnings(SAILING, COMPANY);
    expect(fx.fxRatesOn).not.toHaveBeenCalled();
    expect(e.boxCosts.set).toBe(false);
  });

  it("value the box costs at the latest rates, provisional, while the sailing has no departure date", async () => {
    boxCosts.repo.list.mockResolvedValue([cost("ocean", "1000.00", "USD")]);
    const e = await service.earnings(SAILING, COMPANY);
    expect(fx.fxRatesOn).toHaveBeenCalledWith({});
    expect(e.boxCosts).toMatchObject({ total: { czk: 20000, eur: 800 }, departureDate: null, rateProvisional: true });
  });

  it("value them at the rates of the departure date, fixed once that day's rates are out", async () => {
    repo.get.mockResolvedValue(sailing({ departureDate: "2026-11-20" }));
    boxCosts.repo.list.mockResolvedValue([cost("ocean", "1000.00", "USD")]);
    fx.fxRatesOn.mockResolvedValue(rates({ date: "2026-11-20", fixingDate: "2026-11-20" }));
    const e = await service.earnings(SAILING, COMPANY);
    expect(fx.fxRatesOn).toHaveBeenCalledWith({ date: "2026-11-20" });
    expect(e.boxCosts).toMatchObject({ rateDate: "2026-11-20", rateProvisional: false });
  });

  it("stay provisional while that day's rates may still change, or a fixing that should be stored is missing", async () => {
    repo.get.mockResolvedValue(sailing({ departureDate: "2026-12-20" }));
    boxCosts.repo.list.mockResolvedValue([cost("ocean", "1000.00", "USD")]);
    fx.fxRatesOn.mockResolvedValue(rates({ provisional: true }));
    expect((await service.earnings(SAILING, COMPANY)).boxCosts.rateProvisional).toBe(true);
    fx.fxRatesOn.mockResolvedValue(rates({ missing: true }));
    expect((await service.earnings(SAILING, COMPANY)).boxCosts.rateProvisional).toBe(true);
  });

  it("value only CZK and name the other currencies when the rates cannot be read", async () => {
    boxCosts.repo.list.mockResolvedValue([cost("ocean", "1000.00", "USD"), cost("destination", "6000.00", "CZK")]);
    fx.fxRatesOn.mockRejectedValue(new Error("down"));
    const e = await service.earnings(SAILING, COMPANY);
    expect(e.boxCosts.total).toEqual({ czk: 6000, eur: null });
    expect(e.boxCosts.missingCurrencies).toEqual(["USD"]);
    expect(e.complete).toBe(false);
  });
});

describe("the profit of a service's sailings, read together", () => {
  it("is one read of the cargo, one of the box costs, one call for the money and one for the rates of each departure date", async () => {
    const [a, b, c] = [shipment(), shipment(), shipment()];
    const third = "44444444-4444-4444-8444-444444444444";
    repo.listByService.mockResolvedValue([sailing({ departureDate: "2026-11-20" }), sailing({ id: OTHER, departureDate: "2026-11-20" }), sailing({ id: third })]);
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [a]], [OTHER, [b]], [third, [c]]]));
    boxCosts.repo.listOf.mockResolvedValue([cost("ocean", "1000.00", "USD"), cost("ocean", "500.00", "EUR", { sailingId: OTHER })]);
    const profits = await service.profits(SERVICE, COMPANY);
    expect(repo.boxShipmentsOf).toHaveBeenCalledTimes(1);
    expect(repo.boxShipmentsOf).toHaveBeenCalledWith([SAILING, OTHER, third], COMPANY);
    expect(boxCosts.repo.listOf).toHaveBeenCalledTimes(1);
    expect(invoicing._internalCoLoadingMoney).toHaveBeenCalledTimes(1);
    // Two sailings with costs share one departure date: one read of its rates; the third has no cost set, so none.
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(1);
    expect(fx.fxRatesOn).toHaveBeenCalledWith({ date: "2026-11-20" });
    expect(profits.map((p) => [p.sailingId, p.boxCostsSet, p.profit])).toEqual([
      [SAILING, true, { czk: 30000, eur: 1200 }],
      [OTHER, true, { czk: 37500, eur: 1500 }],
      [third, false, null],
    ]);
  });

  it("gives each sailing the figures of its own Earnings tab", async () => {
    const a = shipment();
    repo.listByService.mockResolvedValue([sailing({ departureDate: "2026-11-20" })]);
    repo.get.mockResolvedValue(sailing({ departureDate: "2026-11-20" }));
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [a]]]));
    repo.boxShipments.mockResolvedValue([a]);
    const stored = [cost("origin", "0.00"), cost("ocean", "1000.00", "USD"), cost("destination", "6000.00", "CZK")];
    boxCosts.repo.listOf.mockResolvedValue(stored);
    boxCosts.repo.list.mockResolvedValue(stored);
    const [fromList] = await service.profits(SERVICE, COMPANY);
    const own = await service.earnings(SAILING, COMPANY);
    expect(fromList).toMatchObject({ profit: own.totals.profit, marginPct: own.totals.marginPct, complete: own.complete, boxCostsComplete: true });
    expect(own.totals.profit).toEqual({ czk: 24000, eur: 960 });
  });

  it("says the money is not known for every sailing when Invoicing fails, and is empty for a service with no sailings", async () => {
    repo.listByService.mockResolvedValue([sailing()]);
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [shipment()]]]));
    boxCosts.repo.listOf.mockResolvedValue([cost("ocean", "1000.00")]);
    invoicing._internalCoLoadingMoney.mockRejectedValue(new Error("down"));
    expect(await service.profits(SERVICE, COMPANY)).toMatchObject([{ moneyKnown: false, profit: null }]);
    repo.listByService.mockResolvedValue([]);
    expect(await service.profits(SERVICE, COMPANY)).toEqual([]);
  });
});

describe("setting a container's box costs", () => {
  const lines = [{ kind: "ocean", amount: 1000, currency: "usd", note: " MSC " }];
  const shown = [{ kind: "ocean", amount: null, currency: "EUR", note: "" }];

  it("is allowed on a closed service: nobody asks whether it is open", async () => {
    services.get.mockResolvedValue({ id: SERVICE, mode: "sea_lcl", closedAt: new Date() });
    services.requireOpen.mockRejectedValue(new Error("closed"));
    await service.saveBoxCosts(SAILING, 1, lines, shown, MANAGER);
    expect(services.requireOpen).not.toHaveBeenCalled();
    expect(boxCosts.repo.save).toHaveBeenCalledTimes(1);
  });

  it("hands over the checked costs, what the dialog showed and who saves", async () => {
    await service.saveBoxCosts(SAILING, 1, lines, shown, MANAGER);
    const [sailingId, companyId, containerNo, next, expected, by] = boxCosts.repo.save.mock.calls[0]!;
    expect([sailingId, companyId, containerNo]).toEqual([SAILING, COMPANY, 1]);
    expect(next).toEqual([
      { kind: "origin", amount: null, currency: "EUR", note: "" },
      { kind: "ocean", amount: 1000, currency: "USD", note: "MSC" },
      { kind: "destination", amount: null, currency: "EUR", note: "" },
    ]);
    expect(expected).toBe(shown);
    expect(by).toEqual({ id: "u-manager", name: "Jana Nová" });
  });

  it("is refused for a container the sailing does not have, and for a wrong amount: nothing is written", async () => {
    await expect(service.saveBoxCosts(SAILING, 2, lines, shown, MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.saveBoxCosts(SAILING, 1, [{ kind: "ocean", amount: -1, currency: "EUR", note: "" }], shown, MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(boxCosts.repo.save).not.toHaveBeenCalled();
  });

  it("is refused, naming who, when somebody changed the costs since the dialog opened", async () => {
    boxCosts.repo.save.mockRejectedValue(new boxCosts.BoxCostsChangedMeanwhile("Eva Malá"));
    await expect(service.saveBoxCosts(SAILING, 1, lines, shown, MANAGER)).rejects.toMatchObject({
      code: "failed_precondition",
      message: "These costs were changed meanwhile by Eva Malá. Nothing was saved: close the dialog and open it again to see them.",
    });
  });

  it("is not found for a sailing of another company", async () => {
    repo.get.mockResolvedValue(null);
    await expect(service.saveBoxCosts(SAILING, 1, lines, shown, MANAGER)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.get).toHaveBeenCalledWith(SAILING, COMPANY);
  });
});

describe("\"Edit sailing\" once a container has box costs", () => {
  const details = (more = {}) => ({ containerCount: 1, cutoffDate: null, departureDate: null, ...more });
  beforeEach(() => {
    repo.setDetails.mockImplementation(async (_id: string, _c: string, d: object) => sailing(d));
    boxCosts.repo.costedContainers.mockResolvedValue([1]);
  });

  it("refuses a plain user who changes the number of containers or the departure date: nothing is written", async () => {
    await expect(service.setDetails(SAILING, details({ containerCount: 2 }), USER)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.setDetails(SAILING, details({ departureDate: "2026-11-20" }), USER)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.setDetails).not.toHaveBeenCalled();
    expect(boxCosts.repo.recordSailingChanges).not.toHaveBeenCalled();
  });

  it("lets a plain user change the cut-off alone", async () => {
    await service.setDetails(SAILING, details({ cutoffDate: "2026-11-18" }), USER);
    expect(repo.setDetails).toHaveBeenCalledTimes(1);
    expect(boxCosts.repo.recordSailingChanges).toHaveBeenCalledWith(SAILING, COMPANY, [], { id: "u-user", name: "Jana Nová" });
  });

  it("lets a manager change both, and records the old and the new", async () => {
    await service.setDetails(SAILING, details({ containerCount: 2, departureDate: "2026-11-20" }), MANAGER);
    expect(boxCosts.repo.recordSailingChanges).toHaveBeenCalledWith(
      SAILING,
      COMPANY,
      [
        { kind: "containers", oldAmount: 1, newAmount: 2, oldNote: "", newNote: "" },
        { kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-11-20" },
      ],
      { id: "u-manager", name: "Jana Nová" },
    );
  });

  it("lets anyone change them while no container has costs, recorded all the same", async () => {
    boxCosts.repo.costedContainers.mockResolvedValue([]);
    await service.setDetails(SAILING, details({ containerCount: 3 }), USER);
    expect(boxCosts.repo.recordSailingChanges.mock.calls[0]![2]).toEqual([{ kind: "containers", oldAmount: 1, newAmount: 3, oldNote: "", newNote: "" }]);
  });

  it("is refused on a closed service, for a manager too", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.setDetails(SAILING, details({ departureDate: "2026-11-20" }), MANAGER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.setDetails).not.toHaveBeenCalled();
  });
});

describe("only what the box is for goes on a sailing", () => {
  it("refuses linking an air shipment or a full load to an LCL box: nothing is linked", async () => {
    const air = { id: "00000000-0000-4000-8000-00000000aaaa", jobNumber: "CZAIR00000001", serviceName: "ISHA", freightMode: "Air Freight", loadType: "" };
    repo.shipmentsToLink.mockResolvedValue([air]);
    repo.sailingsOf.mockResolvedValue([]);
    await expect(service.linkShipments(SAILING, [air.id], MANAGER)).rejects.toMatchObject({ code: "failed_precondition", message: "CZAIR00000001 is Air Freight: only Sea LCL shipments go on this sailing." });
    expect(repo.link).not.toHaveBeenCalled();
  });

  it("refuses moving such a shipment on to another sailing", async () => {
    const full = { id: "00000000-0000-4000-8000-00000000bbbb", jobNumber: "CZFCL00000001", serviceName: "ISHA", freightMode: "Sea Freight", loadType: "Full Load" };
    repo.get.mockImplementation(async (id: string) => sailing({ id }));
    repo.shipmentsToLink.mockResolvedValue([full]);
    await expect(service.moveShipment(SAILING, full.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.move).not.toHaveBeenCalled();
  });
});
