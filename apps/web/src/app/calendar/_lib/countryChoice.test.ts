import { describe, expect, it } from "vitest";
import { ALL_COUNTRIES_MARK, NO_OTHER_COUNTRY_MARK, chosenCountries, countryChoice, keptAfterPick, pickerPlaceholder, pickerValue } from "./countryChoice";

const FALLBACK = ["Germany"];

describe("the user's country choice (mock council R21)", () => {
  it("gives a user who never picked the default countries, shown as picked", () => {
    const choice = countryChoice([], FALLBACK);
    expect(choice).toEqual({ kind: "default", countries: ["Germany"] });
    expect(chosenCountries(choice)).toEqual(["Germany"]);
    expect(pickerValue(choice)).toEqual(["Germany"]);
  });

  it("keeps a choice of no other country: the Czech holidays only, not the default back", () => {
    const choice = countryChoice([NO_OTHER_COUNTRY_MARK], FALLBACK);
    expect(choice).toEqual({ kind: "none" });
    expect(chosenCountries(choice)).toEqual([]);
    expect(pickerValue(choice)).toEqual([]);
    expect(pickerPlaceholder(choice)).toMatch(/Czech holidays only/);
  });

  it("keeps a choice of every country", () => {
    const choice = countryChoice([ALL_COUNTRIES_MARK, "Austria"], FALLBACK);
    expect(choice).toEqual({ kind: "all" });
    expect(chosenCountries(choice)).toBeNull();
    expect(pickerValue(choice)).toEqual([ALL_COUNTRIES_MARK]);
  });

  it("reads the countries picked, a stray mark beside them left out", () => {
    expect(countryChoice(["Austria", NO_OTHER_COUNTRY_MARK], FALLBACK)).toEqual({ kind: "picked", countries: ["Austria"] });
  });
});

describe("what a picker keeps after a change", () => {
  const OFFERED = ["Austria", "Germany"];

  it("keeps no other country when the last one is taken out, never the empty list", () => {
    expect(keptAfterPick(["Germany"], OFFERED, ["Germany"], [])).toEqual([NO_OTHER_COUNTRY_MARK]);
    // The default shown as picked, then one of it taken out: the rest is now the user's own choice.
    expect(keptAfterPick([], OFFERED, ["Austria", "Germany"], ["Austria"])).toEqual(["Austria"]);
  });

  it("replaces the countries with All countries just picked, and All countries with a country picked then", () => {
    expect(keptAfterPick(["Germany"], OFFERED, ["Germany"], ["Germany", ALL_COUNTRIES_MARK])).toEqual([ALL_COUNTRIES_MARK]);
    expect(keptAfterPick([ALL_COUNTRIES_MARK], OFFERED, [ALL_COUNTRIES_MARK], [ALL_COUNTRIES_MARK, "Austria"])).toEqual(["Austria"]);
    expect(keptAfterPick([ALL_COUNTRIES_MARK], OFFERED, [ALL_COUNTRIES_MARK], [])).toEqual([NO_OTHER_COUNTRY_MARK]);
  });

  it("keeps the saved picks the picker does not offer", () => {
    expect(keptAfterPick(["Czechia", "Germany", "Gone"], OFFERED, ["Germany"], ["Austria"])).toEqual(["Czechia", "Gone", "Austria"]);
    expect(keptAfterPick(["Czechia", NO_OTHER_COUNTRY_MARK], OFFERED, [], [])).toEqual(["Czechia"]);
  });
});
