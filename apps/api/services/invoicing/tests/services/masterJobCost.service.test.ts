import { beforeEach, describe, expect, it, vi } from "vitest";

// A master job's Costs Breakdown run for real - the split, which shipment carries what, and the
// rows handed to the write - against stand-ins for the shipments service and the repositories.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn() } }));
const houses = vi.hoisted(() => vi.fn());
const ratesOn = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ shipments: { _internalMasterJobHouses: houses }, fx: { fxRatesOn: ratesOn } }));
const costs = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), get: vi.fn(), update: vi.fn(), softDelete: vi.fn(), replaceSplitRows: vi.fn() }));
vi.mock("../../repositories/masterJobCost.repository", () => ({ masterJobCostRepository: costs }));
const lines = vi.hoisted(() => ({ quotePricedAmong: vi.fn() }));
vi.mock("../../repositories/invoiceCost.repository", () => ({ invoiceCostRepository: lines }));
const trucking = vi.hoisted(() => ({ keptBuyingCodes: vi.fn() }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesRepository: trucking }));
const keptByTrucking = vi.hoisted(() => vi.fn());
// The cleaning of a buying line is the shipment's own (tested there); here it passes the fields on.
vi.mock("../../services/invoicing.service", () => ({
  assertNotKeptByTrucking: keptByTrucking,
  buyingChanges: (input: Record<string, unknown>) => ({ ...input }),
}));

import { APIError } from "../../../../lib/tests/encoreApi.stub";
import type { SplitRowValues } from "../../repositories/masterJobCost.repository";
import { masterJobCostService } from "../../services/masterJobCost.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const MASTER = "3d55a500-d6f8-4def-8e95-82e77493cabb";
const LINE = "9a1c6f8e-2b7d-4c1e-8f3a-5d6b7c8e9f01";

const HOUSES = [
  { shipmentId: "s1", jobNumber: "CZ00000021", freightTon: 2 },
  { shipmentId: "s2", jobNumber: "CZ00000022", freightTon: 1 },
];
const line = (over: Record<string, unknown> = {}) => ({
  id: LINE, masterJobId: MASTER, category: "ocean_freight", description: "", vendor: "Maersk", estQty: null, estAmount: "300.00",
  estCurrency: "EUR", realQty: null, realAmount: "330.00", realCurrency: "EUR", invoiceNumber: "", received: false, splitMethod: "wm",
  inSplit: true, excludedShipmentIds: [], sortOrder: 0, ...over,
});

// The rows the re-split writes: worked out by the callback the repository runs under its lock.
let written: SplitRowValues[] = [];

beforeEach(() => {
  vi.resetAllMocks();
  written = [];
  houses.mockResolvedValue({ houses: HOUSES });
  costs.list.mockResolvedValue([line()]);
  costs.replaceSplitRows.mockImplementation(async (_company: string, _master: string, compute: () => Promise<SplitRowValues[]>) => {
    written = await compute();
  });
  lines.quotePricedAmong.mockResolvedValue(new Set());
  trucking.keptBuyingCodes.mockResolvedValue(new Set());
  ratesOn.mockResolvedValue({ rates: [{ currency: "EUR", rate: 25 }] });
});

describe("re-splitting a master job's costs", () => {
  it("writes each shipment's share of every line by W/M, tagged with the line, after the shipment's own lines", async () => {
    const view = await masterJobCostService.resplit(COMPANY, MASTER);
    expect(written).toEqual([
      expect.objectContaining({ shipmentId: "s1", estAmount: "200.00", realAmount: "220.00", sourceMasterJobRef: `master:${MASTER}:${LINE}`, lineSort: 0 }),
      expect.objectContaining({ shipmentId: "s2", estAmount: "100.00", realAmount: "110.00", sourceMasterJobRef: `master:${MASTER}:${LINE}`, lineSort: 0 }),
    ]);
    // The view answers the shares exactly as they were written.
    expect(view.shares).toEqual([
      { lineId: LINE, shipmentId: "s1", est: "200.00", real: "220.00" },
      { lineId: LINE, shipmentId: "s2", est: "100.00", real: "110.00" },
    ]);
  });

  it("gives a shipment priced from a quote the real part only, and nothing of a line that has only an estimate", async () => {
    lines.quotePricedAmong.mockResolvedValue(new Set(["s2"]));
    costs.list.mockResolvedValue([line(), line({ id: "estimate-only", realAmount: null, sortOrder: 1 })]);
    await masterJobCostService.resplit(COMPANY, MASTER);
    expect(written.map((r) => [r.shipmentId, r.sourceMasterJobRef?.endsWith(LINE) ? "line" : "estimate-only", r.estAmount, r.realAmount])).toEqual([
      ["s1", "line", "200.00", "220.00"],
      ["s2", "line", null, "110.00"],
      ["s1", "estimate-only", "200.00", null],
    ]);
  });

  it("leaves out the share of a shipment whose cost of that code Trucking keeps (the haulier's cost would count twice)", async () => {
    costs.list.mockResolvedValue([line({ category: "road_freight" })]);
    // A "pickup" Trucking keeps is the same haulier cost as "road_freight".
    trucking.keptBuyingCodes.mockResolvedValue(new Set(["s1 pickup"]));
    await masterJobCostService.resplit(COMPANY, MASTER);
    expect(written.map((r) => r.shipmentId)).toEqual(["s2"]);
  });

  it("writes no rows when there is nothing to split by, so the shares that were there go", async () => {
    houses.mockResolvedValue({ houses: [{ ...HOUSES[0]!, freightTon: 0 }] });
    await masterJobCostService.resplit(COMPANY, MASTER);
    expect(costs.replaceSplitRows).toHaveBeenCalledTimes(1);
    expect(written).toEqual([]);
  });
});

describe("the master job's costs against their estimates", () => {
  it("come with the view, each line and the whole master job, at today's ČNB rates", async () => {
    costs.list.mockResolvedValue([line(), line({ id: "czk", estAmount: "1000.00", estCurrency: "CZK", realAmount: "900.00", realCurrency: "CZK" })]);
    const view = await masterJobCostService.view(COMPANY, MASTER);
    expect(view.vsEstimate).toEqual({ [LINE]: { delta: 30, currency: "EUR" }, czk: { delta: -100, currency: "CZK" } });
    // Two currencies: totalled in CZK (30 EUR at 25 = 750 CZK, less 100 CZK).
    expect(view.totalVsEstimate).toEqual({ delta: 650, currency: "CZK" });
  });

  it("compare lines in one currency only when today's rates can't be read", async () => {
    ratesOn.mockRejectedValue(new Error("fx is unreachable"));
    costs.list.mockResolvedValue([line({ realCurrency: "CZK" })]);
    const view = await masterJobCostService.view(COMPANY, MASTER);
    expect(view.vsEstimate).toEqual({});
    expect(view.totalVsEstimate).toBeNull();
  });
});

describe("a master job's cost lines", () => {
  it("are added only when Trucking keeps the line's code on none of the shipments that would carry a part", async () => {
    keptByTrucking.mockRejectedValueOnce(APIError.failedPrecondition("Job CZ00000021 has its road freight cost from Trucking"));
    await expect(masterJobCostService.add(COMPANY, MASTER, { category: "road_freight" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(keptByTrucking).toHaveBeenCalledWith(COMPANY, ["s1", "s2"], "road_freight");
    expect(costs.create).not.toHaveBeenCalled();

    await masterJobCostService.add(COMPANY, MASTER, { category: "ocean_freight", splitMethod: "shipment" });
    expect(costs.create).toHaveBeenCalledWith(COMPANY, MASTER, { category: "ocean_freight", splitMethod: "shipment" });
    expect(costs.replaceSplitRows).toHaveBeenCalledTimes(1);
  });

  it("report a line that is not there, an id that is no id included, without writing", async () => {
    await expect(masterJobCostService.update(COMPANY, MASTER, "not-an-id", { vendor: "X" })).rejects.toMatchObject({ code: "not_found" });
    costs.get.mockResolvedValue(null);
    await expect(masterJobCostService.update(COMPANY, MASTER, LINE, { vendor: "X" })).rejects.toMatchObject({ code: "not_found" });
    costs.softDelete.mockResolvedValue(false);
    await expect(masterJobCostService.remove(COMPANY, MASTER, LINE)).rejects.toMatchObject({ code: "not_found" });
    expect(costs.update).not.toHaveBeenCalled();
    expect(costs.replaceSplitRows).not.toHaveBeenCalled();
  });

  it("refuse a split method other than by W/M or per shipment", async () => {
    await expect(masterJobCostService.add(COMPANY, MASTER, { splitMethod: "weight" as never })).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("choosing the shipments in a line's split", () => {
  beforeEach(() => {
    costs.get.mockResolvedValue(line());
    costs.update.mockResolvedValue(line());
  });

  it("gives a shipment taken out no part, and the others the whole line", async () => {
    costs.list.mockResolvedValue([line({ excludedShipmentIds: ["s1"] })]);
    const view = await masterJobCostService.resplit(COMPANY, MASTER);
    expect(written).toEqual([expect.objectContaining({ shipmentId: "s2", estAmount: "300.00", realAmount: "330.00" })]);
    expect(view.lines[0]!.excludedShipmentIds).toEqual(["s1"]);
  });

  it("saves the shipments left out, keeping only those linked, and splits again", async () => {
    await masterJobCostService.update(COMPANY, MASTER, LINE, { excludedShipmentIds: ["s1", "s1", "gone"] });
    expect(costs.update).toHaveBeenCalledWith(LINE, COMPANY, MASTER, { excludedShipmentIds: ["s1"] });
    expect(costs.replaceSplitRows).toHaveBeenCalledTimes(1);
  });

  it("keeps at least one shipment in the split", async () => {
    await expect(masterJobCostService.update(COMPANY, MASTER, LINE, { excludedShipmentIds: ["s1", "s2"] })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(costs.update).not.toHaveBeenCalled();
  });

  it("refuses a list that is no list", async () => {
    await expect(masterJobCostService.update(COMPANY, MASTER, LINE, { excludedShipmentIds: "s1" as never })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(costs.update).not.toHaveBeenCalled();
  });

  it("checks Trucking only for a shipment put back in, so taking another out still works", async () => {
    await masterJobCostService.update(COMPANY, MASTER, LINE, { excludedShipmentIds: ["s1"] });
    expect(keptByTrucking).toHaveBeenCalledWith(COMPANY, [], "ocean_freight");

    keptByTrucking.mockClear();
    costs.get.mockResolvedValue(line({ excludedShipmentIds: ["s1"] }));
    keptByTrucking.mockRejectedValueOnce(APIError.failedPrecondition("Job CZ00000021 has its ocean freight cost from Trucking"));
    await expect(masterJobCostService.update(COMPANY, MASTER, LINE, { excludedShipmentIds: [] })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(keptByTrucking).toHaveBeenCalledWith(COMPANY, ["s1"], "ocean_freight");
  });

  it("checks a new split method over the shipments left in only", async () => {
    costs.get.mockResolvedValue(line({ excludedShipmentIds: ["s1"] }));
    await masterJobCostService.update(COMPANY, MASTER, LINE, { splitMethod: "shipment" });
    expect(keptByTrucking).toHaveBeenCalledWith(COMPANY, ["s2"], "ocean_freight");
  });

  it("takes no shipments out when a line is added", async () => {
    await masterJobCostService.add(COMPANY, MASTER, { category: "ocean_freight" });
    expect(costs.create).toHaveBeenCalledWith(COMPANY, MASTER, { category: "ocean_freight" });
  });
});

describe("choosing which of the costs go through the split", () => {
  beforeEach(() => {
    costs.get.mockResolvedValue(line());
    costs.update.mockResolvedValue(line());
  });

  it("writes no shipment a share of a line out of the split, and keeps the line in the view", async () => {
    const other = line({ id: "9a1c6f8e-2b7d-4c1e-8f3a-5d6b7c8e9f02", inSplit: false });
    costs.list.mockResolvedValue([line(), other]);
    const view = await masterJobCostService.resplit(COMPANY, MASTER);
    expect(written.map((r) => r.sourceMasterJobRef)).toEqual([`master:${MASTER}:${LINE}`, `master:${MASTER}:${LINE}`]);
    expect(view.shares.every((s) => s.lineId === LINE)).toBe(true);
    expect(view.lines.map((l) => l.inSplit)).toEqual([true, false]);
  });

  it("saves the choice and splits again", async () => {
    await masterJobCostService.update(COMPANY, MASTER, LINE, { inSplit: false });
    expect(costs.update).toHaveBeenCalledWith(LINE, COMPANY, MASTER, { inSplit: false });
    expect(costs.replaceSplitRows).toHaveBeenCalledTimes(1);
  });

  it("checks Trucking when a line goes in, not when it comes out", async () => {
    await masterJobCostService.update(COMPANY, MASTER, LINE, { inSplit: false });
    expect(keptByTrucking).not.toHaveBeenCalled();

    costs.get.mockResolvedValue(line({ inSplit: false }));
    keptByTrucking.mockRejectedValueOnce(APIError.failedPrecondition("Job CZ00000021 has its ocean freight cost from Trucking"));
    await expect(masterJobCostService.update(COMPANY, MASTER, LINE, { inSplit: true })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(keptByTrucking).toHaveBeenCalledWith(COMPANY, ["s1", "s2"], "ocean_freight");
  });

  it("lets a line out of the split change its code without a Trucking check", async () => {
    costs.get.mockResolvedValue(line({ inSplit: false }));
    await masterJobCostService.update(COMPANY, MASTER, LINE, { category: "road_freight" });
    expect(keptByTrucking).not.toHaveBeenCalled();
  });
});
