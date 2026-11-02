import { describe, expect, it } from "vitest";
import { isUnmatched } from "./places";

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
