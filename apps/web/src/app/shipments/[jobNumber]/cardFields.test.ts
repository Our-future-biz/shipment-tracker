import { describe, expect, it } from "vitest";
import { cardWithFieldToggled, cardWithoutChoice, parseCardFields, shownColumns, visibleCardKeys } from "./cardFields";

const ALL = ["pol", "pod", "eta", "vessel"];

describe("the fields a shipment card shows", () => {
  it("are all of them while nothing is chosen, and a field added since a choice shows by itself", () => {
    expect(visibleCardKeys({}, "route", ALL)).toEqual(ALL);
    expect(visibleCardKeys({ route: ["pol"], "route#known": ["pol", "pod", "eta"] }, "route", ALL)).toEqual(["pol", "vessel"]);
  });

  it("change one card at a time, the other cards' choices kept", () => {
    const stored = { parties: ["shipper"], "parties#known": ["shipper", "consignee"] };
    const next = cardWithFieldToggled(stored, "route", "eta", ALL);
    expect(next.parties).toEqual(["shipper"]);
    expect(visibleCardKeys(next, "route", ALL)).toEqual(["pol", "pod", "vessel"]);
    // Shown again, in the card's order.
    expect(visibleCardKeys(cardWithFieldToggled(next, "route", "eta", ALL), "route", ALL)).toEqual(ALL);
    expect(cardWithoutChoice(next, "route")).toEqual(stored);
  });

  it("keep what was chosen for the rows a job's freight mode leaves out (fieldsForMode) when a field is toggled on that job", () => {
    const sea = ["vessel", "voyage", "pol"];
    // An air job leaves out the empty Voyage: its card is toggled by the rows it shows.
    const air = ["vessel", "pol"];
    const voyageHidden = cardWithFieldToggled({}, "carrier", "voyage", sea);
    const thenOnAir = cardWithFieldToggled(voyageHidden, "carrier", "pol", air);
    expect(visibleCardKeys(thenOnAir, "carrier", air)).toEqual(["vessel"]);
    expect(visibleCardKeys(thenOnAir, "carrier", sea)).toEqual(["vessel"]);
    // A Voyage shown on sea stays shown, and one nobody ever hid shows on sea as before.
    const polHidden = cardWithFieldToggled({}, "carrier", "pol", sea);
    expect(visibleCardKeys(cardWithFieldToggled(polHidden, "carrier", "vessel", air), "carrier", sea)).toEqual(["voyage"]);
    expect(visibleCardKeys(cardWithFieldToggled({}, "carrier", "pol", air), "carrier", sea)).toEqual(["vessel", "voyage"]);
  });

  it("come from stored JSON, anything else being no choice", () => {
    expect(parseCardFields('{"route":["pol"]}')).toEqual({ route: ["pol"] });
    expect(parseCardFields("not json")).toEqual({});
    expect(parseCardFields(null)).toEqual({});
  });

  it("keep each column of a two-column card in its order, a hidden field leaving only its own column", () => {
    const columns = [[{ key: "pol" }, { key: "pod" }], [{ key: "eta" }, { key: "vessel" }]];
    const stored = cardWithFieldToggled({}, "masterJob.dates", "pod", ["pol", "pod", "eta", "vessel"]);
    const shown = visibleCardKeys(stored, "masterJob.dates", ["pol", "pod", "eta", "vessel"]);
    expect(shownColumns(columns, shown)).toEqual([[{ key: "pol" }], [{ key: "eta" }, { key: "vessel" }]]);
    expect(shownColumns(columns, ["pol", "pod", "eta", "vessel"])).toEqual(columns);
  });

  it("of a master job are its own: hiding one there leaves the shipment card of the same name alone", () => {
    const stored = cardWithFieldToggled({}, "masterJob.overview", "pol", ALL);
    expect(visibleCardKeys(stored, "overview", ALL)).toEqual(ALL);
    expect(visibleCardKeys(stored, "masterJob.overview", ALL)).toEqual(["pod", "eta", "vessel"]);
  });
});
