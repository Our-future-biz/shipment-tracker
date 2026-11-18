import { describe, expect, it } from "vitest";
import { MANAGERS_DIRECTIONS, MANAGERS_MODES, MANAGERS_REPORTS, managersFilters } from "../lib/managersFilters";

// The filters of Shipments → Managers as its two endpoints (the cockpit, the Money tab) read them.

describe("the managers' filters", () => {
  it("reads what is left out as all, and everyone's jobs", () => {
    expect(managersFilters({})).toEqual({ filters: { mode: "all", direction: "all", handledBy: null, reports: "all" } });
  });

  it("takes each value it knows", () => {
    for (const mode of MANAGERS_MODES) expect(managersFilters({ mode })).toMatchObject({ filters: { mode } });
    for (const direction of MANAGERS_DIRECTIONS) expect(managersFilters({ direction })).toMatchObject({ filters: { direction } });
    for (const reports of MANAGERS_REPORTS) expect(managersFilters({ reports })).toMatchObject({ filters: { reports } });
    expect(managersFilters({ mode: "air", direction: "export", handledBy: "jan@firma.cz", reports: "mine" })).toEqual({ filters: { mode: "air", direction: "export", handledBy: "jan@firma.cz", reports: "mine" } });
  });

  it("trims the Handled By, and reads an empty one as everyone", () => {
    expect(managersFilters({ handledBy: "  jan@firma.cz " })).toMatchObject({ filters: { handledBy: "jan@firma.cz" } });
    expect(managersFilters({ handledBy: "nobody" })).toMatchObject({ filters: { handledBy: "nobody" } });
    expect(managersFilters({ handledBy: "   " })).toMatchObject({ filters: { handledBy: null } });
  });

  it("says which filter is none of its values, in the words the endpoints answer with", () => {
    expect(managersFilters({ mode: "ship" })).toEqual({ problem: "mode must be one of all, sea, air, rail, road" });
    expect(managersFilters({ direction: "Import" })).toEqual({ problem: "direction must be one of all, import, export, domestic" });
    expect(managersFilters({ reports: "theirs" })).toEqual({ problem: "reports must be one of all, mine" });
    // An empty value is no value: as before, it is refused rather than read as "all".
    expect(managersFilters({ mode: "" })).toEqual({ problem: "mode must be one of all, sea, air, rail, road" });
  });
});
