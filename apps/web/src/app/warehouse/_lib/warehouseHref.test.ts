import { describe, expect, it } from "vitest";
import { warehouseRecordHref } from "./warehouseHref";

describe("a warehouse record found in the main search", () => {
  it("opens on the Warehouse page its shipment is on", () => {
    expect(warehouseRecordHref("in", "s1")).toBe("/warehouse/in/s1");
    expect(warehouseRecordHref("stock", "s1")).toBe("/warehouse/stock/s1");
    expect(warehouseRecordHref("out", "s1")).toBe("/warehouse/out/s1");
  });
});
