import { describe, expect, it } from "vitest";
import { canManageServices, closedLine, isServiceShipment, routeOf, searchServices, tileLine, tilesInOrder } from "./services";

const shanghai = { name: "Import from Shanghai", serviceName: "ISHA", frequency: "weekly", direction: "import", mode: "sea_lcl", origin: "Shanghai (CNSHA)", destination: "", note: "" };
const ningbo = { name: "Import from Ningbo", serviceName: "", frequency: "", direction: "import", mode: "sea_fcl", origin: "Ningbo (CNNGB)", destination: "Hamburg (DEHAM)", note: "Weekly, Thursday cut-off" };
const air = { name: "Export to Chicago", serviceName: "Domestic", frequency: "ad_hoc", direction: "export", mode: "air", origin: "", destination: "Chicago (USCHI)", note: "" };

describe("Co-Loading Concept's services", () => {
  it("say their direction, mode and route on the tile", () => {
    expect(tileLine(shanghai)).toBe("ISHA · Weekly · Import · Sea LCL · From Shanghai (CNSHA)");
    expect(tileLine(ningbo)).toBe("Import · Sea FCL · Ningbo (CNNGB) → Hamburg (DEHAM)");
    expect(tileLine(air)).toBe("Domestic · Ad-hoc · Export · Air · To Chicago (USCHI)");
    expect(routeOf({ origin: "", destination: "" })).toBe("");
  });

  it("are searched by every word typed, in any field, whatever the case", () => {
    const all = [shanghai, ningbo, air];
    expect(searchServices(all, "")).toEqual(all);
    expect(searchServices(all, "  shanghai ")).toEqual([shanghai]);
    expect(searchServices(all, "import fcl")).toEqual([ningbo]);
    expect(searchServices(all, "thursday")).toEqual([ningbo]);
    expect(searchServices(all, "EXPORT")).toEqual([air]);
    // By its Service Name too.
    expect(searchServices(all, "isha")).toEqual([shanghai]);
    // And by how often it runs.
    expect(searchServices(all, "ad-hoc")).toEqual([air]);
    expect(searchServices(all, "weekly lcl")).toEqual([shanghai]);
    expect(searchServices(all, "import rotterdam")).toEqual([]);
  });
});

describe("closing a Co-Loading Concept service", () => {
  it("is for managers and higher, as New Service is", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canManageServices(role)).toBe(true);
    for (const role of ["user", "", null, undefined]) expect(canManageServices(role)).toBe(false);
  });

  it("says when and by whom it was closed", () => {
    const fmt = (iso: string) => iso.slice(0, 10);
    expect(closedLine({ closedAt: "2026-11-23T08:00:00.000Z", closedByName: "Lukas Slavik" }, fmt)).toBe("Closed on 2026-11-23 by Lukas Slavik");
    expect(closedLine({ closedAt: "2026-11-23T08:00:00.000Z", closedByName: "" }, fmt)).toBe("Closed on 2026-11-23");
    expect(closedLine({ closedAt: null, closedByName: "" }, fmt)).toBe("");
  });

  it("puts a manager's closed tiles after the open ones", () => {
    const a = { id: "a", closedAt: null };
    const b = { id: "b", closedAt: "2026-11-23T08:00:00.000Z" };
    const c = { id: "c", closedAt: null };
    expect(tilesInOrder([a, b, c]).map((s) => s.id)).toEqual(["a", "c", "b"]);
  });
});

describe("a Co-Loading Concept service's shipments", () => {
  it("are the ones with its Service Name, however it is written", () => {
    expect(isServiceShipment("ISHA", "ISHA")).toBe(true);
    expect(isServiceShipment(" isha ", "ISHA")).toBe(true);
    expect(isServiceShipment("Domestic", "ISHA")).toBe(false);
    expect(isServiceShipment("", "ISHA")).toBe(false);
    expect(isServiceShipment(null, "ISHA")).toBe(false);
  });

  it("are none for a service without a Service Name", () => {
    expect(isServiceShipment("", "")).toBe(false);
    expect(isServiceShipment("ISHA", " ")).toBe(false);
  });
});
