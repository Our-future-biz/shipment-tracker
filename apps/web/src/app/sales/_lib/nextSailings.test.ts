import { describe, expect, it } from "vitest";
import { lclServicesFor, nextSailingsEmpty, nextSailingsOf } from "./nextSailings";

const service = (id: string, more = {}) => ({ id, name: id, mode: "sea_lcl", direction: "import", closedAt: null as string | null, ...more });

describe("next sailings on a Sea LCL quote (Council Outlay 14, C7)", () => {
  it("offers the open sea-LCL services, those of the quote's direction first", () => {
    const services = [service("Export to NY", { direction: "export" }), service("Import from Shanghai"), service("Air", { mode: "air" }), service("Closed", { closedAt: "2026-11-01" }), service("Import from Busan")];
    expect(lclServicesFor(services, "Import").map((s) => s.name)).toEqual(["Import from Busan", "Import from Shanghai", "Export to NY"]);
    expect(lclServicesFor(services, undefined).map((s) => s.name)).toEqual(["Export to NY", "Import from Busan", "Import from Shanghai"]);
    // The one the quote names stays in the list, closed or not.
    expect(lclServicesFor(services, "Import", "Closed").map((s) => s.name)).toContain("Closed");
  });

  it("shows the service's next three sailings, as the board orders them", () => {
    const sailings = [{ id: "a", serviceId: "s1" }, { id: "b", serviceId: "s2" }, { id: "c", serviceId: "s1" }, { id: "d", serviceId: "s1" }, { id: "e", serviceId: "s1" }];
    expect(nextSailingsOf(sailings, "s1").map((s) => s.id)).toEqual(["a", "c", "d"]);
    expect(nextSailingsOf(sailings, undefined)).toEqual([]);
    expect(nextSailingsOf(sailings, "none")).toEqual([]);
  });

  it("says why it has nothing to show", () => {
    expect(nextSailingsEmpty(false, 0, false)).toContain("Pick the Co-Loading service");
    expect(nextSailingsEmpty(true, 0, false)).toContain("closed or no longer exists");
    expect(nextSailingsEmpty(true, 0, true)).toContain("no sailing still to come");
    expect(nextSailingsEmpty(true, 2, true)).toBe("");
  });
});
