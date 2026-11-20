import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/api", () => ({ api: {} }));

import { codedOption, optionGroups } from "./GeoSelect";

// User council O1 / S10, owner's answer Q3: the code leads, so a long name cut by the list never hides it.
describe("codedOption", () => {
  it("shows the code before the name, and stores the place as Name (CODE)", () => {
    const option = codedOption("CNPVG", "Shanghai Pudong International Apt", "Shanghai Shi, CN");
    expect(option.value).toBe("Shanghai Pudong International Apt (CNPVG)");
    const text = renderToStaticMarkup(option.label as ReactElement).replace(/<[^>]+>/g, "");
    expect(text.indexOf("CNPVG")).toBeLessThan(text.indexOf("Shanghai Pudong"));
    expect(text).toContain("Shanghai Shi, CN");
  });
});

describe("optionGroups", () => {
  const lists = { airports: ["PRG"], terminals: [], inland: ["CZMEL"], places: ["CZPRG"] };

  it("lists airports and terminals before the places, the empty groups left out", () => {
    expect(optionGroups(lists, false).map((g) => g.label)).toEqual(["Airports (IATA)", "Inland terminals", "Places (UN/LOCODE)"]);
  });

  // User council S22: a door pick-up or delivery place is a city more often than an airport.
  it("lists the places first with placesFirst", () => {
    expect(optionGroups(lists, true).map((g) => g.label)).toEqual(["Places (UN/LOCODE)", "Airports (IATA)", "Inland terminals"]);
  });
});
