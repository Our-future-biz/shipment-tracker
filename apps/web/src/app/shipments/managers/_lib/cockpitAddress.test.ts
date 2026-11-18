import { describe, expect, it } from "vitest";
import {
  canOpenShipmentsManagers,
  directionOf,
  handledByOf,
  modeLabel,
  modeOf,
  rowHref,
  shipmentsManagersHref,
  tabOf,
  tileHref,
  type OpsTileKey,
} from "./cockpitAddress";

describe("Shipments → Managers: who opens it", () => {
  it("is for superadmins, admins and managers", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canOpenShipmentsManagers({ role })).toBe(true);
    for (const role of ["user", "customs", "warehouse", ""]) expect(canOpenShipmentsManagers({ role })).toBe(false);
    expect(canOpenShipmentsManagers(null)).toBe(false);
    expect(canOpenShipmentsManagers(undefined)).toBe(false);
  });
});

describe("Shipments → Managers: its address", () => {
  it("reads the tab, the cockpit for anything it does not know", () => {
    expect(tabOf("approvals")).toBe("approvals");
    expect(tabOf("cockpit")).toBe("cockpit");
    expect(tabOf("inquiries")).toBe("cockpit");
    expect(tabOf(null)).toBe("cockpit");
  });

  it("reads the mode, All for anything it does not know", () => {
    for (const mode of ["sea", "air", "rail", "road"]) expect(modeOf(mode)).toBe(mode);
    expect(modeOf("ship")).toBe("all");
    expect(modeOf("Air")).toBe("all");
    expect(modeOf("")).toBe("all");
    expect(modeOf(null)).toBe("all");
  });

  it("reads the Trade Direction, All for anything it does not know", () => {
    for (const direction of ["import", "export", "domestic"]) expect(directionOf(direction)).toBe(direction);
    expect(directionOf("transit")).toBe("all");
    expect(directionOf(null)).toBe("all");
  });

  it("reads the Handled By person in lower case, nobody as such, everyone when nothing is named", () => {
    expect(handledByOf("Jana.Novakova@cto.cz ")).toBe("jana.novakova@cto.cz");
    expect(handledByOf("Nobody")).toBe("nobody");
    expect(handledByOf("")).toBeNull();
    expect(handledByOf("   ")).toBeNull();
    expect(handledByOf(null)).toBeNull();
  });

  it("reads everyone typed by hand as everyone, not as a person of that name", () => {
    expect(handledByOf("everyone")).toBeNull();
    expect(handledByOf(" Everyone ")).toBeNull();
    expect(shipmentsManagersHref({ handledBy: handledByOf("everyone") })).toBe("/shipments/managers");
  });

  it("writes the address, leaving out what is the default", () => {
    expect(shipmentsManagersHref()).toBe("/shipments/managers");
    expect(shipmentsManagersHref({ tab: "cockpit", mode: "all", direction: "all", handledBy: null })).toBe("/shipments/managers");
    expect(shipmentsManagersHref({ tab: "approvals" })).toBe("/shipments/managers?tab=approvals");
    expect(shipmentsManagersHref({ mode: "air", direction: "import" })).toBe("/shipments/managers?mode=air&direction=import");
    expect(shipmentsManagersHref({ tab: "approvals", mode: "sea", handledBy: "nobody" })).toBe("/shipments/managers?tab=approvals&mode=sea&handledBy=nobody");
  });

  it("writes an e-mail so that it reads back the same", () => {
    const href = shipmentsManagersHref({ handledBy: "jana+ops@cto.cz" });
    expect(handledByOf(new URLSearchParams(href.split("?")[1]).get("handledBy"))).toBe("jana+ops@cto.cz");
  });

  it("names a row's mode, nothing for a job with no Freight Mode", () => {
    expect(modeLabel("sea")).toBe("Sea");
    expect(modeLabel("road")).toBe("Road");
    expect(modeLabel("")).toBe("");
    expect(modeLabel("all")).toBe("");
  });
});

const query = (href: string | undefined) => Object.fromEntries(new URLSearchParams(href!.split("?")[1]));
const everyone = { mode: "all", direction: "all", handledBy: null } as const;

describe("Shipments → Managers: where a tile leads", () => {
  it("opens the Shipments list with the filter that lists what the tile counted", () => {
    const expected: Record<OpsTileKey, Record<string, string> | undefined> = {
      active: { tile: "active" },
      cutoffsDue: { tile: "cutoffs" },
      noHandledBy: { tile: "active", handledBy: "nobody" },
      handledByNotUser: undefined,
      bookingPending: { tile: "booking-pending" },
      etdEtaMoved: { tile: "etamoved" },
      freeTime: undefined,
      // On their own these two also list jobs that are no longer active.
      customsUrgent: { tile: "active", customs: "urgent" },
      notReleased: { tile: "active", invoicing: "unbilled-arrivals" },
      openClaims: { tile: "claims" },
    };
    for (const [key, filters] of Object.entries(expected) as [OpsTileKey, Record<string, string> | undefined][]) {
      const href = tileHref(key, everyone);
      if (!filters) {
        expect(href, key).toBeUndefined();
        continue;
      }
      expect(href!.startsWith("/shipments?"), key).toBe(true);
      expect(query(href), key).toEqual(filters);
    }
  });

  it("carries the page's mode and Handled By person", () => {
    expect(tileHref("cutoffsDue", { ...everyone, mode: "air" })).toBe("/shipments?tile=cutoffs&mode=air");
    expect(query(tileHref("customsUrgent", { ...everyone, mode: "sea", handledBy: "jana@cto.cz" }))).toEqual({ tile: "active", customs: "urgent", mode: "sea", handledBy: "jana@cto.cz" });
    expect(query(tileHref("openClaims", { ...everyone, handledBy: "nobody" }))).toEqual({ tile: "claims", handledBy: "nobody" });
  });

  it("carries the page's Trade Direction as the list's column filter, in the value the column stores", () => {
    expect(tileHref("cutoffsDue", { ...everyone, direction: "import" })).toBe("/shipments?tile=cutoffs&f.tradeDirection=Import");
    expect(query(tileHref("active", { ...everyone, direction: "export" }))).toEqual({ tile: "active", "f.tradeDirection": "Export" });
    expect(query(tileHref("openClaims", { mode: "road", direction: "domestic", handledBy: "jana@cto.cz" }))).toEqual({
      tile: "claims",
      mode: "road",
      handledBy: "jana@cto.cz",
      "f.tradeDirection": "Domestic",
    });
    // Every direction: no column filter, so the list restores nothing it was not asked for.
    for (const key of ["active", "cutoffsDue", "customsUrgent", "notReleased"] as const) expect(tileHref(key, everyone)).not.toContain("f.");
  });

  it("opens the jobs nobody handles from Nobody in Handled By, for everyone and on a page narrowed to nobody", () => {
    expect(query(tileHref("noHandledBy", { ...everyone, mode: "rail" }))).toEqual({ tile: "active", handledBy: "nobody", mode: "rail" });
    expect(query(tileHref("noHandledBy", { mode: "all", direction: "import", handledBy: "nobody" }))).toEqual({ tile: "active", handledBy: "nobody", "f.tradeDirection": "Import" });
  });

  it("gives Nobody in Handled By no link on a page narrowed to a person: it counts none of their jobs", () => {
    expect(tileHref("noHandledBy", { ...everyone, handledBy: "jana@cto.cz" })).toBeUndefined();
    expect(tileHref("noHandledBy", { mode: "rail", direction: "export", handledBy: "jana@cto.cz" })).toBeUndefined();
    // The other tiles of that page keep theirs.
    expect(tileHref("active", { ...everyone, handledBy: "jana@cto.cz" })).toBe("/shipments?tile=active&handledBy=jana%40cto.cz");
  });

  it("leads nowhere for what the list cannot filter by, whatever the page is narrowed to", () => {
    expect(tileHref("freeTime", { mode: "air", direction: "import", handledBy: "jana@cto.cz" })).toBeUndefined();
    expect(tileHref("handledByNotUser", { ...everyone, mode: "air" })).toBeUndefined();
  });
});

describe("Shipments → Managers: where a row leads", () => {
  it("opens the shipment by its id, on the tab its first signal is worked on", () => {
    const id = "0b9d6f0e-1c1e-4e0a-9d43-2f0c0f3f7a11";
    expect(rowHref({ id, area: "tracking" })).toBe(`/shipments/${id}?tab=tracking`);
    expect(rowHref({ id, area: "customs" })).toBe(`/shipments/${id}?tab=customs`);
    expect(rowHref({ id, area: "finance" })).toBe(`/shipments/${id}?tab=costs`);
    // Shipment Details is where the page opens.
    expect(rowHref({ id, area: "details" })).toBe(`/shipments/${id}`);
  });

  it("opens the shipment where it always opens for an area it does not know", () => {
    expect(rowHref({ id: "abc", area: "warehouse" as never })).toBe("/shipments/abc");
  });
});
