import { describe, expect, it } from "vitest";
import { isUnmatched } from "./places";

describe("a stored place", () => {
  it("is from the database as a UN/LOCODE place, an IATA airport or an ocean terminal (CY)", () => {
    expect(isUnmatched("place", "Hamburg (DEHAM)")).toBe(false);
    expect(isUnmatched("place", "Václav Havel Airport Prague (PRG)")).toBe(false);
    expect(isUnmatched("place", "HHLA CONTAINER TERMINAL BURCHARDKAI (CTB) (DEHAMCTB)")).toBe(false);
    expect(isUnmatched("place", "DP WORLD JEBEL ALI - CT2 (AEJEADPWJ2)")).toBe(false);
  });

  it("is flagged in any other form", () => {
    expect(isUnmatched("place", "PORT OF HALIFAX, CANADA")).toBe(true);
    expect(isUnmatched("place", "Somewhere (DEHAMTOOLONG1)")).toBe(true);
    expect(isUnmatched("place", "")).toBe(false);
  });
});
