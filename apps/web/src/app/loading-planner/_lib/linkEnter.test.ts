import { describe, expect, it } from "vitest";
import { highlightsOption, linksOnEnter } from "./linkEnter";

describe("Enter in Link to a shipment or quote (Council Outlay 14, P5)", () => {
  const offered = ["CZLCL00000053", "CZLCL00000531"];

  it("links the job typed in full, though the search found it and lists it", () => {
    expect(linksOnEnter("CZLCL00000053", offered, false)).toBe(true);
    expect(linksOnEnter(" czlcl00000053 ", offered, true)).toBe(true);
  });

  it("links what is typed while no offered job is highlighted, found or not", () => {
    expect(linksOnEnter("CZ00000099", [], false)).toBe(true);
    expect(linksOnEnter("CZLCL0000", offered, false)).toBe(true);
  });

  it("only picks the highlighted job into the field while what is typed is not one of them", () => {
    expect(linksOnEnter("CZLCL0000", offered, true)).toBe(false);
    expect(linksOnEnter("", offered, true)).toBe(false);
  });

  it("reads a highlighted option off the field's aria-activedescendant", () => {
    expect(highlightsOption("rc_select_3_list_0")).toBe(true);
    expect(highlightsOption("rc_select_3_list_-1")).toBe(false);
    expect(highlightsOption(null)).toBe(false);
    expect(highlightsOption(undefined)).toBe(false);
  });
});
