import { describe, expect, it } from "vitest";
import { cardWithFieldToggled, cardWithoutChoice, parseCardFields, visibleCardKeys } from "./cardFields";

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

  it("come from stored JSON, anything else being no choice", () => {
    expect(parseCardFields('{"route":["pol"]}')).toEqual({ route: ["pol"] });
    expect(parseCardFields("not json")).toEqual({});
    expect(parseCardFields(null)).toEqual({});
  });
});
