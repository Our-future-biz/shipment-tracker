import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { isTruckingCost, parseTruckingRef, truckingCostTag } from "./truckingCosts";

const ctx = { consignments: [{ id: "c1", ref: "TCZ2026000123" }], tripRefs: new Map([["t1", "LCZ2026000045"]]), shipmentId: "s1" };

describe("Trucking cost rows", () => {
  it("reads the source ref, a shared trip's job suffix included", () => {
    expect(parseTruckingRef("trucking:consignment:c1")).toEqual({ kind: "consignment", id: "c1" });
    expect(parseTruckingRef("trucking:trip:t1")).toEqual({ kind: "trip", id: "t1" });
    expect(parseTruckingRef("trucking:trip:t1:job:s1")).toEqual({ kind: "trip", id: "t1" });
    expect(parseTruckingRef("trucking:leg:l1")).toEqual({ kind: "leg", id: "l1" });
    expect(parseTruckingRef(null)).toBeNull();
    expect(parseTruckingRef("quote:QCZ1")).toBeNull();
    expect(isTruckingCost("trucking:trip:t1")).toBe(true);
    expect(isTruckingCost(undefined)).toBe(false);
  });

  it("tags a consignment row with its ref and links it to the consignment", () => {
    expect(truckingCostTag("trucking:consignment:c1", ctx)).toMatchObject({ label: "Kept by Trucking · TCZ2026000123", href: "/trucking/consignments/c1" });
    expect(truckingCostTag("trucking:internal:c1", ctx)).toMatchObject({ href: "/trucking/consignments/c1" });
  });

  it("tags a trip row with the trip's own ref and links it to the trip, not to whichever consignment is first", () => {
    expect(truckingCostTag("trucking:trip:t1:job:s1", ctx)).toMatchObject({ label: "Kept by Trucking · trip LCZ2026000045", href: "/trucking/trips/t1" });
    expect(truckingCostTag("trucking:trip:t9", ctx)).toMatchObject({ label: "Kept by Trucking · trip", href: "/trucking/trips/t9" });
  });

  it("links a row without its own page to the job's consignments, and leaves the job's own rows alone", () => {
    expect(truckingCostTag("trucking:leg:l1", ctx)).toMatchObject({ label: "Kept by Trucking", href: "/trucking?job=s1" });
    expect(truckingCostTag("", ctx)).toBeNull();
  });
});

describe("Trucking rows in the job's Costs tab", () => {
  it("are read-only text, not inert: screen readers and the keyboard reach them", () => {
    const costsTab = readFileSync(join(__dirname, "../../shipments/[jobNumber]/tabs/CostsTab.tsx"), "utf8");
    expect(costsTab).not.toMatch(/\binert\b/);
    expect(costsTab).toMatch(/<TruckingCostTagLink tag=\{truckingTag\} \/>/);
  });
});
