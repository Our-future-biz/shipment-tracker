import { beforeEach, describe, expect, it, vi } from "vitest";

// A master job's Costs Breakdown run for real - the split, which shipment carries what, and the
// rows handed to the write - against stand-ins for the shipments service and the repositories.
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
const houses = vi.hoisted(() => vi.fn());
vi.mock("~encore/clients", () => ({ shipments: { _internalMasterJobHouses: houses } }));
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
  sortOrder: 0, ...over,
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
    expect(written.map((r) => [r.shipmentId, r.sourceMasterJobRef.endsWith(LINE) ? "line" : "estimate-only", r.estAmount, r.realAmount])).toEqual([
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
