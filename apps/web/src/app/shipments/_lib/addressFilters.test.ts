import { describe, expect, it } from "vitest";
import { addressFiltersKey, addressFiltersOf, arrivesByLink, withoutAddressFilter } from "./addressFilters";

const of = (query: string) => addressFiltersOf(new URLSearchParams(query));
const labels = (query: string) => of(query).chips.map((c) => c.label);

describe("the filters the Shipments list takes from its address", () => {
  it("has none on a plain address, or one that only searches, picks a status or an Overview tile", () => {
    for (const query of ["", "q=CZ0001", "status=active", "tile=active", "tile=etamoved&status=customs&f.customer=Alza", "fromQuote=QCZ00000012&another=1"]) {
      expect(of(query), query).toEqual({ request: {}, chips: [] });
    }
  });

  it("names the person in the Handled By chip, the e-mail still asked for (mock council S7-5)", () => {
    const names = new Map([["eva.mala@firma.cz", "Eva Malá"]]);
    expect(addressFiltersOf(new URLSearchParams("handledBy=eva.mala@firma.cz"), names)).toEqual({
      request: { handledBy: "eva.mala@firma.cz" },
      chips: [{ param: "handledBy", label: "Handled By: Eva Malá" }],
    });
    // Nobody of that e-mail: as it was asked for.
    expect(addressFiltersOf(new URLSearchParams("handledBy=jan@firma.cz"), names).chips[0]!.label).toBe("Handled By: jan@firma.cz");
  });

  it("reads Handled By: a person's e-mail, or nobody", () => {
    expect(of("handledBy=jan%40firma.cz")).toEqual({
      request: { handledBy: "jan@firma.cz" },
      chips: [{ param: "handledBy", label: "Handled By: jan@firma.cz" }],
    });
    expect(of("handledBy=nobody")).toEqual({ request: { handledBy: "nobody" }, chips: [{ param: "handledBy", label: "Handled By: nobody" }] });
    // Written in any case, it is still nobody and not a person called so.
    expect(of("handledBy=Nobody").request.handledBy).toBe("nobody");
    expect(labels("handledBy=%20NOBODY%20")).toEqual(["Handled By: nobody"]);
    // Spaces around an e-mail are not part of it; an empty value asks for nothing.
    expect(of("handledBy=%20Jan%40Firma.cz%20").request.handledBy).toBe("Jan@Firma.cz");
    expect(of("handledBy=")).toEqual({ request: {}, chips: [] });
    expect(of("handledBy=%20%20")).toEqual({ request: {}, chips: [] });
  });

  it("reads the mode, in the page's words", () => {
    expect(of("mode=air")).toEqual({ request: { mode: "air" }, chips: [{ param: "mode", label: "Mode: Air" }] });
    expect(labels("mode=sea")).toEqual(["Mode: Sea"]);
    expect(labels("mode=rail")).toEqual(["Mode: Rail"]);
    expect(labels("mode=road")).toEqual(["Mode: Road"]);
    expect(of("mode=Air").request.mode).toBe("air");
  });

  it("reads the Trade Direction, in the page's words, however it was written", () => {
    expect(of("direction=import")).toEqual({ request: { direction: "import" }, chips: [{ param: "direction", label: "Trade Direction: Import" }] });
    expect(labels("direction=export")).toEqual(["Trade Direction: Export"]);
    expect(labels("direction=domestic")).toEqual(["Trade Direction: Domestic"]);
    // The column's own spelling, or spaces around it: still the filter.
    expect(of("direction=Import").request.direction).toBe("import");
    expect(of("direction=%20EXPORT%20").request.direction).toBe("export");
  });

  it("reads Customs urgent and Arrived, not released for billing", () => {
    expect(of("customs=urgent")).toEqual({ request: { customs: "urgent" }, chips: [{ param: "customs", label: "Customs: urgent" }] });
    expect(of("invoicing=unbilled-arrivals")).toEqual({
      request: { invoicing: "unbilled-arrivals" },
      chips: [{ param: "invoicing", label: "Arrived, not released for billing" }],
    });
  });

  it("names the managers' tile the Overview does not have, and leaves the Overview's own to light themselves", () => {
    expect(of("tile=claims")).toEqual({ request: {}, chips: [{ param: "tile", label: "Open claims" }] });
    for (const tile of ["active", "attention", "etamoved", "import", "export", "week", "nextweek", "all"]) expect(labels(`tile=${tile}`), tile).toEqual([]);
  });

  it("names no cut-off or booking tile: the list has no such filter, the cockpit narrows its own cards", () => {
    for (const tile of ["cutoffs", "booking-pending"]) expect(of(`tile=${tile}`), tile).toEqual({ request: {}, chips: [] });
  });

  it("ignores a value the list does not know: no chip, nothing sent", () => {
    for (const query of ["mode=all", "mode=ship", "mode=", "direction=all", "direction=inbound", "direction=", "direction=toString", "customs=later", "customs=", "invoicing=invoiced", "invoicing=billing", "tile=free-time", "tile=toString", "mode=constructor", "customs=__proto__"]) {
      expect(of(query), query).toEqual({ request: {}, chips: [] });
    }
    // The ones it knows still count beside one it does not.
    expect(of("mode=ship&customs=urgent")).toEqual({ request: { customs: "urgent" }, chips: [{ param: "customs", label: "Customs: urgent" }] });
  });

  it("combines them, the chips in one order whatever the address's", () => {
    const all = of("tile=claims&invoicing=unbilled-arrivals&customs=urgent&direction=export&mode=air&handledBy=jan%40firma.cz&q=CZ&status=active");
    expect(all.request).toEqual({ handledBy: "jan@firma.cz", mode: "air", direction: "export", customs: "urgent", invoicing: "unbilled-arrivals" });
    expect(all.chips.map((c) => c.label)).toEqual(["Handled By: jan@firma.cz", "Mode: Air", "Trade Direction: Export", "Customs: urgent", "Arrived, not released for billing", "Open claims"]);
    // An Overview tile combined with them stays the Overview's.
    expect(labels("tile=active&customs=urgent&mode=air&handledBy=jan%40firma.cz")).toEqual(["Handled By: jan@firma.cz", "Mode: Air", "Customs: urgent"]);
  });
});

describe("an address that is a link's", () => {
  const byLink = (query: string) => arrivesByLink(new URLSearchParams(query));

  it("is one that names a tile or holds one of the filters: the remembered ones are not added to it", () => {
    for (const query of [
      "tile=active",
      "tile=etamoved",
      "tile=claims",
      "tile=claims&mode=air",
      "handledBy=nobody",
      "handledBy=jan%40firma.cz",
      "mode=road",
      "direction=import",
      "customs=urgent",
      "invoicing=unbilled-arrivals",
      "customs=urgent&status=active&f.customer=Alza",
    ]) {
      expect(byLink(query), query).toBe(true);
    }
  });

  it("is not a plain arrival, a search, a status or column filters, or a value the list does not know", () => {
    for (const query of ["", "q=CZ0001", "status=active", "f.customer=Alza", "f.tradeDirection=Import", "chat=ship-id", "fromQuote=QCZ00000012", "tile=", "tile=all", "mode=ship", "mode=all", "direction=all", "customs=later", "invoicing=invoiced", "handledBy=%20"]) {
      expect(byLink(query), query).toBe(false);
    }
  });
});

describe("what sends the list back to its first page", () => {
  const key = (query: string) => addressFiltersKey(new URLSearchParams(query));

  it("changes when a filter is set, changed or cleared", () => {
    const start = key("tile=active&customs=urgent&mode=air&handledBy=jan%40firma.cz");
    expect(key("tile=active&customs=urgent&mode=sea&handledBy=jan%40firma.cz")).not.toBe(start);
    expect(key("tile=active&customs=urgent&mode=air&handledBy=nobody")).not.toBe(start);
    expect(key("tile=active&mode=air&handledBy=jan%40firma.cz")).not.toBe(start);
    expect(key("tile=active&customs=urgent&mode=air&handledBy=jan%40firma.cz&invoicing=unbilled-arrivals")).not.toBe(start);
    expect(key("tile=active&customs=urgent&mode=air&handledBy=jan%40firma.cz&direction=import")).not.toBe(start);
    expect(key("direction=import")).not.toBe(key("direction=export"));
    expect(key("")).not.toBe(start);
    // One filter's value is never read as another's.
    expect(key("handledBy=air")).not.toBe(key("mode=air"));
    expect(key("customs=urgent")).not.toBe(key("handledBy=urgent"));
    expect(key("direction=import")).not.toBe(key("handledBy=import"));
  });

  it("stays as it is for anything else in the address", () => {
    const start = key("customs=urgent&mode=air");
    expect(key("mode=AIR&customs=urgent&q=CZ&status=active&tile=claims&f.customer=Alza&chat=x")).toBe(start);
    expect(key("q=CZ")).toBe(key(""));
    // A value the list does not know filters nothing, so setting or dropping it moves no page.
    expect(key("mode=ship&customs=later")).toBe(key(""));
  });
});

describe("clearing a chip", () => {
  const address = new URLSearchParams("tile=active&customs=urgent&mode=air&handledBy=jan%40firma.cz&q=CZ&status=active&f.customer=Alza");

  it("takes only its own parameter out of the address", () => {
    expect(withoutAddressFilter(address, "mode").toString()).toBe("tile=active&customs=urgent&handledBy=jan%40firma.cz&q=CZ&status=active&f.customer=Alza");
    expect(withoutAddressFilter(address, "handledBy").toString()).toBe("tile=active&customs=urgent&mode=air&q=CZ&status=active&f.customer=Alza");
    expect(withoutAddressFilter(address, "customs").get("customs")).toBeNull();
    expect(withoutAddressFilter(new URLSearchParams("tile=claims&mode=sea"), "tile").toString()).toBe("mode=sea");
    expect(withoutAddressFilter(new URLSearchParams("invoicing=unbilled-arrivals"), "invoicing").toString()).toBe("");
    expect(withoutAddressFilter(new URLSearchParams("tile=active&direction=import"), "direction").toString()).toBe("tile=active");
  });

  it("leaves the address it was given as it is", () => {
    withoutAddressFilter(address, "mode");
    expect(address.get("mode")).toBe("air");
  });

  it("leaves no chip for the filter cleared and every other in place", () => {
    const after = addressFiltersOf(withoutAddressFilter(address, "customs"));
    expect(after.chips.map((c) => c.label)).toEqual(["Handled By: jan@firma.cz", "Mode: Air"]);
    expect(after.request).toEqual({ handledBy: "jan@firma.cz", mode: "air" });
  });
});
