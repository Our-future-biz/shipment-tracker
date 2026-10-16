import { describe, expect, it } from "vitest";
import { byNumber, byText, dash, place, pragueDate } from "./format";

describe("trucking display helpers", () => {
  it("sorts text the Czech way and numbers with a missing one first", () => {
    expect(["Řevnice", "Rakovník", "Cvikov", "Čáslav"].sort(byText)).toEqual(["Cvikov", "Čáslav", "Rakovník", "Řevnice"]);
    expect([3, null, 1].sort(byNumber)).toEqual([null, 1, 3]);
  });

  it("writes a postcode spaced before its city", () => {
    expect(place("11000", "Praha")).toBe("110 00 Praha");
    expect(place("", "Brno")).toBe("Brno");
    expect(place("", "")).toBe("");
  });

  it("draws an empty cell as a grey dash", () => {
    expect(dash.props).toMatchObject({ className: "text-slate-400", children: "—" });
  });

  it("dates a stored time by Prague's calendar", () => {
    // 23:30 UTC on 15 Oct is already 16 Oct in Prague.
    expect(pragueDate("2026-10-15T23:30:00Z")).toBe("16.10.2026");
    expect(pragueDate(null)).toBe("");
  });
});
