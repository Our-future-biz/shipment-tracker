import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {} }));

import type { ShipmentItem } from "@/hooks/useShipments";
import { ShipmentFacts } from "./ShipmentSummary";

// Mock test S21-044: an air job's header said Port of Loading / Discharge.
describe("the job header", () => {
  const facts = (over: Partial<ShipmentItem>) =>
    renderToStaticMarkup(createElement(ShipmentFacts, { shipment: { id: "s1", jobNumber: "CZ00000001", pol: "PRG", pod: "PVG", ...over } as ShipmentItem }));

  it("names an air job's airports", () => {
    const html = facts({ freightMode: "Air Freight" });
    expect(html).toContain("Airport of Departure");
    expect(html).toContain("Airport of Destination");
    expect(html).not.toContain("Port of Loading");
  });

  it("keeps the ports of a sea job", () => {
    const html = facts({ freightMode: "Sea Freight" });
    expect(html).toContain("Port of Loading");
    expect(html).toContain("Port of Discharge");
  });
});
