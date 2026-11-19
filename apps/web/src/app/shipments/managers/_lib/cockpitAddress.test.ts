import { describe, expect, it } from "vitest";
import {
  LIST_TILES,
  MY_REPORTS_HINT,
  NO_LIST_FOR_MY_REPORTS,
  canOpenShipmentsManagers,
  directionOf,
  handledByOf,
  modeLabel,
  modeOf,
  moneyRowHref,
  reportsOf,
  rowHref,
  shipmentsManagersHref,
  tabOf,
  tileHref,
  type OpsListTileKey,
} from "./cockpitAddress";
import { addressFiltersOf, arrivesByLink } from "@/app/shipments/_lib/addressFilters";

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
    expect(tabOf("team")).toBe("team");
    expect(tabOf("money")).toBe("money");
    expect(tabOf("settings")).toBe("settings");
    expect(tabOf("Settings")).toBe("cockpit");
    expect(tabOf("Money")).toBe("cockpit");
    expect(tabOf("Team")).toBe("cockpit");
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

  it("writes the signal the cards are narrowed to after the filters, and nothing for none", () => {
    expect(shipmentsManagersHref({ signal: "cutoff" })).toBe("/shipments/managers?signal=cutoff");
    expect(shipmentsManagersHref({ mode: "sea", direction: "export", handledBy: "jana@cto.cz", signal: "free_time" })).toBe(
      "/shipments/managers?mode=sea&direction=export&handledBy=jana%40cto.cz&signal=free_time",
    );
    expect(shipmentsManagersHref({ mode: "air", signal: null })).toBe("/shipments/managers?mode=air");
    // It stays while Approvals is open, as the filters do: back on the cockpit the cards are as they were left.
    expect(shipmentsManagersHref({ tab: "approvals", signal: "customs" })).toBe("/shipments/managers?tab=approvals&signal=customs");
  });

  it("reads My reports, everyone's jobs for anything else", () => {
    expect(reportsOf("mine")).toBe("mine");
    expect(reportsOf(" Mine ")).toBe("mine");
    expect(reportsOf("all")).toBe("all");
    expect(reportsOf("yours")).toBe("all");
    expect(reportsOf("")).toBe("all");
    expect(reportsOf(null)).toBe("all");
  });

  it("writes the Team tab and My reports, and nothing for everyone's jobs", () => {
    expect(shipmentsManagersHref({ tab: "team" })).toBe("/shipments/managers?tab=team");
    expect(shipmentsManagersHref({ reports: "mine" })).toBe("/shipments/managers?reports=mine");
    expect(shipmentsManagersHref({ reports: "all" })).toBe("/shipments/managers");
    expect(shipmentsManagersHref({ tab: "team", mode: "air", direction: "export", reports: "mine" })).toBe("/shipments/managers?tab=team&mode=air&direction=export&reports=mine");
    // After the person, before the signal: every link the page builds carries it.
    expect(shipmentsManagersHref({ mode: "sea", handledBy: "jana@cto.cz", reports: "mine", signal: "todo" })).toBe("/shipments/managers?mode=sea&handledBy=jana%40cto.cz&reports=mine&signal=todo");
    expect(shipmentsManagersHref({ tab: "approvals", reports: "mine" })).toBe("/shipments/managers?tab=approvals&reports=mine");
  });

  it("reads back the My reports it writes", () => {
    const href = shipmentsManagersHref({ tab: "team", reports: "mine" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(reportsOf(params.get("reports"))).toBe("mine");
    expect(tabOf(params.get("tab"))).toBe("team");
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
const everyone = { mode: "all", direction: "all", handledBy: null, reports: "all" } as const;

describe("Shipments → Managers: where a list tile leads", () => {
  it("lists the five tiles the Shipments list can show, in the order they are drawn", () => {
    expect(LIST_TILES.map((t) => t.key)).toEqual(["active", "noHandledBy", "etdEtaMoved", "notReleased", "openClaims"]);
    expect(LIST_TILES.map((t) => t.label)).toEqual(["Active jobs", "Nobody in Handled By", "ETA Moved", "Arrived, not released for billing", "Open claims"]);
    for (const t of LIST_TILES) expect(t.hint, t.key).not.toBe("");
  });

  it("opens the Shipments list with the filter that lists what the tile counted", () => {
    const expected: Record<OpsListTileKey, Record<string, string>> = {
      active: { tile: "active" },
      noHandledBy: { tile: "active", handledBy: "nobody" },
      etdEtaMoved: { tile: "etamoved" },
      // On its own this one also lists jobs that are no longer active.
      notReleased: { tile: "active", invoicing: "unbilled-arrivals" },
      openClaims: { tile: "claims" },
    };
    for (const { key } of LIST_TILES) {
      const href = tileHref(key, everyone);
      expect(href!.startsWith("/shipments?"), key).toBe(true);
      expect(query(href), key).toEqual(expected[key]);
    }
  });

  it("has no link to the list for what the cockpit counts by its own rules", () => {
    // Cut-offs and bookings are counted in working days, with the missed ones kept: the list's
    // tile=cutoffs and tile=booking-pending would show other jobs. They narrow the cards instead.
    const keys: string[] = LIST_TILES.map((t) => t.key);
    for (const key of ["cutoffsDue", "bookingPending", "customsUrgent", "freeTime", "handledByNotUser", "signals"]) expect(keys, key).not.toContain(key);
  });

  it("carries the page's mode and Handled By person", () => {
    expect(tileHref("etdEtaMoved", { ...everyone, mode: "air" })).toBe("/shipments?tile=etamoved&mode=air");
    expect(query(tileHref("notReleased", { ...everyone, mode: "sea", handledBy: "jana@cto.cz" }))).toEqual({ tile: "active", invoicing: "unbilled-arrivals", mode: "sea", handledBy: "jana@cto.cz" });
    expect(query(tileHref("openClaims", { ...everyone, handledBy: "nobody" }))).toEqual({ tile: "claims", handledBy: "nobody" });
  });

  it("carries the page's Trade Direction as the list's own direction filter, which the server matches over every job", () => {
    expect(tileHref("etdEtaMoved", { ...everyone, direction: "import" })).toBe("/shipments?tile=etamoved&direction=import");
    expect(query(tileHref("active", { ...everyone, direction: "export" }))).toEqual({ tile: "active", direction: "export" });
    expect(query(tileHref("openClaims", { mode: "road", direction: "domestic", handledBy: "jana@cto.cz", reports: "all" }))).toEqual({
      tile: "claims",
      mode: "road",
      handledBy: "jana@cto.cz",
      direction: "domestic",
    });
    // Every direction: none sent. And never a column filter: that one is applied in the browser, to the rows the list loaded.
    for (const { key } of LIST_TILES) {
      expect(query(tileHref(key, everyone)), key).not.toHaveProperty("direction");
      for (const direction of ["import", "export", "domestic"] as const) expect(tileHref(key, { ...everyone, direction }), key).not.toContain("f.");
    }
  });

  it("leads to a list that reads the direction back as the filter it sends, with its chip", () => {
    for (const direction of ["import", "export", "domestic"] as const) {
      const params = new URLSearchParams(tileHref("active", { ...everyone, direction })!.split("?")[1]);
      const { request, chips } = addressFiltersOf(params);
      expect(request).toEqual({ direction });
      expect(chips.map((c) => c.param)).toEqual(["direction"]);
      // A link's own filters: the list opens on exactly these rows.
      expect(arrivesByLink(params)).toBe(true);
    }
  });

  it("opens the jobs nobody handles from Nobody in Handled By, for everyone and on a page narrowed to nobody", () => {
    expect(query(tileHref("noHandledBy", { ...everyone, mode: "rail" }))).toEqual({ tile: "active", handledBy: "nobody", mode: "rail" });
    expect(query(tileHref("noHandledBy", { mode: "all", direction: "import", handledBy: "nobody", reports: "all" }))).toEqual({ tile: "active", handledBy: "nobody", direction: "import" });
  });

  it("gives Nobody in Handled By no link on a page narrowed to a person: it counts none of their jobs", () => {
    expect(tileHref("noHandledBy", { ...everyone, handledBy: "jana@cto.cz" })).toBeUndefined();
    expect(tileHref("noHandledBy", { mode: "rail", direction: "export", handledBy: "jana@cto.cz", reports: "all" })).toBeUndefined();
    // The other tiles of that page keep theirs.
    expect(tileHref("active", { ...everyone, handledBy: "jana@cto.cz" })).toBe("/shipments?tile=active&handledBy=jana%40cto.cz");
  });
});

describe("Shipments → Managers: the list tiles with My reports on", () => {
  it("gives no tile a link: the Shipments list has no filter for whom somebody reports to", () => {
    for (const { key } of LIST_TILES) {
      expect(tileHref(key, { ...everyone, reports: "mine" }), key).toBeUndefined();
      expect(tileHref(key, { mode: "sea", direction: "import", handledBy: "jana@cto.cz", reports: "mine" }), key).toBeUndefined();
    }
    // The same page with everyone's jobs has them.
    expect(tileHref("active", { ...everyone, reports: "all" })).toBe("/shipments?tile=active");
  });

  it("says on the switch that My reports also holds the jobs of people who are no longer users", () => {
    expect(MY_REPORTS_HINT).toBe("Jobs handled by the people who report to you, and jobs whose Handled By is no longer a user");
  });

  it("says why, and how to get the list", () => {
    expect(NO_LIST_FOR_MY_REPORTS).toContain("My reports");
    expect(NO_LIST_FOR_MY_REPORTS).toContain("switch My reports off");
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

  it("opens a job's shipment whether the row says it is a job or says nothing", () => {
    expect(rowHref({ kind: "job", id: "abc", area: "customs" })).toBe("/shipments/abc?tab=customs");
    expect(rowHref({ id: "abc", area: "customs" })).toBe("/shipments/abc?tab=customs");
  });

  it("opens a Master Job inside Master Jobs by its id, on Linked Shipments, whatever its area", () => {
    const id = "5d0c2a1e-7b1f-4c7e-8a55-0e9c1b2d3f40";
    expect(rowHref({ kind: "masterJob", id, area: "details" })).toBe(`/master-jobs?open=${id}&tab=shipments`);
    expect(rowHref({ kind: "masterJob", id, area: "tracking" })).toBe(`/master-jobs?open=${id}&tab=shipments`);
  });
});

describe("Shipments → Managers: the Money tab in the address", () => {
  it("names the tab, and keeps the filters the page has", () => {
    expect(shipmentsManagersHref({ tab: "money" })).toBe("/shipments/managers?tab=money");
    expect(shipmentsManagersHref({ tab: "money", mode: "sea", direction: "import", handledBy: "jana@cto.cz", reports: "mine" })).toBe(
      "/shipments/managers?tab=money&mode=sea&direction=import&handledBy=jana%40cto.cz&reports=mine",
    );
  });

  it("names the money signal its cards are narrowed to, beside the Cockpit's own", () => {
    expect(shipmentsManagersHref({ tab: "money", msignal: "margin" })).toBe("/shipments/managers?tab=money&msignal=margin");
    expect(shipmentsManagersHref({ tab: "money", msignal: null })).toBe("/shipments/managers?tab=money");
    // Each tab keeps its own: coming back to the other finds its cards as they were left.
    expect(shipmentsManagersHref({ tab: "money", signal: "cutoff", msignal: "accrual" })).toBe("/shipments/managers?tab=money&signal=cutoff&msignal=accrual");
    expect(shipmentsManagersHref({ signal: "cutoff", msignal: "accrual" })).toBe("/shipments/managers?signal=cutoff&msignal=accrual");
  });

  it("opens a Money row's job on Costs Breakdown, by the shipment's id", () => {
    const id = "0b9d6f0e-1c1e-4e0a-9d43-2f0c0f3f7a11";
    expect(moneyRowHref({ id })).toBe(`/shipments/${id}?tab=costs`);
    // The same place a finance row of the Cockpit leads to.
    expect(moneyRowHref({ id })).toBe(rowHref({ id, area: "finance" }));
    expect(moneyRowHref({ id: "a b/c" })).toBe("/shipments/a%20b%2Fc?tab=costs");
  });
});
