import { describe, expect, it } from "vitest";
import { pickupHref } from "@/app/warehouse-concept/_lib/glossary";
import { WAREHOUSE_SUB_PARAM, warehouseSubTabOf } from "./subTab";

describe("Warehouse tab sub-tab from the URL (mock council S10-5)", () => {
  it("opens the Pick-up only when asked, Shipment Details otherwise", () => {
    expect(warehouseSubTabOf("pickup")).toBe("pickup");
    for (const v of [null, undefined, "", "details", "Pickup", "x"]) expect(warehouseSubTabOf(v)).toBe("details");
  });

  it("is what the gate's Open the job link asks for", () => {
    const url = new URL(pickupHref("5519a0c2-0000-4000-8000-000000000001"), "https://x.test");
    expect(url.searchParams.get("tab")).toBe("warehouse");
    expect(warehouseSubTabOf(url.searchParams.get(WAREHOUSE_SUB_PARAM))).toBe("pickup");
  });
});
