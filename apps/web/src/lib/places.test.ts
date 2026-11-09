import { describe, expect, it } from "vitest";
import { isUnmatched, placeCodeOf, tradeDirectionTo } from "./places";

describe("the Trade Direction of cargo going to a place", () => {
  it("is an import to the Czech Republic and an export anywhere else", () => {
    expect(tradeDirectionTo("Prague (CZPRG)")).toBe("Import");
    expect(tradeDirectionTo("Hamburg (DEHAM)")).toBe("Export");
    expect(tradeDirectionTo("Duisburg DIT (DE-IT116)")).toBe("Export");
  });

  it("is not told by a value that doesn't say the country", () => {
    expect(tradeDirectionTo("Kladno")).toBeNull();
    expect(tradeDirectionTo("Václav Havel Airport Prague (PRG)")).toBeNull();
    expect(tradeDirectionTo(undefined)).toBeNull();
  });
});

describe("a stored place", () => {
  it("is from the database as a UN/LOCODE place, an IATA airport, an ocean terminal (CY) or an inland terminal", () => {
    expect(isUnmatched("place", "Hamburg (DEHAM)")).toBe(false);
    expect(isUnmatched("place", "Václav Havel Airport Prague (PRG)")).toBe(false);
    expect(isUnmatched("place", "HHLA CONTAINER TERMINAL BURCHARDKAI (CTB) (DEHAMCTB)")).toBe(false);
    expect(isUnmatched("place", "DP WORLD JEBEL ALI - CT2 (AEJEADPWJ2)")).toBe(false);
    expect(isUnmatched("place", "Duisburg DIT (DE-IT116)")).toBe(false);
    expect(isUnmatched("place", "Container Terminal, Mobile (US-RR004)")).toBe(false);
    expect(isUnmatched("place", "Haqueena, Mimana (AF-DP001)")).toBe(false);
  });

  it("is flagged in any other form", () => {
    expect(isUnmatched("place", "PORT OF HALIFAX, CANADA")).toBe(true);
    expect(isUnmatched("place", "Somewhere (DEHAMTOOLONG1)")).toBe(true);
    expect(isUnmatched("place", "Somewhere (DE-XX1)")).toBe(true);
    expect(isUnmatched("place", "")).toBe(false);
  });
});

describe("placeCodeOf", () => {
  it("reads the code of a stored place, airport or terminal", () => {
    expect(placeCodeOf("Hamburg (DEHAM)")).toBe("DEHAM");
    expect(placeCodeOf("Shanghai Pudong International Airport (PVG)")).toBe("PVG");
    expect(placeCodeOf("HHLA CONTAINER TERMINAL BURCHARDKAI (CTB) (DEHAMCTB)")).toBe("DEHAMCTB");
    expect(placeCodeOf("Duisburg DIT (DE-IT116)")).toBe("DE-IT116");
  });
  it("is null for anything not in the database's form", () => {
    expect(placeCodeOf("PORT OF HALIFAX, CANADA")).toBeNull();
    expect(placeCodeOf("")).toBeNull();
    expect(placeCodeOf(null)).toBeNull();
  });
});
