import { beforeEach, describe, expect, it, vi } from "vitest";

// The Trucking push into Costs Breakdown: the rows it writes, the issued-invoice rule, and the
// service handing a whole set to the repository (which replaces it in one transaction).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("../repositories/truckingLines.repository", () => ({ truckingLinesRepository: { replace: vi.fn(async () => ({ buying: 0, selling: 0, sellingKept: 0 })) } }));
// The shipment a push is for, as Shipments answers it (company-scoped, live only).
const shipments = vi.hoisted(() => ({ shipmentGet: vi.fn(async (_req: { shipmentId: string }) => ({ shipment: { jobNumber: "CZ00000028" } })) }));
vi.mock("~encore/clients", () => ({ shipments }));
// What a push owes the job's statuses (services/sellingStatusFollow): its hook, and the send after the commit.
const follow = vi.hoisted(() => ({ steps: [] as string[], afterSet: async () => undefined, after: async () => undefined, deliver: async () => undefined }));
vi.mock("../services/sellingStatusFollow", () => ({
  statusesFollow: (_companyId: string, shipmentId: string) => {
    follow.steps.push(`hook for ${shipmentId}`);
    return { after: follow.after, afterSet: follow.afterSet, deliver: async () => void follow.steps.push("deliver") };
  },
}));

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
  truckingSellingRow, sameCostCodes,
  comesToNothing,
  isDifferenceOf,
  planDifference,
  pricedOnQuote,
  setRefOf,
  anchoredQuoteRowOf,
  creditSetsOf,
  firstAddedLike,
  firstAddedOf,
  isQuoteAnchor,
  quoteAnchorRef,
  quoteAnchorRow } from "../utils/truckingLines.utils";
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
    expect(truckingLinesRepository.replace).toHaveBeenCalledWith(C, S, `trucking:trip:${TRIP}`, [expect.objectContaining({ estCurrency: "CZK", vendor: "Bravo Trans" })], [], "Price change after invoice", follow.afterSet);
    await truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [], selling: [], differenceLabel: "TCZ2026000001 · Price change after invoice" });
    expect(truckingLinesRepository.replace).toHaveBeenLastCalledWith(C, S, `trucking:trip:${TRIP}`, [], [], "TCZ2026000001 · Price change after invoice", follow.afterSet);
  });

  it("hands the push the shipment's status hook, and sends what it owes once the push has committed", async () => {
    follow.steps.length = 0;
    vi.mocked(truckingLinesRepository.replace).mockImplementationOnce(async () => {
      follow.steps.push("push");
      return { buying: 0, selling: 1, sellingKept: 0, differences: [] };
    });
    await truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:consignment:${TRIP}`, buying: [], selling: [line()] });
    expect(follow.steps).toEqual([`hook for ${S}`, "push", "deliver"]);
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

  it("refuses a push for a shipment deleted meanwhile, whose rows were retired with it", async () => {
    const { APIError } = await import("../../../lib/tests/encoreApi.stub");
    shipments.shipmentGet.mockRejectedValueOnce(APIError.notFound("Shipment not found"));
    await expect(truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [line()], selling: [] })).rejects.toMatchObject({ code: "not_found" });
    expect(shipments.shipmentGet).toHaveBeenCalledWith({ shipmentId: S });
    expect(truckingLinesRepository.replace).not.toHaveBeenCalled();
    // Shipments down is not "deleted": the push fails as it is, and Trucking's outbox tries again.
    shipments.shipmentGet.mockRejectedValueOnce(APIError.unavailable("shipments is down"));
    await expect(truckingLinesService.replace(C, { shipmentId: S, sourceRef: `trucking:trip:${TRIP}`, buying: [line()], selling: [] })).rejects.toMatchObject({ code: "unavailable" });
    expect(truckingLinesRepository.replace).not.toHaveBeenCalled();
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

describe("a set on an issued invoice, re-pushed (Y1 / P1, n8)", () => {
  const v = (amount: string, currency = "CZK") => ({ qty: "1.00", amount, currency });

  it("replaces the difference lines on nothing yet with one per currency: lowered, put back, raised, the same again", () => {
    const fixed = [v("1000")];
    expect(planDifference(fixed, [], [v("950")])).toEqual({ write: true, difference: [{ currency: "CZK", amount: -50 }] });
    // Put back to the invoiced price: the open −50 goes, nothing comes (never +50 beside it).
    expect(planDifference(fixed, [v("-50")], [v("1000")])).toEqual({ write: true, difference: [] });
    expect(planDifference(fixed, [v("-50")], [v("1100")])).toEqual({ write: true, difference: [{ currency: "CZK", amount: 100 }] });
    // The same push again: the open line is that difference already.
    expect(planDifference(fixed, [v("100")], [v("1100")])).toEqual({ write: false, difference: [{ currency: "CZK", amount: 100 }] });
    expect(planDifference(fixed, [], [v("1000")])).toEqual({ write: false, difference: [] });
    // An old +50 and −50 left open: folded to nothing.
    expect(planDifference(fixed, [v("50"), v("-50")], [v("1000")]).write).toBe(true);
  });

  it("prices a consignment on the quote's invoiced road line only when it has no rows of its own and no other consignment is priced (n8)", () => {
    const base = { sourceRef: "trucking:consignment:c1", ownRows: 0, differenceRows: 0, roadSelling: true, otherConsignments: false, invoicedQuoteRoad: 1 };
    expect(pricedOnQuote(base)).toBe(true);
    expect(pricedOnQuote({ ...base, ownRows: 1 })).toBe(false);
    expect(pricedOnQuote({ ...base, invoicedQuoteRoad: 0 })).toBe(false);
    expect(pricedOnQuote({ ...base, otherConsignments: true })).toBe(false);
    // Priced so before (difference lines only): it stays so, a cancel too.
    expect(pricedOnQuote({ ...base, roadSelling: false, otherConsignments: true, differenceRows: 1 })).toBe(true);
    expect(pricedOnQuote({ ...base, sourceRef: "trucking:internal:c1" })).toBe(false);
  });

  it("keeps a consignment priced on the quote line once it has a marker of it, whatever its price and whoever priced since (B1)", () => {
    const base = { sourceRef: "trucking:consignment:c1", ownRows: 0, differenceRows: 0, roadSelling: true, otherConsignments: false, invoicedQuoteRoad: 1 };
    // Priced exactly at the quote line: no difference line, only its marker - another consignment priced since changes nothing.
    expect(pricedOnQuote({ ...base, anchored: 1, otherConsignments: true })).toBe(true);
    // A cancel (no lines) of a set priced so: still priced on it, so the credit owed is the quote line's.
    expect(pricedOnQuote({ ...base, anchored: 1, roadSelling: false, otherConsignments: true })).toBe(true);
    // Its line no longer invoiced (credited): it bills on its own.
    expect(pricedOnQuote({ ...base, anchored: 1, invoicedQuoteRoad: 0 })).toBe(false);
    // Without a marker and with another consignment's rows (its marker counts): a second consignment is billed in full.
    expect(pricedOnQuote({ ...base, anchored: 0, otherConsignments: true })).toBe(false);
  });

  it("names the marker of a set priced on a quote line, and tells it from the set's other rows (B1)", () => {
    const ref = "trucking:consignment:c1";
    const marker = quoteAnchorRef(ref, "q1");
    expect(marker).toBe("trucking:consignment:c1:quote:q1");
    expect(setRefOf(marker)).toBe(ref);
    expect(isQuoteAnchor(marker)).toBe(true);
    expect(isQuoteAnchor(marker, ref)).toBe(true);
    expect(isQuoteAnchor(marker, "trucking:consignment:c2")).toBe(false);
    expect(isQuoteAnchor(`${ref}:diff:1`)).toBe(false);
    expect(isQuoteAnchor(null)).toBe(false);
    expect(isDifferenceOf(marker, ref)).toBe(false);
    expect(anchoredQuoteRowOf(marker)).toBe("q1");
    expect(anchoredQuoteRowOf(`${ref}:diff:1`)).toBeNull();
    // It bills nothing and is never on an invoice; the set's difference lines are answered without it.
    expect(quoteAnchorRow("EUR")).toMatchObject({ amount: "0.00", invoice: false, currency: "EUR" });
    expect(differencesOf([{ ref: marker, qty: "1.00", amount: "0.00", currency: "CZK" }], ref)).toEqual([]);
    expect(nextDifferenceNumber(ref, [marker, `${ref}:diff:2`])).toBe(3);
  });

  it("finds the set a credited row's credit owed belongs to: its own, or the one priced on the credited quote line (M2)", () => {
    const rows = [
      { ref: "trucking:consignment:a:quote:q1" },
      { ref: "trucking:consignment:a:diff:1" },
      { ref: "trucking:consignment:b" },
    ];
    const sets = creditSetsOf(
      [
        { id: "q1", ref: null, quoteRoad: true },
        { id: "rb", ref: "trucking:consignment:b", quoteRoad: false },
        { id: "q2", ref: null, quoteRoad: true },
        { id: "x", ref: null, quoteRoad: false },
      ],
      rows,
    );
    expect([...sets]).toEqual([["q1", "trucking:consignment:a"], ["rb", "trucking:consignment:b"]]);
    // Priced on the quote line before the markers: the one set with difference lines and no rows of its own.
    const before = creditSetsOf([{ id: "q1", ref: null, quoteRoad: true }], [{ ref: "trucking:consignment:a:diff:1" }, { ref: "trucking:consignment:b" }]);
    expect(before.get("q1")).toBe("trucking:consignment:a");
    // Two such sets: no telling which - none.
    expect(creditSetsOf([{ id: "q1", ref: null, quoteRoad: true }], [{ ref: "trucking:consignment:a:diff:1" }, { ref: "trucking:consignment:b:diff:1" }]).size).toBe(0);
  });

  it("dates rows written in place of others by the earliest they replace (m6)", () => {
    const at = (iso: string) => ({ createdAt: new Date(iso) });
    expect(firstAddedOf([at("2026-11-10T08:00:00Z"), at("2026-11-02T08:00:00Z")])).toEqual(new Date("2026-11-02T08:00:00Z"));
    expect(firstAddedOf([])).toBeUndefined();
  });

  it("tells a set's rows apart, and a group that comes to nothing", () => {
    expect(setRefOf("trucking:consignment:c1:diff:3")).toBe("trucking:consignment:c1");
    expect(setRefOf("trucking:consignment:c1")).toBe("trucking:consignment:c1");
    expect(setRefOf(null)).toBeNull();
    expect(setRefOf("master:m1:l1")).toBeNull();
    expect(isDifferenceOf("trucking:consignment:c1:diff:1", "trucking:consignment:c1")).toBe(true);
    expect(isDifferenceOf("trucking:consignment:c1", "trucking:consignment:c1")).toBe(false);
    expect(comesToNothing([v("1000"), v("-1000")])).toBe(true);
    expect(comesToNothing([v("1000"), v("-950")])).toBe(false);
    expect(comesToNothing([v("100", "EUR"), v("-100")])).toBe(false);
    expect(comesToNothing([])).toBe(false);
  });
});

describe("firstAddedLike (round-4 review)", () => {
  const row = (createdAt: string, amount: string, currency = "CZK") => ({ createdAt: new Date(createdAt), amount, currency });
  it("takes the first day of the open lines alike: same currency, same sign", () => {
    const open = [row("2026-11-02T08:00:00Z", "500.00"), row("2026-11-01T08:00:00Z", "-300.00"), row("2026-10-30T08:00:00Z", "200.00", "EUR")];
    expect(firstAddedLike(open, { amount: 700, currency: "CZK" })).toEqual(new Date("2026-11-02T08:00:00Z"));
    expect(firstAddedLike(open, { amount: -100, currency: "CZK" })).toEqual(new Date("2026-11-01T08:00:00Z"));
  });
  it("is undefined when a credit owed turns into a charge: the charge is added now", () => {
    expect(firstAddedLike([row("2026-11-01T08:00:00Z", "-300.00")], { amount: 400, currency: "CZK" })).toBeUndefined();
  });
});
