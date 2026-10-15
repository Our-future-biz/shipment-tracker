import { beforeEach, describe, expect, it, vi } from "vitest";

// The Trucking push into Costs Breakdown: the rows it writes, the issued-invoice rule, and the
// service handing a whole set to the repository (which replaces it in one transaction).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { replace: vi.fn(async () => ({ buying: 0, selling: 0, sellingKept: 0 })) } }));

import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { truckingLinesService } from "../services/truckingLines.service";
import { checkSourceRef, sellingReplaceable, truckingBuyingRow, truckingSellingRow } from "../utils/truckingLines.utils";
import type { TruckingCostLine } from "../interfaces/interfaces";

const C = "00000000-0000-0000-0000-000000000001";
const S = "00000000-0000-0000-0000-0000000000d1";
const TRIP = "00000000-0000-0000-0000-0000000000f1";
const line = (over: Partial<TruckingCostLine> = {}): TruckingCostLine => ({
  chargeCode: "road_freight",
  description: "LCZ2026000001 · Freight",
  qty: 1,
  unit: "trip",
  unitPrice: 9000,
  amount: 9000,
  currency: "czk",
  vendor: "Bravo Trans",
  haulierId: "00000000-0000-0000-0000-0000000000a1",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("Trucking lines in Costs Breakdown", () => {
  it("takes only trucking:consignment:<id> / trucking:trip:<id>", () => {
    expect(checkSourceRef(`trucking:trip:${TRIP}`)).toBe(`trucking:trip:${TRIP}`);
    expect(() => checkSourceRef("trucking:quote:1")).toThrow();
    expect(() => checkSourceRef("QCZ2026")).toThrow();
  });

  it("writes a buying row as the estimate (qty × unit price) with the haulier, a selling row ticked for invoicing", () => {
    expect(truckingBuyingRow(line({ currency: "CZK" }))).toEqual({
      category: "road_freight",
      description: "LCZ2026000001 · Freight",
      estQty: "1.00",
      estAmount: "9000.00",
      estCurrency: "CZK",
      realQty: "1.00",
      realCurrency: "CZK",
      unit: "trip",
      vendor: "Bravo Trans",
      haulierId: "00000000-0000-0000-0000-0000000000a1",
    });
    expect(truckingSellingRow(line({ currency: "EUR", unitPrice: 480.5 }), "TCZ · Freight")).toMatchObject({ qty: "1.00", amount: "480.50", currency: "EUR", invoice: true, customer: "TCZ · Freight" });
  });

  it("never replaces selling rows already on an issued invoice: the whole side stays", () => {
    expect(sellingReplaceable(["a", "b"], new Set())).toEqual({ replace: true, kept: 0 });
    expect(sellingReplaceable(["a", "b"], new Set(["b", "x"]))).toEqual({ replace: false, kept: 2 });
    expect(sellingReplaceable([], new Set(["x"]))).toEqual({ replace: true, kept: 0 });
  });

  it("hands the whole set to the repository; empty lists remove it (a cancel)", async () => {
    await truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [line()], selling: [] });
    expect(truckingLinesRepository.replace).toHaveBeenCalledWith(C, S, `trucking:trip:${TRIP}`, [expect.objectContaining({ estCurrency: "CZK", vendor: "Bravo Trans" })], []);
    await truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [], selling: [] });
    expect(truckingLinesRepository.replace).toHaveBeenLastCalledWith(C, S, `trucking:trip:${TRIP}`, [], []);
  });

  it("refuses a bad shipment id, currency or amount before writing", async () => {
    const push = { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [line()], selling: [] };
    await expect(truckingLinesService.replace(C, { ...push, shipmentId: "x" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(truckingLinesService.replace(C, { ...push, buying: [line({ currency: "Kč" })] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(truckingLinesService.replace(C, { ...push, buying: [line({ unitPrice: Number.NaN })] })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(truckingLinesRepository.replace).not.toHaveBeenCalled();
  });
});
