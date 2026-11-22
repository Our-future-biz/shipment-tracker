import { describe, expect, it } from "vitest";
import type { Branch } from "@/hooks/useOrgUnits";
import { branchOptions, branchesInCountries, countriesOfBranches } from "./branches";

const branches = [
  { id: "prg", name: "Prague", city: "Praha", countryCode: "CZ" },
  { id: "brn", name: "Brno", city: "", countryCode: "CZ" },
  { id: "ham", name: "Hamburg", city: "Hamburg", countryCode: "DE" },
] as unknown as Branch[];

describe("branches for several countries", () => {
  it("offers the branches of every country chosen, or all of them", () => {
    expect(branchOptions(branches, ["CZ"]).map((o) => o.value)).toEqual(["prg", "brn"]);
    expect(branchOptions(branches, ["CZ", "DE"]).map((o) => o.value)).toEqual(["prg", "brn", "ham"]);
    expect(branchOptions(branches).map((o) => o.value)).toEqual(["prg", "brn", "ham"]);
  });

  it("keeps only the chosen branches in the countries chosen", () => {
    expect(branchesInCountries(branches, ["prg", "ham"], ["DE"])).toEqual(["ham"]);
    expect(branchesInCountries(branches, ["prg", "ham"], [])).toEqual(["prg", "ham"]);
  });

  it("names the countries of the chosen branches once each", () => {
    expect(countriesOfBranches(branches, ["prg", "brn", "ham"])).toEqual(["CZ", "DE"]);
  });
});
