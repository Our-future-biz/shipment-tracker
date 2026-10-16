import { describe, expect, it } from "vitest";
import { truckingCostTag } from "./truckingCosts";

const ctx = { consignments: [{ id: "c1", ref: "TCZ1" }], tripRefs: new Map([["t1", "LCZ1"]]), shipmentId: "s1" };

describe("truckingCostTag without Trucking", () => {
  it("keeps the label and drops the link when the company has Trucking hidden", () => {
    expect(truckingCostTag("trucking:consignment:c1", { ...ctx, linkable: false })).toMatchObject({ label: "Kept by Trucking · TCZ1", href: null });
    expect(truckingCostTag("trucking:trip:t1", ctx)?.href).toBe("/trucking/trips/t1");
  });
});
