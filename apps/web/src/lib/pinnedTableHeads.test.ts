import { describe, expect, it } from "vitest";
import { headOffset, scrollsVertically, stickyToTop } from "./pinnedTableHeads";

describe("headOffset", () => {
  it("leaves the titles where they are while the table's top is in view", () => {
    expect(headOffset(200, 800, 30, 70)).toBe(0);
    expect(headOffset(70, 800, 30, 70)).toBe(0);
  });

  it("moves them down as far as the table's top has gone above the line", () => {
    expect(headOffset(-130, 800, 30, 70)).toBe(200);
  });

  it("never moves them below the table's own end", () => {
    expect(headOffset(-2000, 800, 30, 70)).toBe(770);
    expect(headOffset(-2000, 20, 30, 70)).toBe(0);
  });
});

describe("scrollsVertically", () => {
  it("is a box that may scroll and holds more than it shows", () => {
    expect(scrollsVertically("auto", 900, 400)).toBe(true);
    expect(scrollsVertically("scroll", 900, 400)).toBe(true);
  });

  it("is not a box that shows all it holds, or one that never scrolls", () => {
    expect(scrollsVertically("auto", 400, 400)).toBe(false);
    expect(scrollsVertically("visible", 900, 400)).toBe(false);
    expect(scrollsVertically("hidden", 900, 400)).toBe(false);
  });
});

describe("stickyToTop", () => {
  it("is a head, row or cell that CSS already keeps at the top (the tariff sheet preview's head)", () => {
    expect(stickyToTop("sticky", "0px")).toBe(true);
    expect(stickyToTop("sticky", "48px")).toBe(true);
  });

  it("is not one sticky only to the left, nor one that is not sticky", () => {
    expect(stickyToTop("sticky", "auto")).toBe(false);
    expect(stickyToTop("static", "0px")).toBe(false);
    expect(stickyToTop("relative", "auto")).toBe(false);
  });
});
