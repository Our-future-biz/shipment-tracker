import { describe, expect, it } from "vitest";
import { salesManagersHref } from "../../_lib/tabs";
import { cockpitModeOf, inCockpitMode } from "./cockpitModes";

describe("Sales → Managers freight modes", () => {
  it("counts Sea as its three modes and All as every quote", () => {
    for (const s of ["Sea FCL", "Sea LCL", "Sea Break Bulk"]) expect(inCockpitMode(s, "sea")).toBe(true);
    expect(inCockpitMode("Air", "sea")).toBe(false);
    expect(inCockpitMode("Road", "road")).toBe(true);
    expect(inCockpitMode("", "all")).toBe(true);
    expect(inCockpitMode("", "air")).toBe(false);
  });

  it("reads the mode from the address, All for anything it does not know", () => {
    expect(cockpitModeOf("rail")).toBe("rail");
    expect(cockpitModeOf("ship")).toBe("all");
    expect(cockpitModeOf(null)).toBe("all");
  });

  it("keeps the tab and the mode in the address, leaving out what is the default", () => {
    expect(salesManagersHref()).toBe("/sales/managers");
    expect(salesManagersHref({ tab: "inquiries" })).toBe("/sales/managers?tab=inquiries");
    expect(salesManagersHref({ tab: "inquiries", mode: "sea" })).toBe("/sales/managers?tab=inquiries&mode=sea");
    expect(salesManagersHref({ tab: "cockpit", mode: "air" })).toBe("/sales/managers?mode=air");
  });
});
