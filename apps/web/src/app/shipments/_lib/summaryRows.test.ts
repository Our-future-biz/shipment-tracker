import { describe, expect, it } from "vitest";
import type { ShipmentItem } from "@/hooks/useShipments";
import { summaryRows } from "./summaryRows";

describe("summaryRows", () => {
  it("names the person Handled By, as every other screen does", () => {
    const rows = summaryRows({ personInCharge: "jana@firma.cz", pol: "Hamburg", pod: "Prague" } as ShipmentItem);
    expect(rows.find((r) => r.value === "jana@firma.cz")?.label).toBe("Handled By");
    expect(rows.map((r) => r.label)).not.toContain("Handler");
    expect(rows.find((r) => r.label === "Route")?.value).toBe("Hamburg → Prague");
  });
});
