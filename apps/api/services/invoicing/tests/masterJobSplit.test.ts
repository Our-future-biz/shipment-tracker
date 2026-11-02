import { describe, expect, it } from "vitest";
import { lineTotalCents, masterJobIdOfRef, masterJobRef, splitLine, type SplitHouse } from "../lib/masterJobSplit";

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

  it("splits nothing when there is nothing to split by", () => {
    expect(splitLine({ splitMethod: "wm", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [houses[2]!])).toEqual([]);
    expect(splitLine({ splitMethod: "shipment", estQty: null, estAmount: "10", realQty: null, realAmount: null }, [])).toEqual([]);
  });

  it("names the master job in a split row's ref", () => {
    const id = "3d55a500-d6f8-4def-8e95-82e77493cabb";
    expect(masterJobIdOfRef(masterJobRef(id, "line-1"))).toBe(id);
    expect(masterJobIdOfRef("trucking:trip:x")).toBeNull();
  });
});
