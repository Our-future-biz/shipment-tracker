import { describe, expect, it } from "vitest";
import { keepsToItsAddress, rememberedAfter } from "./rememberedFilters";
import { tileHref } from "../managers/_lib/cockpitAddress";

const address = (query: string) => new URLSearchParams(query);
const on = { status: "all", filters: [] };

describe("the list entered by a link that keeps to its address", () => {
  it("is one with a tile or a filter of its own - a tile of Shipments → Managers among them - or Show all from the main search", () => {
    const cockpitTile = tileHref("active", { mode: "sea", direction: "import", handledBy: null, reports: "all" })!;
    for (const query of [cockpitTile.split("?")[1]!, "tile=claims", "handledBy=nobody", "mode=air", "direction=export", "customs=urgent", "q=Alza&fields=all"]) {
      expect(keepsToItsAddress(address(query), false), query).toBe(true);
    }
  });

  it("is not a plain arrival, a search, a status or column filters", () => {
    for (const query of ["", "q=CZ0001", "status=active", "f.customer=Alza", "tile=all"]) expect(keepsToItsAddress(address(query), false), query).toBe(false);
  });

  it("is only Show all on a view of another page: the views take no tile links", () => {
    expect(keepsToItsAddress(address("tile=active&mode=air"), true)).toBe(false);
    expect(keepsToItsAddress(address("q=Alza&fields=all"), true)).toBe(true);
  });
});

describe("what the list remembers once the user changes a filter", () => {
  const remembered = { status: "customs", filters: [{ key: "customer", value: "Alza" }] };

  it("is the filters on screen with the change, on a plain arrival", () => {
    expect(rememberedAfter(remembered, { status: "in-transit" }, false)).toEqual({ status: "in-transit", filters: [{ key: "customer", value: "Alza" }] });
    expect(rememberedAfter(on, { filters: [{ key: "pol", value: "Hamburg" }] }, false)).toEqual({ status: "all", filters: [{ key: "pol", value: "Hamburg" }] });
  });

  it("keeps My jobs with the rest, on or off (mock council S9-1)", () => {
    expect(rememberedAfter({ ...remembered, mine: false }, { mine: true }, false)).toEqual({ ...remembered, mine: true });
    expect(rememberedAfter({ ...remembered, mine: true }, { status: "active" }, false)).toEqual({ status: "active", filters: remembered.filters, mine: true });
    expect(rememberedAfter({ ...remembered, mine: false }, { mine: true }, true)).toBeNull();
  });

  it("is nothing on a page entered by such a link: the link's filters never take the place of those remembered", () => {
    // A cockpit tile opened the list with its own filters, no Status and no column filter; a Status
    // picked there must not write that empty set over the remembered column filters.
    expect(rememberedAfter(on, { status: "active" }, true)).toBeNull();
    // Nor a column filter set there, the link's own ones with it.
    expect(rememberedAfter({ status: "all", filters: [{ key: "tradeDirection", value: "Import" }] }, { filters: [{ key: "tradeDirection", value: "Import" }, { key: "pol", value: "Hamburg" }] }, true)).toBeNull();
  });
});
