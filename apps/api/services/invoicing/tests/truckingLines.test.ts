import { beforeEach, describe, expect, it, vi } from "vitest";

// The Trucking push into Costs Breakdown: the rows it writes, the issued-invoice rule, and the
// service handing a whole set to the repository (which replaces it in one transaction).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { replace: vi.fn(async () => ({ buying: 0, selling: 0, sellingKept: 0 })) } }));

import { truckingLinesRepository } from "../repositories/truckingLines.repository";
import { truckingLinesService } from "../services/truckingLines.service";
import {
  checkLines,
  checkSourceRef,
  differenceRef,
  differencesOf,
  matchRealLines,
  nextDifferenceNumber,
  planBuyingReplace,
  sellingDifference,
  sellingReplaceable,
  truckingBuyingRow,
  truckingSellingRow, sameCostCodes } from "../utils/truckingLines.utils";
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
  it("takes only Trucking's own sourceRefs", () => {
    expect(checkSourceRef(`trucking:trip:${TRIP}`)).toBe(`trucking:trip:${TRIP}`);
    for (const ref of [`trucking:consignment:${TRIP}`, `trucking:leg:${TRIP}`, `trucking:internal:${TRIP}`, `trucking:exception:${TRIP}`, `trucking:trip:${TRIP}:job:${TRIP}`]) {
      expect(checkSourceRef(ref)).toBe(ref);
    }
    expect(() => checkSourceRef("trucking:quote:1")).toThrow();
    expect(() => checkSourceRef(`trucking:internal:${TRIP}:job:${TRIP}`)).toThrow();
    expect(() => checkSourceRef("QCZ2026")).toThrow();
  });

  it("fills the real side of a line pushed with its real amount and document (the internal line), received", () => {
    const [checked] = checkLines([line({ vendor: "Trucking (internal)", haulierId: null, realAmount: 4200, invoiceNumber: " ICZ20260001 " })], "buying");
    expect(truckingBuyingRow(checked!)).toMatchObject({ estAmount: "9000.00", realAmount: "4200.00", invoiceNumber: "ICZ20260001", received: true, vendor: "Trucking (internal)" });
    const [open] = checkLines([line({ realAmount: 4200 })], "buying");
    expect(truckingBuyingRow(open!)).not.toHaveProperty("received");
    expect(truckingBuyingRow(open!)).toMatchObject({ realAmount: "4200.00" });
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
    expect(truckingLinesRepository.replace).toHaveBeenCalledWith(C, S, `trucking:trip:${TRIP}`, [expect.objectContaining({ estCurrency: "CZK", vendor: "Bravo Trans" })], [], "Price change after invoice");
    await truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [], selling: [], differenceLabel: "TCZ2026000001 · Price change after invoice" });
    expect(truckingLinesRepository.replace).toHaveBeenLastCalledWith(C, S, `trucking:trip:${TRIP}`, [], [], "TCZ2026000001 · Price change after invoice");
  });

  describe("a price change after the invoice is billed as its own difference line (decision 9)", () => {
    const ref = `trucking:consignment:${TRIP}`;
    const kept = (qty: string | null, amount: string, currency = "CZK") => ({ qty, amount, currency });

    it("works out the difference per currency: the new lines less what the kept rows and earlier differences bill", () => {
      // Invoiced: 10 000 freight + 1 200 fuel; repriced to 12 000 + 1 440 → +2 240.
      expect(sellingDifference([kept("1.00", "10000.00"), kept("1.00", "1200.00")], [kept("1.00", "12000.00"), kept("1.00", "1440.00")])).toEqual([{ currency: "CZK", amount: 2240 }]);
      // A later re-price counts the first difference as billed already.
      expect(sellingDifference([kept("1.00", "10000.00"), kept("1.00", "2240.00")], [kept("1.00", "11000.00")])).toEqual([{ currency: "CZK", amount: -1240 }]);
      // A cancel after invoicing: the whole kept price comes back as a negative line; the same push again changes nothing.
      expect(sellingDifference([kept("2.00", "480.50", "EUR")], [])).toEqual([{ currency: "EUR", amount: -961 }]);
      expect(sellingDifference([kept(null, "500.00")], [kept("1.00", "500.00")])).toEqual([]);
    });

    it("numbers difference lines after any the set ever had, and answers the live ones per ref and currency", () => {
      expect(nextDifferenceNumber(ref, [null, ref, `${ref}:diff:1`, `${ref}:diff:3`, `trucking:consignment:other:diff:9`])).toBe(4);
      expect(nextDifferenceNumber(ref, [])).toBe(1);
      expect(differenceRef(ref, 2)).toBe(`${ref}:diff:2`);
      expect(differencesOf([{ ref, qty: "1.00", amount: "10000.00", currency: "CZK" }, { ref: `${ref}:diff:1`, qty: "1.00", amount: "-1240.00", currency: "CZK" }], ref)).toEqual([
        { sourceRef: `${ref}:diff:1`, currency: "CZK", amount: -1240 },
      ]);
    });
  });

  it("refuses a bad shipment id, currency or amount before writing", async () => {
    const push = { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [line()], selling: [] };
    await expect(truckingLinesService.replace(C, { ...push, shipmentId: "x" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(truckingLinesService.replace(C, { ...push, buying: [line({ currency: "Kč" })] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(truckingLinesService.replace(C, { ...push, buying: [line({ unitPrice: Number.NaN })] })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(truckingLinesRepository.replace).not.toHaveBeenCalled();
  });

  describe("a re-push keeps the real side of buying rows", () => {
    const real = { realQty: "1.00", realAmount: "8800.00", realCurrency: "CZK", invoiceNumber: "FV-77", received: true };
    const open = { realQty: "1.00", realAmount: null, realCurrency: "CZK", invoiceNumber: "", received: false };
    const row = (description: string, over: Record<string, unknown> = {}) => ({ ...truckingBuyingRow(line({ description })), ...over });

    it("carries the real cost over to the row with the same description (a new estimate keeps the approved real)", () => {
      const plan = planBuyingReplace([{ id: "a", description: "LCZ1 · Freight", ...real }], [row("LCZ1 · Freight", { estAmount: "9500.00" })]);
      expect(plan.rows[0]).toMatchObject({ estAmount: "9500.00", realAmount: "8800.00", invoiceNumber: "FV-77", received: true });
      expect(plan.keep).toEqual([]);
    });

    it("else by position; a row that brings its own real amount keeps it", () => {
      const byPosition = planBuyingReplace([{ id: "a", description: "old text", ...real }], [row("new text")]);
      expect(byPosition.rows[0]).toMatchObject({ realAmount: "8800.00" });
      const own = planBuyingReplace([{ id: "a", description: "x", ...real }], [row("x", { realAmount: "4200.00", invoiceNumber: "ICZ20260001" })]);
      expect(own.rows[0]).toMatchObject({ realAmount: "4200.00", invoiceNumber: "ICZ20260001" });
    });

    it("keeps a row with a real cost that no new row takes over (a cancel), and lets estimate-only rows go", () => {
      const plan = planBuyingReplace(
        [
          { id: "a", description: "LCZ1 · Freight", ...real },
          { id: "b", description: "LCZ1 · Fuel", ...open },
        ],
        [],
      );
      expect(plan.rows).toEqual([]);
      expect(plan.keep).toEqual(["a"]);
      // Nothing new carries an estimate: the kept row keeps its own.
      expect(plan.clearEstimate).toEqual([]);
      expect(planBuyingReplace([{ id: "b", description: "LCZ1 · Fuel", ...open }], []).keep).toEqual([]);
    });

    it("clears the estimate of a kept row when new rows carry the estimate: the job's estimate is not counted twice", () => {
      const plan = planBuyingReplace(
        [
          { id: "a", description: "LCZ1 · Freight", ...real },
          { id: "b", description: "LCZ1 · Fuel", ...real, realAmount: "1200.00" },
        ],
        [row("LCZ1 · Agreed price")],
      );
      expect(plan.rows[0]).toMatchObject({ realAmount: "8800.00" });
      expect(plan.keep).toEqual(["b"]);
      expect(plan.clearEstimate).toEqual(["b"]);
    });
  });

  describe("the real side lands on the right rows also when a re-push kept rows (counts differ)", () => {
    const r = (id: string, description: string, realAmount: string | null = null, invoiceNumber = "") => ({ id, description, realAmount, invoiceNumber });
    const l = (amount: number, over: Record<string, unknown> = {}) => ({ amount, currency: "CZK", invoiceNumber: "FV-9", ...over });

    it("matches by description first, then by position (rows of another invoice last)", () => {
      const plan = matchRealLines([r("a", "LCZ1 · Freight", "8800.00", "FV-1"), r("b", "LCZ1 · Agreed price"), r("c", "LCZ1 · Fuel")], [l(500, { description: "LCZ1 · Fuel" }), l(9000)])!;
      expect([...plan.set.entries()].map(([id, x]) => [id, x.amount])).toEqual([["c", 500], ["b", 9000]]);
      expect(plan.clear).toEqual([]);
    });

    it("puts extra lines onto the last row of their currency; clears rows of the same invoice nothing took", () => {
      const plan = matchRealLines([r("a", "x", "100.00", "FV-9"), r("b", "y", "200.00", "FV-9")], [l(9000), l(1000), l(500)])!;
      expect([...plan.set.entries()].map(([id, x]) => [id, x.amount])).toEqual([["a", 9000], ["b", 1500]]);
      const fewer = matchRealLines([r("a", "x"), r("b", "y", "200.00", "FV-9"), r("c", "z", "300.00", "FV-1")], [l(9000)])!;
      expect([...fewer.set.keys()]).toEqual(["a"]);
      expect(fewer.clear).toEqual(["b"]);
    });

    it("clears every row without lines; null when there is no row, or no row in an extra line's currency", () => {
      expect(matchRealLines([r("a", "x", "1.00", "FV-1")], [])).toEqual({ set: new Map(), clear: ["a"] });
      expect(matchRealLines([], [l(1)])).toBeNull();
      expect(matchRealLines([r("a", "x")], [l(1), l(2, { currency: "EUR" })])).toBeNull();
    });
  });
});

describe("costs counted as one", () => {
  it("treats the road codes as the same cost, any other code alone", () => {
    expect(sameCostCodes("pickup").sort()).toEqual(["delivery", "freight", "pickup", "road_freight"]);
    expect(sameCostCodes("road_freight")).toContain("freight");
    expect(sameCostCodes("customs")).toEqual(["customs"]);
  });
});
