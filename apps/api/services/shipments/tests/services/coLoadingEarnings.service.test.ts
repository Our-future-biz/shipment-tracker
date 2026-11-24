import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  get: vi.fn(),
  listByService: vi.fn(),
  boxShipments: vi.fn(),
  boxShipmentsOf: vi.fn(),
  setDetailsRecorded: vi.fn(),
  shipmentsToLink: vi.fn(),
  sailingsOf: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
  removeJudged: vi.fn(),
  moveMany: vi.fn(),
  unlinkMany: vi.fn(),
  sailingOfShipment: vi.fn(),
  comingOfServices: vi.fn(),
}));
const boxCosts = vi.hoisted(() => {
  class BoxCostsChangedMeanwhile extends Error {
    constructor(readonly by: string) {
      super("box costs changed meanwhile");
    }
  }
  return { BoxCostsChangedMeanwhile, repo: { list: vi.fn(), listOf: vi.fn(), save: vi.fn(), changes: vi.fn(), costedContainers: vi.fn() } };
});
const services = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), requireOpen: vi.fn(), planningVolumePct: vi.fn() }));
const fx = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
const invoicing = vi.hoisted(() => ({ _internalCoLoadingMoney: vi.fn() }));
const names = vi.hoisted(() => ({ userNameOf: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ fx, invoicing }));
vi.mock("../../lib/userName", () => names);
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
  names.userNameOf.mockResolvedValue("Jana Nová");
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
  // The sailing and its costed containers as the transaction finds them under the lock, and what it writes.
  let locked: { row: ReturnType<typeof sailing>; costed: number[] };
  let written: { details: object; changes: unknown[]; by: unknown }[];
  beforeEach(() => {
    // Departure dates are judged against today: a fixed one, so the dates below never age.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-24T09:00:00Z"));
    locked = { row: sailing(), costed: [1] };
    written = [];
    repo.setDetailsRecorded.mockImplementation(async (_id: string, _c: string, d: object, by: unknown, judge: (now: object, costed: number[]) => { changes: unknown[] }) => {
      const { changes } = judge(locked.row, locked.costed);
      written.push({ details: d, changes, by });
      return sailing({ ...locked.row, ...d });
    });
  });
  afterEach(() => vi.useRealTimers());

  it("refuses a plain user who changes the number of containers or the departure date: nothing is written", async () => {
    await expect(service.setDetails(SAILING, details({ containerCount: 2 }), USER)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.setDetails(SAILING, details({ departureDate: "2026-11-20" }), USER)).rejects.toMatchObject({ code: "permission_denied" });
    expect(written).toEqual([]);
  });

  it("lets a plain user change the cut-off alone, and records it", async () => {
    await service.setDetails(SAILING, details({ cutoffDate: "2026-11-18" }), USER);
    expect(written).toEqual([
      { details: details({ cutoffDate: "2026-11-18" }), changes: [{ kind: "cutoff", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-11-18" }], by: { id: "u-user", name: "Jana Nová" } },
    ]);
  });

  it("lets a manager change both, and records the old and the new with the change", async () => {
    await service.setDetails(SAILING, details({ containerCount: 2, departureDate: "2026-11-20" }), MANAGER);
    expect(written).toEqual([
      {
        details: details({ containerCount: 2, departureDate: "2026-11-20" }),
        changes: [
          { kind: "containers", oldAmount: 1, newAmount: 2, oldNote: "", newNote: "" },
          { kind: "departure", oldAmount: null, newAmount: null, oldNote: "", newNote: "2026-11-20" },
        ],
        by: { id: "u-manager", name: "Jana Nová" },
      },
    ]);
  });

  it("lets anyone change them while no container has costs, recorded all the same", async () => {
    locked.costed = [];
    await service.setDetails(SAILING, details({ containerCount: 3 }), USER);
    expect(written[0]!.changes).toEqual([{ kind: "containers", oldAmount: 1, newAmount: 3, oldNote: "", newNote: "" }]);
  });

  it("judges the costs as they are under the lock, not as they were read before it", async () => {
    // Read before the lock: no costs. Set meanwhile by a manager: container 1 has one.
    boxCosts.repo.costedContainers.mockResolvedValue([]);
    locked.costed = [1];
    await expect(service.setDetails(SAILING, details({ containerCount: 2 }), USER)).rejects.toMatchObject({ code: "permission_denied" });
    expect(written).toEqual([]);
  });

  it("looks up who edits before anything is written: a failed lookup leaves the sailing as it was", async () => {
    names.userNameOf.mockRejectedValueOnce(Object.assign(new Error("auth down"), { code: "unavailable" }));
    await expect(service.setDetails(SAILING, details({ containerCount: 2 }), MANAGER)).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.setDetailsRecorded).not.toHaveBeenCalled();
  });

  it("checks the cut-off against the stored departure date when the request leaves the date out", async () => {
    locked.row = sailing({ departureDate: "2026-12-10" });
    await expect(service.setDetails(SAILING, { containerCount: 1, cutoffDate: "2026-12-31" }, MANAGER)).rejects.toMatchObject({
      code: "invalid_argument",
      message: "The cut-off cannot be after the departure date.",
    });
    expect(written).toEqual([]);
  });

  it("keeps a sailing that left more than two years ago editable: only a changed departure date is asked for its year", async () => {
    locked.row = sailing({ departureDate: "2024-10-01" });
    await service.setDetails(SAILING, details({ containerCount: 2, departureDate: "2024-10-01" }), MANAGER);
    expect(written[0]!.changes).toEqual([{ kind: "containers", oldAmount: 1, newAmount: 2, oldNote: "", newNote: "" }]);
    await expect(service.setDetails(SAILING, details({ departureDate: "2024-10-02" }), MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("is refused on a closed service, for a manager too", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.setDetails(SAILING, details({ departureDate: "2026-11-20" }), MANAGER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.setDetailsRecorded).not.toHaveBeenCalled();
  });

  it("is not found when the sailing is gone by the time it is locked", async () => {
    repo.setDetailsRecorded.mockResolvedValue(null);
    await expect(service.setDetails(SAILING, details({ cutoffDate: "2026-11-18" }), MANAGER)).rejects.toMatchObject({ code: "not_found" });
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

describe("linking shipments to a sailing", () => {
  const ids = ["00000000-0000-4000-8000-0000000000a1", "00000000-0000-4000-8000-0000000000a2"];
  const own = (id: string, more = {}) => ({ id, jobNumber: `CZLCL${id.slice(-8)}`, serviceName: "ISHA", freightMode: "Sea Freight", loadType: "Consolidation", ...more });
  beforeEach(() => {
    repo.shipmentsToLink.mockImplementation(async (asked: string[]) => asked.map((id) => own(id)));
    repo.sailingsOf.mockResolvedValue([]);
    repo.link.mockResolvedValue(true);
  });

  it("links them all, each once, as the one who links", async () => {
    expect(await service.linkShipments(SAILING, [...ids, ids[0]!], USER)).toEqual({ linked: 2 });
    expect(repo.link).toHaveBeenCalledWith(SAILING, ids, COMPANY, { id: "u-user", name: "Jana Nová" });
  });

  it("refuses a shipment of another Service Name, or one on another sailing: nothing is linked", async () => {
    repo.shipmentsToLink.mockResolvedValue([own(ids[0]!, { serviceName: "Domestic" })]);
    await expect(service.linkShipments(SAILING, [ids[0]!], USER)).rejects.toMatchObject({
      code: "failed_precondition",
      message: 'CZLCL000000a1 has the Service Name "Domestic": only ISHA shipments go on this sailing.',
    });
    repo.shipmentsToLink.mockImplementation(async (asked: string[]) => asked.map((id) => own(id)));
    repo.sailingsOf.mockResolvedValue([{ shipmentId: ids[1]!, sailingId: OTHER, vessel: "MSC Anna", voyage: "445W" }]);
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({ code: "failed_precondition", message: "CZLCL000000a2 is on MSC Anna 445W: remove it from there first." });
    expect(repo.link).not.toHaveBeenCalled();
  });

  it("does not find a shipment of another company, or an id that is no id", async () => {
    repo.shipmentsToLink.mockResolvedValue([own(ids[0]!)]);
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.linkShipments(SAILING, [ids[0]!, "CZLCL00000001"], USER)).rejects.toMatchObject({ code: "not_found" });
    expect(repo.link).not.toHaveBeenCalled();
  });

  it("says so when one was linked meanwhile: the database undid the others", async () => {
    repo.link.mockResolvedValue(false);
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({
      code: "already_exists",
      message: "A shipment was linked to a sailing meanwhile: nothing was linked. Try again.",
    });
  });

  it("refuses more than 200 at once instead of linking some of them", async () => {
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await expect(service.linkShipments(SAILING, many, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Link at most 200 shipments at once." });
    expect(repo.shipmentsToLink).not.toHaveBeenCalled();
    expect(repo.link).not.toHaveBeenCalled();
  });

  it("is refused on a closed service, and so is taking one off", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.unlinkShipment(SAILING, ids[0]!, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.link).not.toHaveBeenCalled();
    expect(repo.unlink).not.toHaveBeenCalled();
  });

  it("takes one off as the one who does it, and does not find one that is not on the sailing", async () => {
    repo.unlink.mockResolvedValue(true);
    await service.unlinkShipment(SAILING, ids[0]!, USER);
    expect(repo.unlink).toHaveBeenCalledWith(SAILING, ids[0], COMPANY, { id: "u-user", name: "Jana Nová" });
    repo.unlink.mockResolvedValue(false);
    await expect(service.unlinkShipment(SAILING, ids[0]!, USER)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("moving a shipment on to another sailing", () => {
  const moved = { id: "00000000-0000-4000-8000-0000000000c1", jobNumber: "CZLCL00000001", serviceName: "ISHA", freightMode: "Sea Freight", loadType: "Consolidation" };
  beforeEach(() => {
    repo.get.mockImplementation(async (id: string) => sailing({ id }));
    repo.shipmentsToLink.mockResolvedValue([moved]);
  });

  it("moves it in one turn, with the reason trimmed and who moved it", async () => {
    repo.move.mockResolvedValue(true);
    await service.moveShipment(SAILING, moved.id, OTHER, "  Box full, rolled to next week ", MANAGER);
    expect(repo.move).toHaveBeenCalledWith(SAILING, OTHER, moved.id, COMPANY, { id: "u-manager", name: "Jana Nová" }, "Box full, rolled to next week");
  });

  it("does not find a shipment that is not on the sailing", async () => {
    repo.move.mockResolvedValue(false);
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "not_found" });
  });

  it("is refused to a sailing of another service", async () => {
    repo.get.mockImplementation(async (id: string) => sailing({ id, serviceId: id === OTHER ? "55555555-5555-4555-8555-555555555555" : SERVICE }));
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.move).not.toHaveBeenCalled();
  });
});

describe("a new sailing", () => {
  const input = { vessel: "WEEK 51", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" };

  it("is refused on a closed service: nothing is made", async () => {
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.create(SERVICE, input, USER)).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("is made on an open service by the one who makes it", async () => {
    repo.create.mockImplementation(async (values: object) => sailing(values));
    await service.create(SERVICE, input, USER);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ companyId: COMPANY, serviceId: SERVICE, vessel: "WEEK 51", containerCount: 1, createdById: "u-user", createdByName: "Jana Nová" }));
  });
});

describe("the rates of the service's sailings", () => {
  it("are read once per departure date, at most four dates at a time", async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `66666666-6666-4666-8666-${String(i).padStart(12, "0")}`);
    repo.listByService.mockResolvedValue(ids.map((id, i) => sailing({ id, departureDate: `2026-11-${String(i + 1).padStart(2, "0")}` })));
    repo.boxShipmentsOf.mockResolvedValue(new Map());
    boxCosts.repo.listOf.mockResolvedValue(ids.map((sailingId) => cost("ocean", "100.00", "EUR", { sailingId })));
    let reading = 0;
    let most = 0;
    fx.fxRatesOn.mockImplementation(async ({ date }: { date?: string }) => {
      most = Math.max(most, ++reading);
      await new Promise((resolve) => setImmediate(resolve));
      reading--;
      return rates({ date, fixingDate: date });
    });
    const profits = await service.profits(SERVICE, COMPANY);
    expect(fx.fxRatesOn).toHaveBeenCalledTimes(10);
    expect(most).toBe(4);
    expect(profits.every((p) => p.boxCostsSet)).toBe(true);
  });
});

describe("removing a sailing made by mistake (Council Outlay 14, D4)", () => {
  // The repository hands the judge what the sailing holds under its lock.
  const holding = (linkedShipments: number, costed: number[]) =>
    repo.removeJudged.mockImplementation(async (_id: string, _c: string, judge: (linked: number, costed: number[]) => void) => {
      judge(linkedShipments, costed);
      return true;
    });

  it("lets a manager remove an empty one", async () => {
    holding(0, []);
    await expect(service.remove(SAILING, MANAGER)).resolves.toBeUndefined();
    expect(repo.removeJudged).toHaveBeenCalledWith(SAILING, COMPANY, expect.any(Function));
  });

  it("refuses a plain user", async () => {
    holding(0, []);
    await expect(service.remove(SAILING, USER)).rejects.toMatchObject({ code: "permission_denied", message: "Only managers and admins remove a sailing." });
  });

  it("refuses while it holds a shipment or a box cost", async () => {
    holding(2, []);
    await expect(service.remove(SAILING, MANAGER)).rejects.toMatchObject({ code: "failed_precondition", message: "This sailing has 2 shipments linked: move or remove them first." });
    holding(0, [1]);
    await expect(service.remove(SAILING, MANAGER)).rejects.toMatchObject({ code: "failed_precondition", message: "This sailing has box costs: clear them first." });
  });

  it("is refused on a closed service, and not found when the sailing is gone", async () => {
    repo.removeJudged.mockResolvedValue(false);
    await expect(service.remove(SAILING, MANAGER)).rejects.toMatchObject({ code: "not_found" });
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.remove(SAILING, MANAGER)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("a shipment's place in Co-Loading (Council Outlay 14, A1)", () => {
  const JOB = "00000000-0000-4000-8000-0000000000aa";
  const lcl = { id: JOB, jobNumber: "CZLCL00000062", serviceName: " isha ", freightMode: "Sea Freight", loadType: "Consolidation" };
  const open = (more = {}) => ({ id: SERVICE, name: "Import from Shanghai", serviceName: "ISHA", mode: "sea_lcl", inlandWeightKg: null, closedAt: null, ...more });
  beforeEach(() => {
    repo.shipmentsToLink.mockResolvedValue([lcl]);
    repo.sailingOfShipment.mockResolvedValue(null);
    repo.comingOfServices.mockResolvedValue([]);
    repo.boxShipmentsOf.mockResolvedValue(new Map());
    services.list.mockResolvedValue([open()]);
    services.planningVolumePct.mockResolvedValue(85);
  });

  it("is not found for a shipment the company does not have", async () => {
    repo.shipmentsToLink.mockResolvedValue([]);
    await expect(service.ofShipment(JOB, COMPANY)).rejects.toMatchObject({ code: "not_found" });
    await expect(service.ofShipment("not-an-id", COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });

  it("offers the coming sailings of the open services that stand for its Service Name, read as users see them", async () => {
    repo.comingOfServices.mockResolvedValue([sailing({ id: OTHER, vessel: "WEEK 52", cutoffDate: "2026-12-10" })]);
    const place = await service.ofShipment(JOB, COMPANY);
    expect(services.list).toHaveBeenCalledWith(COMPANY, "user");
    expect(repo.comingOfServices).toHaveBeenCalledWith([SERVICE], COMPANY, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(place.on).toBeNull();
    expect(place.services).toEqual([{ id: SERVICE, name: "Import from Shanghai" }]);
    expect(place.coming).toMatchObject([{ id: OTHER, vessel: "WEEK 52", serviceLabel: "Import from Shanghai", cutoffDate: "2026-12-10", fill: { shipments: 0 } }]);
  });

  it("offers nothing to a shipment Co-Loading is not for: another Service Name, none, or another kind of shipment", async () => {
    for (const other of [{ ...lcl, serviceName: "Domestic" }, { ...lcl, serviceName: "" }, { ...lcl, loadType: "Full Load" }, { ...lcl, freightMode: "Air Freight" }]) {
      repo.shipmentsToLink.mockResolvedValue([other]);
      const place = await service.ofShipment(JOB, COMPANY);
      expect(place.services).toEqual([]);
      expect(repo.comingOfServices).toHaveBeenLastCalledWith([], COMPANY, expect.any(String));
    }
  });

  it("gives the sailing it is on with how full its box is, and no money", async () => {
    repo.sailingOfShipment.mockResolvedValue(sailing());
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [shipment({ id: JOB, totalVolumeCbm: "9.08", totalWeightTons: "1.95" })]]]));
    const place = await service.ofShipment(JOB, COMPANY);
    expect(place.on).toMatchObject({ id: SAILING, vessel: "WEEK 51", serviceLabel: "Import from Shanghai", serviceClosed: false, fill: { shipments: 1, volume: { pct: 13 }, weight: { pct: 7 } } });
    expect(JSON.stringify(place)).not.toMatch(/profit|cost/i);
  });

  it("still shows the sailing of a closed service, and says it is closed", async () => {
    services.list.mockResolvedValue([]);
    services.get.mockResolvedValue(open({ closedAt: "2026-11-20T10:00:00.000Z" }));
    repo.sailingOfShipment.mockResolvedValue(sailing());
    const place = await service.ofShipment(JOB, COMPANY);
    expect(place.on).toMatchObject({ id: SAILING, serviceClosed: true });
    expect(place.services).toEqual([]);
    expect(place.coming).toEqual([]);
  });
});

describe("moving or removing several shipments at once (Council Outlay 14, A9)", () => {
  const A = "00000000-0000-4000-8000-00000000000a";
  const B = "00000000-0000-4000-8000-00000000000b";
  const own = (id: string, more = {}) => ({ id, jobNumber: `CZLCL${id.slice(-8)}`, serviceName: "ISHA", freightMode: "Sea Freight", loadType: "Consolidation", ...more });
  beforeEach(() => {
    repo.get.mockImplementation(async (id: string) => sailing({ id }));
    repo.shipmentsToLink.mockImplementation(async (asked: string[]) => asked.map((id) => own(id)));
    repo.moveMany.mockResolvedValue(true);
    repo.unlinkMany.mockResolvedValue(true);
  });

  it("moves them all with the one reason, each once, as the one who moves", async () => {
    await expect(service.moveShipments(SAILING, [A, B, A], OTHER, "  Box full  ", USER)).resolves.toEqual({ moved: 2 });
    expect(repo.moveMany).toHaveBeenCalledWith(SAILING, OTHER, [A, B], COMPANY, { id: "u-user", name: "Jana Nová" }, "Box full");
  });

  it("holds each to the rules of a single move: a reason, another sailing of the service, the box's own kind", async () => {
    await expect(service.moveShipments(SAILING, [A], OTHER, " ", USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the shipment is moved." });
    await expect(service.moveShipments(SAILING, [A], SAILING, "why", USER)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.shipmentsToLink.mockResolvedValue([own(A), own(B, { loadType: "Full Load" })]);
    await expect(service.moveShipments(SAILING, [A, B], OTHER, "why", USER)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("Nothing was moved.") });
    expect(repo.moveMany).not.toHaveBeenCalled();
  });

  it("moves none when one is no longer on the sailing, and says so", async () => {
    repo.moveMany.mockResolvedValue(false);
    await expect(service.moveShipments(SAILING, [A, B], OTHER, "why", USER)).rejects.toMatchObject({ code: "not_found", message: "A shipment is no longer on this sailing: nothing was moved. Read the list again." });
  });

  it("asks for at least one shipment and takes at most 200", async () => {
    await expect(service.moveShipments(SAILING, [], OTHER, "why", USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Pick the shipments to move." });
    const many = Array.from({ length: 201 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    await expect(service.unlinkShipments(SAILING, many, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "At most 200 shipments at once." });
  });

  it("removes them all, or none when one is no longer there; nothing on a closed service", async () => {
    await expect(service.unlinkShipments(SAILING, [A, B], USER)).resolves.toEqual({ removed: 2 });
    expect(repo.unlinkMany).toHaveBeenCalledWith(SAILING, [A, B], COMPANY, { id: "u-user", name: "Jana Nová" });
    repo.unlinkMany.mockResolvedValue(false);
    await expect(service.unlinkShipments(SAILING, [A], USER)).rejects.toMatchObject({ code: "not_found" });
    services.requireOpen.mockRejectedValue(Object.assign(new Error("closed"), { code: "failed_precondition" }));
    await expect(service.unlinkShipments(SAILING, [A], USER)).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.moveShipments(SAILING, [A], OTHER, "why", USER)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});
