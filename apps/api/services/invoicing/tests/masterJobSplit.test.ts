import { describe, expect, it } from "vitest";
import {
  lineTotalCents,
  masterJobRef,
  masterJobRefPrefix,
  planSoldAtCost,
  soldAtCostInSync,
  soldAtCostRows,
  splitLine,
  splitRowColumns,
  splitRowsInSync,
  waivedShares,
  type SplitHouse,
  type SplitRowValues,
} from "../lib/masterJobSplit";

const houses: SplitHouse[] = [
  { shipmentId: "a", jobNumber: "CZ00000021", freightTon: 2 },
  { shipmentId: "b", jobNumber: "CZ00000022", freightTon: 1 },
  { shipmentId: "c", jobNumber: "CZ00000023", freightTon: 0 },
];

describe("master job cost split", () => {
  it("totals a line as amount × quantity (none counts as 1)", () => {
    expect(lineTotalCents("875.00", "2")).toBe(175000);
    expect(lineTotalCents("100", null)).toBe(10000);
    expect(lineTotalCents("", "3")).toBeNull();
  });

  it("splits by W/M, leaving out a shipment without one, to the cent", () => {
    const shares = splitLine({ splitMethod: "wm", estQty: null, estAmount: "100.00", realQty: null, realAmount: null }, houses);
    expect(shares).toEqual([
      { shipmentId: "a", est: "66.67", real: null },
      { shipmentId: "b", est: "33.33", real: null },
    ]);
  });

  it("splits per shipment equally over every shipment of the master job", () => {
    const shares = splitLine({ splitMethod: "shipment", estQty: null, estAmount: null, realQty: "1", realAmount: "100.00" }, houses);
    expect(shares.map((s) => s.real)).toEqual(["33.34", "33.33", "33.33"]);
    expect(shares.every((s) => s.est === null)).toBe(true);
  });

  it("shares a line over the shipments left in its split only, to the cent", () => {
    const byWm = splitLine({ splitMethod: "wm", estQty: null, estAmount: null, realQty: null, realAmount: "100.00", excludedShipmentIds: ["a"] }, houses);
    expect(byWm).toEqual([{ shipmentId: "b", est: null, real: "100.00" }]);
    const each = splitLine({ splitMethod: "shipment", estQty: null, estAmount: null, realQty: null, realAmount: "100.00", excludedShipmentIds: ["b"] }, houses);
    expect(each).toEqual([
      { shipmentId: "a", est: null, real: "50.00" },
      { shipmentId: "c", est: null, real: "50.00" },
    ]);
  });

  it("gives nobody a part of a line that is not in the split", () => {
    const line = { splitMethod: "wm" as const, estQty: null, estAmount: "100.00", realQty: null, realAmount: "120.00" };
    expect(splitLine({ ...line, inSplit: false }, houses)).toEqual([]);
    expect(splitLine({ ...line, inSplit: true }, houses)).toHaveLength(2);
  });

  it("splits nothing when there is nothing to split by", () => {
    expect(splitLine({ splitMethod: "wm", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [houses[2]!])).toEqual([]);
    expect(splitLine({ splitMethod: "shipment", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [])).toEqual([]);
  });

  it("names the master job in a split row's ref", () => {
    const id = "3d55a500-d6f8-4def-8e95-82e77493cabb";
    expect(masterJobRef(id, "line-1")).toBe(`master:${id}:line-1`);
    // Processing finds every row of the master job by the prefix, and no other master job's.
    expect(masterJobRef(id, "line-1").startsWith(masterJobRefPrefix(id))).toBe(true);
    expect(masterJobRef("4e66b611-e7f9-4ef0-9fa6-93f88504dbcc", "line-1").startsWith(masterJobRefPrefix(id))).toBe(false);
  });
});

describe("whether the shipments carry the split", () => {
  const row = (over: Partial<SplitRowValues> = {}): SplitRowValues => ({
    shipmentId: "a", category: "ocean_freight", description: "", vendor: "Cosco", estAmount: "100.00", estCurrency: "EUR", realAmount: null,
    realCurrency: "EUR", invoiceNumber: "", received: false, sourceMasterJobRef: "master:m:l", lineSort: 0, ...over,
  });
  const written = (over: Partial<SplitRowValues> = {}) => splitRowColumns(row(over)) as Parameters<typeof splitRowsInSync>[0][number];

  it("does when every share has its row, saying the same", () => {
    expect(splitRowsInSync([written(), written({ shipmentId: "b" })], [row({ shipmentId: "b" }), row()])).toBe(true);
    expect(splitRowsInSync([], [])).toBe(true);
  });

  it("does not when an amount or anything else the row takes from its line changed", () => {
    expect(splitRowsInSync([written()], [row({ estAmount: "120.00" })])).toBe(false);
    expect(splitRowsInSync([written()], [row({ vendor: "Maersk" })])).toBe(false);
    expect(splitRowsInSync([written()], [row({ lineSort: 1 })])).toBe(false);
  });

  it("does not when a share has no row yet, or a row has no share any more", () => {
    expect(splitRowsInSync([], [row()])).toBe(false);
    expect(splitRowsInSync([written()], [])).toBe(false);
    expect(splitRowsInSync([written()], [row({ shipmentId: "b" })])).toBe(false);
  });

  it("does not when a shipment has two rows of one share", () => {
    expect(splitRowsInSync([written(), written()], [row(), row({ shipmentId: "b" })])).toBe(false);
  });
});

describe("demurrage sold on at cost", () => {
  const share = (over: Partial<SplitRowValues> = {}): SplitRowValues => ({
    shipmentId: "a", category: "container_demurrage", description: "", vendor: "Cosco", estAmount: "100.00", estCurrency: "EUR", realAmount: "120.00",
    realCurrency: "USD", invoiceNumber: "", received: false, sourceMasterJobRef: "master:m:l", lineSort: 0, ...over,
  });
  const wanted = (over: Partial<SplitRowValues> = {}) => soldAtCostRows([share(over)])[0]!;
  const current = (over: Record<string, unknown> = {}) => ({ id: "s1", ...wanted(), ...over });

  it("calls for the share's real cost, in its currency", () => {
    expect(soldAtCostRows([share()])).toEqual([
      { shipmentId: "a", category: "container_demurrage", description: "", amount: "120.00", currency: "USD", sourceMasterJobRef: "master:m:l" },
    ]);
  });

  it("calls for the estimate while there is no real cost, in the estimate's currency", () => {
    expect(wanted({ realAmount: null })).toMatchObject({ amount: "100.00", currency: "EUR" });
  });

  it("calls for nothing for other costs, or a share with no amount", () => {
    expect(soldAtCostRows([share({ category: "ocean_freight" }), share({ category: "container_detention" })])).toEqual([]);
    expect(soldAtCostRows([share({ realAmount: null, estAmount: null })])).toEqual([]);
  });

  it("adds a row a share has none of, and writes nothing once it says the same", () => {
    expect(planSoldAtCost([], [wanted()], new Set()).add).toHaveLength(1);
    const same = planSoldAtCost([current()], [wanted()], new Set());
    expect(soldAtCostInSync(same)).toBe(true);
    expect(same.onInvoices).toBe(0);
  });

  it("changes a row whose amount, currency or description moved", () => {
    const plan = planSoldAtCost([current({ amount: "90.00" })], [wanted()], new Set());
    expect(plan.change).toEqual([{ id: "s1", row: wanted(), keepAmount: false }]);
    expect(planSoldAtCost([current({ currency: "EUR" })], [wanted()], new Set()).change).toHaveLength(1);
    expect(planSoldAtCost([current({ description: "old" })], [wanted()], new Set()).change).toHaveLength(1);
  });

  it("removes a row whose share is gone", () => {
    const plan = planSoldAtCost([current()], [], new Set());
    expect(plan.remove).toEqual(["s1"]);
    expect(plan.onInvoices).toBe(0);
  });

  it("leaves a row on an issued invoice as it is, and counts it, whether it changed or its share is gone", () => {
    const changed = planSoldAtCost([current({ amount: "90.00" })], [wanted()], new Set(["s1"]));
    expect(changed).toEqual({ add: [], change: [], remove: [], onInvoices: 1 });
    const gone = planSoldAtCost([current()], [], new Set(["s1"]));
    expect(gone).toEqual({ add: [], change: [], remove: [], onInvoices: 1 });
    expect(soldAtCostInSync(gone)).toBe(true);
    // Unchanged, nothing needs saying.
    expect(planSoldAtCost([current()], [wanted()], new Set(["s1"])).onInvoices).toBe(0);
  });

  it("adds no second row of a share someone copied with Copy from buying", () => {
    const plan = planSoldAtCost([], [wanted()], new Set(), new Set(["a master:m:l"]));
    expect(plan.add).toEqual([]);
    expect(soldAtCostInSync(plan)).toBe(true);
  });

  it("removes a second row of one share", () => {
    const plan = planSoldAtCost([current(), current({ id: "s2" })], [wanted()], new Set());
    expect(plan.remove).toHaveLength(1);
    expect(plan.add).toEqual([]);
  });
});

describe("a selling row with a number of its own, when the split is processed again", () => {
  const share = (over: Partial<SplitRowValues> = {}): SplitRowValues => ({
    shipmentId: "a", category: "container_demurrage", description: "", vendor: "", estAmount: null, estCurrency: "EUR", realAmount: "100.00",
    realCurrency: "EUR", invoiceNumber: "", received: false, sourceMasterJobRef: "master:m:l", lineSort: 0, ...over,
  });
  const wanted = (over: Partial<SplitRowValues> = {}) => soldAtCostRows([share(over)])[0]!;
  const current = (amount: string, amountOverrideCost: string | null) => ({ id: "s1", ...wanted(), amount, amountOverrideCost });

  it("keeps a raised number, also when the cost moves but stays below it", () => {
    expect(soldAtCostInSync(planSoldAtCost([current("150.00", "100.00")], [wanted()], new Set()))).toBe(true);
    expect(soldAtCostInSync(planSoldAtCost([current("150.00", "100.00")], [wanted({ realAmount: "120.00" })], new Set()))).toBe(true);
  });

  it("puts a raised number back to the cost once the cost passes it", () => {
    const plan = planSoldAtCost([current("150.00", "100.00")], [wanted({ realAmount: "200.00" })], new Set());
    expect(plan.change).toEqual([{ id: "s1", row: wanted({ realAmount: "200.00" }), keepAmount: false }]);
  });

  it("keeps an approved lower number at the cost it was approved for", () => {
    expect(soldAtCostInSync(planSoldAtCost([current("60.00", "100.00")], [wanted()], new Set()))).toBe(true);
  });

  it("puts an approved lower number back to the cost when the cost moved: the approval doesn't cover it", () => {
    const plan = planSoldAtCost([current("60.00", "100.00")], [wanted({ realAmount: "110.00" })], new Set());
    expect(plan.change[0]).toMatchObject({ keepAmount: false, row: { amount: "110.00" } });
    expect(planSoldAtCost([current("60.00", "100.00")], [wanted({ realAmount: "90.00" })], new Set()).change[0]).toMatchObject({ keepAmount: false });
  });

  it("puts it back in another currency, where the number means nothing", () => {
    const plan = planSoldAtCost([current("150.00", "100.00")], [wanted({ realCurrency: "USD" })], new Set());
    expect(plan.change[0]).toMatchObject({ keepAmount: false, row: { currency: "USD" } });
  });

  it("keeps the number when only the description changes", () => {
    const plan = planSoldAtCost([current("150.00", "100.00")], [wanted({ description: "new" })], new Set());
    expect(plan.change).toEqual([{ id: "s1", row: wanted({ description: "new" }), keepAmount: true }]);
  });

  it("still follows the cost without a number of its own", () => {
    expect(planSoldAtCost([current("100.00", null)], [wanted({ realAmount: "90.00" })], new Set()).change[0]).toMatchObject({ keepAmount: false, row: { amount: "90.00" } });
  });

  it("stays on an issued invoice whatever the cost does", () => {
    expect(planSoldAtCost([current("60.00", "100.00")], [wanted({ realAmount: "110.00" })], new Set(["s1"]))).toEqual({ add: [], change: [], remove: [], onInvoices: 1 });
  });
});

describe("a selling row a manager approved taking off", () => {
  const share = (over: Partial<SplitRowValues> = {}): SplitRowValues => ({
    shipmentId: "a", category: "container_demurrage", description: "", vendor: "", estAmount: null, estCurrency: "EUR", realAmount: "100.00",
    realCurrency: "EUR", invoiceNumber: "", received: false, sourceMasterJobRef: "master:m:l", lineSort: 0, ...over,
  });
  const wanted = (over: Partial<SplitRowValues> = {}) => soldAtCostRows([share(over)])[0]!;
  const waived = { shipmentId: "a", sourceMasterJobRef: "master:m:l", amountOverrideCost: "100.00" };

  it("stays off at the cost it was approved for, and the split reads as processed", () => {
    const skip = waivedShares([waived], [wanted()]);
    expect(skip).toEqual(new Set(["a master:m:l"]));
    const plan = planSoldAtCost([], [wanted()], new Set(), skip);
    expect(plan.add).toEqual([]);
    expect(soldAtCostInSync(plan)).toBe(true);
  });

  it("comes back at another cost: the approval doesn't cover it", () => {
    const moved = wanted({ realAmount: "110.00" });
    expect(waivedShares([waived], [moved]).size).toBe(0);
    expect(planSoldAtCost([], [moved], new Set(), waivedShares([waived], [moved])).add).toEqual([moved]);
  });

  it("covers only its own shipment and line", () => {
    expect(waivedShares([waived], [wanted({ shipmentId: "b" })]).size).toBe(0);
    expect(waivedShares([waived], [wanted({ sourceMasterJobRef: "master:m:other" })]).size).toBe(0);
  });
});
