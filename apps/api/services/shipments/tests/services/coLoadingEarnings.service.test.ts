import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repo = vi.hoisted(() => ({
  get: vi.fn(),
  listByService: vi.fn(),
  boxShipments: vi.fn(),
  boxShipmentsOf: vi.fn(),
  setDetailsRecorded: vi.fn(),
  setStageRecorded: vi.fn(),
  shipmentsToLink: vi.fn(),
  sailingsOf: vi.fn(),
  link: vi.fn(),
  unlink: vi.fn(),
  move: vi.fn(),
  create: vi.fn(),
  removeJudged: vi.fn(),
  moveMany: vi.fn(),
  waitingByKind: vi.fn(),
  listOfServices: vi.fn(),
  unlinkMany: vi.fn(),
  sailingOfShipment: vi.fn(),
  comingOfServices: vi.fn(),
  rememberLinked: vi.fn(),
  setOverNotified: vi.fn(),
  claimOverNotice: vi.fn(),
  dropDeletedShipment: vi.fn(),
  peopleOf: vi.fn(),
}));
const boxCosts = vi.hoisted(() => {
  class BoxCostsChangedMeanwhile extends Error {
    constructor(readonly by: string) {
      super("box costs changed meanwhile");
    }
  }
  return { BoxCostsChangedMeanwhile, repo: { list: vi.fn(), listOf: vi.fn(), save: vi.fn(), changes: vi.fn(), costedContainers: vi.fn() } };
});
const chat = vi.hoisted(() => ({ users: vi.fn(async () => [] as { id: string; email: string; displayName: string }[]), post: vi.fn() }));
const services = vi.hoisted(() => ({ get: vi.fn(), list: vi.fn(), requireOpen: vi.fn(), planningVolumePct: vi.fn(), money: vi.fn(), setInlandWeight: vi.fn(), saveSettings: vi.fn() }));
const fx = vi.hoisted(() => ({ fxRatesOn: vi.fn() }));
const invoicing = vi.hoisted(() => ({ _internalCoLoadingMoney: vi.fn() }));
const names = vi.hoisted(() => ({ userNameOf: vi.fn() }));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("~encore/clients", () => ({ fx, invoicing }));
vi.mock("../../lib/userName", () => names);
vi.mock("../../repositories/coLoadingSailing.repository", () => ({ coLoadingSailingRepository: repo }));
// A cargo change that takes a box over is told in the shipment's chat: the users and the chat are stand-ins.
vi.mock("../../../../lib/companyUsers", () => ({ companyUsers: chat.users }));
vi.mock("../../repositories/shipmentComment.repository", () => ({ shipmentCommentRepository: { createForCompany: chat.post } }));
vi.mock("../../repositories/coLoadingBoxCost.repository", () => ({ coLoadingBoxCostRepository: boxCosts.repo, BoxCostsChangedMeanwhile: boxCosts.BoxCostsChangedMeanwhile }));
vi.mock("../../services/coLoadingService.service", () => ({ coLoadingServiceService: services }));
// A change no person made is written in a chat as the company's service identity.
vi.mock("../../../../lib/outbox/serviceIdentity", () => ({ serviceActor: async (companyID: string) => ({ userID: "u-system", companyID, role: "user" }) }));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
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
  stage: "open",
  overNotified: false,
  createdById: "u-maker" as string | null,
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
  services.money.mockResolvedValue({ defaultBoxCosts: null, minEarningPerWm: null });
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
  // The repository holds the sailing's lock and hands the judge the sailing as it is then; the note the links keep is what the judge gives.
  let locked = sailing();
  const kept: string[] = [];
  beforeEach(() => {
    locked = sailing();
    kept.length = 0;
    repo.shipmentsToLink.mockImplementation(async (asked: string[]) => asked.map((id) => own(id)));
    repo.sailingsOf.mockResolvedValue([]);
    repo.link.mockImplementation(async (_id: string, _ids: string[], _company: string, _by: unknown, judge: (now: unknown) => string) => {
      kept.push(judge(locked));
      return "linked";
    });
  });

  it("links them all, each once, as the one who links", async () => {
    expect(await service.linkShipments(SAILING, [...ids, ids[0]!], USER)).toEqual({ linked: 2 });
    expect(repo.link).toHaveBeenCalledWith(SAILING, ids, COMPANY, { id: "u-user", name: "Jana Nová" }, expect.any(Function));
    expect(kept).toEqual([""]);
  });

  it("links to a sailing closed for cargo only with a reason, kept on the link (C3)", async () => {
    repo.get.mockResolvedValue(sailing({ stage: "closed" }));
    locked = sailing({ stage: "closed" });
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toThrow(/closed for cargo: say why/);
    expect(repo.link).not.toHaveBeenCalled();
    expect(await service.linkShipments(SAILING, ids, USER, "  Carrier took it late ")).toEqual({ linked: 2 });
    expect(kept).toEqual(["Carrier took it late"]);
  });

  it("judges the stage again under the sailing's lock: one closed for cargo meanwhile asks for the reason, and keeps it", async () => {
    locked = sailing({ stage: "closed" });
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({ code: "invalid_argument", message: "This sailing is closed for cargo: say why the shipment still goes on it." });
    expect(kept).toEqual([]);
    await service.linkShipments(SAILING, ids, USER, "Late booking");
    expect(kept).toEqual(["Late booking"]);
  });

  it("is not found when the sailing was removed by the time it is locked: nothing is linked", async () => {
    repo.link.mockResolvedValue("gone");
    await expect(service.linkShipments(SAILING, ids, USER)).rejects.toMatchObject({ code: "not_found", message: "Sailing not found" });
    expect(repo.rememberLinked).not.toHaveBeenCalled();
  });

  it("sets the stage and records the change, and refuses a stage that is none (C3)", async () => {
    repo.setStageRecorded.mockImplementation(async (_id: string, _company: string, stage: string, _by: unknown, judge: (now: string) => unknown) => {
      judge("open");
      return sailing({ stage });
    });
    expect((await service.setStage(SAILING, "departed", USER)).stage).toBe("departed");
    expect(repo.setStageRecorded).toHaveBeenCalledWith(SAILING, COMPANY, "departed", { id: "u-user", name: "Jana Nová" }, expect.any(Function));
    await expect(service.setStage(SAILING, "sunk", USER)).rejects.toThrow(/Pick the stage/);
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
    repo.link.mockResolvedValue("taken");
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

  // The repository holds both sailings' lock and hands the judge them as they are then.
  const judgedAs = (from: object, to: object | null) =>
    repo.move.mockImplementation(async (_from: string, _to: string, _id: string, _c: string, _by: unknown, _note: string, judge: (a: unknown, b: unknown) => string) => {
      kept.push(judge(from, to));
      return "moved";
    });
  const kept: string[] = [];
  beforeEach(() => {
    kept.length = 0;
  });

  it("moves it in one turn, with the reason trimmed and who moved it", async () => {
    judgedAs(sailing(), sailing({ id: OTHER }));
    await service.moveShipment(SAILING, moved.id, OTHER, "  Box full, rolled to next week ", MANAGER);
    expect(repo.move).toHaveBeenCalledWith(SAILING, OTHER, moved.id, COMPANY, { id: "u-manager", name: "Jana Nová" }, "Box full, rolled to next week", expect.any(Function));
    // An open sailing keeps no reason on the new link.
    expect(kept).toEqual([""]);
  });

  it("keeps the reason on the new link when the sailing it goes to is closed for cargo (C3)", async () => {
    judgedAs(sailing(), sailing({ id: OTHER, stage: "closed" }));
    await service.moveShipment(SAILING, moved.id, OTHER, "  Box full ", MANAGER);
    expect(kept).toEqual(["Box full"]);
  });

  it("goes only to a sailing still to come, read and judged again under the lock (Council Outlay 14, A1)", async () => {
    repo.get.mockImplementation(async (id: string) => sailing(id === OTHER ? { id, stage: "departed" } : { id }));
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "invalid_argument", message: "The sailing to move it to is set to Departed: a shipment moves only to a sailing still to come." });
    repo.get.mockImplementation(async (id: string) => sailing(id === OTHER ? { id, departureDate: "2020-01-07" } : { id }));
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "invalid_argument", message: "The sailing to move it to left on 07.01.2020: a shipment moves only to a sailing still to come." });
    expect(repo.move).not.toHaveBeenCalled();
    // Read as still to come, set to Departed or removed by the time both are locked: nothing moves.
    repo.get.mockImplementation(async (id: string) => sailing({ id }));
    judgedAs(sailing(), sailing({ id: OTHER, stage: "departed" }));
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "invalid_argument" });
    judgedAs(sailing(), null);
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "invalid_argument", message: "The sailing to move it to was not found." });
    expect(kept).toEqual([]);
  });

  it("does not find a shipment that is not on the sailing, nor a sailing removed by the time it is locked", async () => {
    repo.move.mockResolvedValue("not_on_it");
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "not_found", message: "The shipment is not on this sailing." });
    repo.move.mockResolvedValue("gone");
    await expect(service.moveShipment(SAILING, moved.id, OTHER, "Box full", MANAGER)).rejects.toMatchObject({ code: "not_found", message: "Sailing not found" });
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
    repo.moveMany.mockResolvedValue("moved");
    repo.unlinkMany.mockResolvedValue(true);
  });

  it("moves them all with the one reason, each once, as the one who moves", async () => {
    await expect(service.moveShipments(SAILING, [A, B, A], OTHER, "  Box full  ", USER)).resolves.toEqual({ moved: 2 });
    expect(repo.moveMany).toHaveBeenCalledWith(SAILING, OTHER, [A, B], COMPANY, { id: "u-user", name: "Jana Nová" }, "Box full", expect.any(Function));
  });

  it("keeps the reason on the new links when the sailing they go to is closed for cargo, as it is under the lock (C3)", async () => {
    const kept: string[] = [];
    repo.moveMany.mockImplementation(async (_f: string, _t: string, _ids: string[], _c: string, _by: unknown, _note: string, judge: (a: unknown, b: unknown) => string) => {
      kept.push(judge(sailing(), sailing({ id: OTHER, stage: "closed" })));
      return "moved";
    });
    await service.moveShipments(SAILING, [A, B], OTHER, " Box full ", USER);
    expect(kept).toEqual(["Box full"]);
  });

  it("holds each to the rules of a single move: a reason, another sailing of the service, the box's own kind", async () => {
    await expect(service.moveShipments(SAILING, [A], OTHER, " ", USER)).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the shipment is moved." });
    await expect(service.moveShipments(SAILING, [A], SAILING, "why", USER)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.shipmentsToLink.mockResolvedValue([own(A), own(B, { loadType: "Full Load" })]);
    await expect(service.moveShipments(SAILING, [A, B], OTHER, "why", USER)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringContaining("Nothing was moved.") });
    expect(repo.moveMany).not.toHaveBeenCalled();
  });

  it("moves none when one is no longer on the sailing, and says so", async () => {
    repo.moveMany.mockResolvedValue("not_on_it");
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

describe("the board of all services (Council Outlay 14, A6)", () => {
  const svc = (more = {}) => ({ id: SERVICE, name: "Import from Shanghai", serviceName: "ISHA", frequency: "weekly", mode: "sea_lcl", inlandWeightKg: null, closedAt: null, origin: "Shanghai (CNSHA)", destination: "Praha (CZPRG)", note: "", ...more });
  beforeEach(() => {
    services.list.mockResolvedValue([svc()]);
    services.planningVolumePct.mockResolvedValue(85);
    repo.comingOfServices.mockResolvedValue([sailing({ cutoffDate: "2026-12-03" })]);
    repo.waitingByKind.mockResolvedValue([]);
    repo.boxShipmentsOf.mockResolvedValue(new Map());
    repo.listOfServices.mockResolvedValue([sailing()]);
  });

  it("gives each coming sailing with its service, its fill, the room left and what to watch - and no money", async () => {
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [shipment({ totalVolumeCbm: "9.08", totalWeightTons: "1.95", dangerous: "Yes" }), shipment({ status: "Cancelled Shipment" })]]]));
    const board = await service.board(COMPANY);
    expect(services.list).toHaveBeenCalledWith(COMPANY, "user");
    expect(board.sailings).toMatchObject([{ id: SAILING, serviceLabel: "Import from Shanghai", cutoffDate: "2026-12-03", fill: { shipments: 1, volume: { pct: 13 } }, free: { cbm: 55.82, kg: 24250 }, cancelled: 1, dangerous: 1 }]);
    expect(JSON.stringify(board)).not.toMatch(/profit|cost/i);
  });

  it("counts a service's waiting shipments: its Service Name, of the kind its box is for", async () => {
    repo.waitingByKind.mockResolvedValue([
      { serviceName: "isha", freightMode: "Sea Freight", loadType: "Consolidation", shipments: 3 },
      { serviceName: "isha", freightMode: "Sea Freight", loadType: "Full Load", shipments: 2 },
      { serviceName: "isha", freightMode: "Air Freight", loadType: "", shipments: 1 },
      { serviceName: "domestic", freightMode: "Sea Freight", loadType: "Consolidation", shipments: 9 },
    ]);
    expect((await service.board(COMPANY)).services).toEqual([{ id: SERVICE, name: "Import from Shanghai", frequency: "weekly", waiting: 3 }]);
  });

  it("gives managers the profit of the coming sailings only", async () => {
    repo.listByService.mockResolvedValue([sailing(), sailing({ id: OTHER, departureDate: "2026-10-01" })]);
    boxCosts.repo.listOf.mockResolvedValue([]);
    const profits = await service.boardProfits(COMPANY);
    expect(profits.map((p) => p.sailingId)).toEqual([SAILING]);
  });

  it("finds services and sailings by every word typed, as the asker sees the services", async () => {
    expect((await service.searchMain(COMPANY, "user", "shanghai import", 5)).items.map((i) => [i.kind, i.title])).toEqual([["service", "Import from Shanghai"], ["sailing", "WEEK 51"]]);
    expect(services.list).toHaveBeenLastCalledWith(COMPANY, "user");
    expect((await service.searchMain(COMPANY, "manager", "week 51", 5)).items).toMatchObject([{ kind: "sailing", id: SAILING, serviceId: SERVICE, serviceLabel: "Import from Shanghai", pol: "Shanghai (CNSHA)" }]);
    expect(await service.searchMain(COMPANY, "user", "rotterdam", 5)).toEqual({ items: [], total: 0 });
    expect(await service.searchMain(COMPANY, "user", "shanghai", 1)).toMatchObject({ total: 2, items: [{ kind: "service" }] });
  });
});

describe("cargo changed since linked (Council Outlay 14, C4)", () => {
  const A = "00000000-0000-4000-8000-0000000000c1";
  // A 40' HC is planned to about 65 cbm: 70 cbm is over.
  const big = () => shipment({ id: A, jobNumber: "CZLCL1", totalVolumeCbm: "70", linkedWeightKg: "1000.0", linkedVolumeCbm: "60.000" });
  beforeEach(() => {
    repo.sailingsOf.mockResolvedValue([{ shipmentId: A, sailingId: SAILING, serviceId: SERVICE, vessel: "WEEK 51", voyage: "" }]);
    repo.peopleOf.mockResolvedValue({ jobNumber: "CZLCL1", personInCharge: "pic@x.cz", holidayCover: "" });
    chat.users.mockResolvedValue([
      { id: "u-pic", email: "pic@x.cz", displayName: "Jana" },
      { id: "u-maker", email: "maker@x.cz", displayName: "Petr" },
    ]);
  });

  it("remembers what a linked shipment counts on the day it is linked", async () => {
    repo.shipmentsToLink.mockImplementation(async (asked: string[]) => asked.map((id) => ({ id, jobNumber: "CZLCL1", serviceName: "ISHA", freightMode: "Sea Freight", loadType: "Consolidation" })));
    repo.sailingsOf.mockResolvedValue([]);
    repo.link.mockResolvedValue("linked");
    repo.boxShipments.mockResolvedValue([shipment({ id: A, totalWeightTons: "1", totalVolumeCbm: "2" })]);
    await service.linkShipments(SAILING, [A], USER);
    expect(repo.rememberLinked).toHaveBeenCalledWith(SAILING, COMPANY, [expect.objectContaining({ shipmentId: A, weightKg: 1000, volumeCbm: 2 })]);
    // Within its limits and nobody told: the mark is left alone.
    expect(repo.setOverNotified).not.toHaveBeenCalled();
  });

  const OTHER_USER = "0d5f0a43-52a1-4d0e-9a39-0c6f3b1f6a02";

  it("tells the Person in Charge and the sailing's maker when a change takes the box over, once", async () => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.claimOverNotice.mockResolvedValue(true);
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(repo.claimOverNotice).toHaveBeenCalledWith(SAILING, COMPANY);
    expect(repo.setOverNotified).not.toHaveBeenCalled();
    expect(chat.post).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ shipmentId: A, authorId: OTHER_USER, mentionedUserIds: ["u-pic", "u-maker"] }));
    expect(chat.post.mock.calls[0]![1].message).toContain("Co-Loading sailing WEEK 51 is now over its limit: volume 70 of");
    expect(chat.post.mock.calls[0]![1].message).toContain("+10 cbm since linked");
    // Already told: a later change of the still-over box says nothing more.
    vi.clearAllMocks();
    repo.get.mockResolvedValue(sailing({ overNotified: true }));
    repo.boxShipments.mockResolvedValue([big()]);
    repo.sailingsOf.mockResolvedValue([{ shipmentId: A, sailingId: SAILING, serviceId: SERVICE, vessel: "WEEK 51", voyage: "" }]);
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(chat.post).not.toHaveBeenCalled();
    expect(repo.claimOverNotice).not.toHaveBeenCalled();
    expect(repo.setOverNotified).not.toHaveBeenCalled();
  });

  it("tells once of two saves at one moment: the one that does not claim the telling posts nothing", async () => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.claimOverNotice.mockResolvedValue(false);
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(chat.post).not.toHaveBeenCalled();
    expect(repo.setOverNotified).not.toHaveBeenCalled();
  });

  it("gives the claim back when the line cannot be written, so the next change tells", async () => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.claimOverNotice.mockResolvedValue(true);
    chat.post.mockRejectedValueOnce(new Error("insert failed"));
    await expect(service.cargoChanged(A, COMPANY, OTHER_USER)).resolves.toBeUndefined();
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
  });

  it("claims nothing when the people to tell cannot be read: nobody was told, so the mark stays unset", async () => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.claimOverNotice.mockResolvedValue(true);
    chat.users.mockRejectedValueOnce(new Error("auth down"));
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(repo.claimOverNotice).not.toHaveBeenCalled();
    expect(chat.post).not.toHaveBeenCalled();
  });

  it("writes a change no person made as the company's service identity, tagging everyone it concerns", async () => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.claimOverNotice.mockResolvedValue(true);
    await service.cargoChanged(A, COMPANY, "");
    expect(chat.post).toHaveBeenCalledWith(COMPANY, expect.objectContaining({ authorId: "u-system", mentionedUserIds: ["u-pic", "u-maker"] }));
  });

  it("clears the mark once the box is back within its limits, and says nothing for a shipment on no sailing", async () => {
    repo.get.mockResolvedValue(sailing({ overNotified: true }));
    repo.boxShipments.mockResolvedValue([shipment({ id: A, totalVolumeCbm: "10" })]);
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
    expect(chat.post).not.toHaveBeenCalled();
    vi.clearAllMocks();
    repo.sailingsOf.mockResolvedValue([]);
    await service.cargoChanged(A, COMPANY, OTHER_USER);
    expect(repo.get).not.toHaveBeenCalled();
  });

  it("never fails the shipment's save when the box cannot be read", async () => {
    repo.boxShipments.mockRejectedValue(new Error("db down"));
    await expect(service.cargoChanged(A, COMPANY, OTHER_USER)).resolves.toBeUndefined();
  });
});

describe("a service's money settings on its sailings (Council Outlay 14, B4)", () => {
  it("gives a new sailing the service's default box costs on each of its containers", async () => {
    const defaults = [
      { kind: "origin", amount: null, currency: "EUR", note: "" },
      { kind: "ocean", amount: 2100, currency: "USD", note: "" },
      { kind: "destination", amount: 300, currency: "EUR", note: "terminal" },
    ];
    // Whatever an earlier test left this stand-in doing is taken off first.
    boxCosts.repo.save.mockReset();
    boxCosts.repo.save.mockResolvedValue(undefined);
    services.requireOpen.mockResolvedValue({ id: SERVICE, defaultBoxCosts: defaults, minEarningPerWm: null });
    repo.create.mockResolvedValue(sailing({ containerCount: 2 }));
    await service.create(SERVICE, { vessel: "WEEK 2", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC", containerCount: 2 }, USER);
    expect(boxCosts.repo.save).toHaveBeenCalledTimes(2);
    // Set by nobody: the service gave them, so they lock neither Edit sailing nor a removal (coLoadingBoxCost.repository costedContainers).
    expect(boxCosts.repo.save).toHaveBeenCalledWith(SAILING, COMPANY, 1, expect.arrayContaining([expect.objectContaining({ kind: "ocean", amount: 2100, currency: "USD", note: "Service default" }), expect.objectContaining({ kind: "destination", note: "terminal" })]), null, { id: null, name: "Service default" });
    expect(boxCosts.repo.save).toHaveBeenCalledWith(SAILING, COMPANY, 2, expect.anything(), null, expect.anything());
  });

  it("makes the sailing all the same when it has no defaults, or when they cannot be written", async () => {
    boxCosts.repo.save.mockReset();
    services.requireOpen.mockResolvedValue({ id: SERVICE });
    repo.create.mockResolvedValue(sailing());
    const input = { vessel: "WEEK 2", voyage: "", pol: "Shanghai (CNSHA)", pod: "Hamburg (DEHAM)", hub: "Praha (CZPRG)", containerType: "40' HC" };
    expect((await service.create(SERVICE, input, USER)).id).toBe(SAILING);
    expect(boxCosts.repo.save).not.toHaveBeenCalled();
    services.requireOpen.mockResolvedValue({ id: SERVICE, defaultBoxCosts: [{ kind: "ocean", amount: 1, currency: "EUR", note: "" }] });
    boxCosts.repo.save.mockRejectedValue(new Error("db down"));
    expect((await service.create(SERVICE, input, USER)).id).toBe(SAILING);
  });

  it("marks the rows below the service's minimum on the sailing's earnings, and none it cannot judge", async () => {
    const [rich, poor, unpriced, unrated] = [shipment(), shipment(), shipment(), shipment()];
    repo.boxShipments.mockResolvedValue([rich, poor, unpriced, unrated]);
    // 2 W/M each (2 cbm): 50,000 CZK at 25 is 1,000 EUR per W/M; 5,000 CZK is 100.
    invoicing._internalCoLoadingMoney.mockResolvedValue({
      items: [
        money(rich.id, 50000),
        money(poor.id, 5000),
        { ...money(unpriced.id, 0), sellingLines: 0 },
        { ...money(unrated.id, 5000), missingCurrencies: ["USD"] },
      ],
    });
    services.money.mockResolvedValue({ defaultBoxCosts: null, minEarningPerWm: 500 });
    const earnings = await service.earnings(SAILING, COMPANY);
    expect(earnings).toMatchObject({ minEarningPerWm: 500, belowFloor: 1 });
    expect(earnings.rows.filter((r) => r.belowFloor).map((r) => r.shipmentId)).toEqual([poor.id]);
  });
});

describe("the box's \"told that it is over\" mark follows every change of the box (Council Outlay 14, C4)", () => {
  const A = "00000000-0000-4000-8000-0000000000d1";
  // A 40' HC is planned to about 65 cbm: 70 cbm is over in one container, within in two.
  const big = () => shipment({ id: A, totalVolumeCbm: "70" });
  const svc = { id: SERVICE, name: "Import from Shanghai", serviceName: "ISHA", frequency: "weekly", mode: "sea_lcl", inlandWeightKg: null, closedAt: null };
  beforeEach(() => {
    repo.boxShipments.mockResolvedValue([big()]);
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [big()]]]));
  });

  it("is cleared, quietly, when Edit sailing gives the box room enough, and set when it takes the box over", async () => {
    const edited = sailing({ containerCount: 2, overNotified: true });
    repo.setDetailsRecorded.mockResolvedValue(edited);
    repo.get.mockResolvedValue(edited);
    await service.setDetails(SAILING, { containerCount: 2, cutoffDate: null }, MANAGER);
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
    const smaller = sailing({ containerCount: 1, overNotified: false });
    repo.setDetailsRecorded.mockResolvedValue(smaller);
    repo.get.mockResolvedValue(smaller);
    await service.setDetails(SAILING, { containerCount: 1, cutoffDate: null }, MANAGER);
    expect(repo.setOverNotified).toHaveBeenLastCalledWith(SAILING, COMPANY, true);
    expect(chat.post).not.toHaveBeenCalled();
  });

  it("is cleared when a shipment taken off, or deleted, brings the box back within its limits", async () => {
    repo.get.mockResolvedValue(sailing({ overNotified: true }));
    repo.boxShipments.mockResolvedValue([shipment({ totalVolumeCbm: "10" })]);
    repo.unlink.mockResolvedValue(true);
    await service.unlinkShipment(SAILING, A, USER);
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
    vi.clearAllMocks();
    repo.dropDeletedShipment.mockResolvedValue(SAILING);
    await service.shipmentDeleted(A, COMPANY, "u-user");
    expect(repo.dropDeletedShipment).toHaveBeenCalledWith(A, COMPANY, { id: "u-user", name: "Jana Nová" });
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
    // A shipment on no sailing leaves no box.
    vi.clearAllMocks();
    repo.dropDeletedShipment.mockResolvedValue(null);
    await service.shipmentDeleted(A, COMPANY);
    expect(repo.get).not.toHaveBeenCalled();
  });

  it("follows a service's new inland weight on its sailings still to come", async () => {
    services.setInlandWeight.mockResolvedValue({ ...svc, inlandWeightKg: 1000 });
    repo.comingOfServices.mockResolvedValue([sailing()]);
    repo.boxShipmentsOf.mockResolvedValue(new Map([[SAILING, [shipment({ totalWeightTons: "1.5" })]]]));
    expect(await service.setInlandWeight(SERVICE, 1000, COMPANY)).toMatchObject({ inlandWeightKg: 1000 });
    expect(services.setInlandWeight).toHaveBeenCalledWith(SERVICE, 1000, COMPANY);
    expect(repo.comingOfServices).toHaveBeenCalledWith([SERVICE], COMPANY, expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, true);
    expect(chat.post).not.toHaveBeenCalled();
  });

  it("follows the company's new planning share on the open services' sailings still to come", async () => {
    services.saveSettings.mockResolvedValue({ planningVolumePct: 100 });
    services.list.mockResolvedValue([svc]);
    services.planningVolumePct.mockResolvedValue(100);
    repo.comingOfServices.mockResolvedValue([sailing({ overNotified: true })]);
    expect(await service.savePlanningPct(100, MANAGER)).toMatchObject({ planningVolumePct: 100 });
    expect(services.saveSettings).toHaveBeenCalledWith(100, MANAGER);
    expect(services.list).toHaveBeenCalledWith(COMPANY, "user");
    // At 100% a 40' HC takes about 76 cbm: 70 is within.
    expect(repo.setOverNotified).toHaveBeenCalledWith(SAILING, COMPANY, false);
  });

  it("never fails the save when the boxes cannot be read", async () => {
    services.setInlandWeight.mockResolvedValue(svc);
    repo.comingOfServices.mockResolvedValue([sailing()]);
    repo.boxShipmentsOf.mockRejectedValue(new Error("db down"));
    await expect(service.setInlandWeight(SERVICE, null, COMPANY)).resolves.toMatchObject({ id: SERVICE });
  });
});

describe("the trend, the board's profits, the box for the planner and a plan's reference: what is read", () => {
  const svc = { id: SERVICE, name: "Import from Shanghai", serviceName: "ISHA", frequency: "weekly", mode: "sea_lcl", inlandWeightKg: null, closedAt: null, origin: "", destination: "", note: "" };
  beforeEach(() => {
    repo.boxShipmentsOf.mockResolvedValue(new Map());
    boxCosts.repo.listOf.mockResolvedValue([]);
  });

  it("works out the trend from the last eight sailings that left only, the oldest first (B5)", async () => {
    const left = Array.from({ length: 10 }, (_, i) => sailing({ id: `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`, vessel: `WEEK ${i + 1}`, departureDate: `2025-0${Math.floor(i / 3) + 1}-1${i % 3}` }));
    repo.listByService.mockResolvedValue([sailing({ id: OTHER, vessel: "WEEK 60", departureDate: "2099-01-01" }), ...left]);
    const trend = await service.trend(SERVICE, COMPANY);
    expect(trend.sailings.map((s) => s.name)).toEqual(["WEEK 3", "WEEK 4", "WEEK 5", "WEEK 6", "WEEK 7", "WEEK 8", "WEEK 9", "WEEK 10"]);
    const read = repo.boxShipmentsOf.mock.calls[0]![0] as string[];
    expect(read).toHaveLength(8);
    expect(read).not.toContain(OTHER);
    expect(boxCosts.repo.listOf).toHaveBeenCalledWith(read, COMPANY);
  });

  it("works out the board's profits for the sailings still to come only, together", async () => {
    services.list.mockResolvedValue([svc]);
    repo.comingOfServices.mockResolvedValue([sailing()]);
    const profits = await service.boardProfits(COMPANY);
    expect(profits.map((p) => p.sailingId)).toEqual([SAILING]);
    expect(repo.listByService).not.toHaveBeenCalled();
    expect(repo.boxShipmentsOf).toHaveBeenCalledWith([SAILING], COMPANY);
    expect(boxCosts.repo.listOf).toHaveBeenCalledWith([SAILING], COMPANY);
  });

  it("gives the planner the box's counted shipments under their job numbers, the cancelled left out (C1)", async () => {
    services.get.mockResolvedValue(svc);
    repo.boxShipments.mockResolvedValue([shipment({ jobNumber: "CZLCL2", pcs: "4", totalWeightTons: "2" }), shipment({ jobNumber: "CZLCL1", status: "Cancelled Shipment" })]);
    const cargo = await service.planCargo(SAILING, COMPANY);
    expect(repo.boxShipments).toHaveBeenCalledWith(SAILING, COMPANY);
    expect(cargo).toMatchObject({ sailingId: SAILING, serviceId: SERVICE, reference: "WEEK 51 · Import from Shanghai", containerType: "40' HC", containerCount: 1 });
    expect(cargo.shipments).toMatchObject([{ jobNumber: "CZLCL2", totalsOnly: true, lines: [{ pieces: 4, weightPerPcKg: 500 }] }]);
    repo.get.mockResolvedValue(null);
    await expect(service.planCargo(SAILING, COMPANY)).rejects.toMatchObject({ code: "not_found" });
  });

  it("names a plan's sailing without its service when the service is not found, and fails when the service cannot be read", async () => {
    services.get.mockRejectedValue(APIError.notFound("Service not found"));
    expect(await service.referenceOf(SAILING, COMPANY)).toBe("WEEK 51");
    services.get.mockRejectedValue(new Error("db down"));
    await expect(service.referenceOf(SAILING, COMPANY)).rejects.toThrow("db down");
    repo.get.mockResolvedValue(null);
    expect(await service.referenceOf(SAILING, COMPANY)).toBeNull();
  });
});
