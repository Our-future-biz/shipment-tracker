import { describe, expect, it } from "vitest";
import { lineTotalCents, masterJobRef, masterJobRefPrefix, splitLine, type SplitHouse } from "../lib/masterJobSplit";

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

  it("splits nothing when there is nothing to split by", () => {
    expect(splitLine({ splitMethod: "wm", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [houses[2]!])).toEqual([]);
    expect(splitLine({ splitMethod: "shipment", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [])).toEqual([]);
  });

  it("names the master job in a split row's ref", () => {
    const id = "3d55a500-d6f8-4def-8e95-82e77493cabb";
    expect(masterJobRef(id, "line-1")).toBe(`master:${id}:line-1`);
    // A re-split finds every row of the master job by the prefix, and no other master job's.
    expect(masterJobRef(id, "line-1").startsWith(masterJobRefPrefix(id))).toBe(true);
    expect(masterJobRef("4e66b611-e7f9-4ef0-9fa6-93f88504dbcc", "line-1").startsWith(masterJobRefPrefix(id))).toBe(false);
  });
});
