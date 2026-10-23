import { describe, expect, it } from "vitest";
import { checkContainerWeight } from "./containerWeight";

const level = (type: string, kg: number) => checkContainerWeight(type, kg)?.level;

describe("checkContainerWeight", () => {
  it("20' GP: standard up to 26,200, heavy tested up to 28,000, the line's confirmation up to 28,250, then too heavy", () => {
    expect(level("20' GP", 26200)).toBe("standard");
    expect(level("20' GP", 26201)).toBe("heavyTested");
    expect(level("20' GP", 28000)).toBe("heavyTested");
    expect(level("20' GP", 28001)).toBe("confirm");
    expect(level("20' GP", 28250)).toBe("confirm");
    expect(level("20' GP", 28251)).toBe("tooHeavy");
    // The line under the container shows the most a heavy-tested box takes.
    expect(checkContainerWeight("20' GP", 0)).toEqual({ standard: 26200, heavyTested: 28250, level: "standard" });
  });

  it("40' GP, 40' HC and 45' HQ go from heavy tested straight to too heavy", () => {
    expect([26500, 28500, 28501].map((kg) => level("40' GP", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
    expect([26200, 28400, 28401].map((kg) => level("40' HC", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
    expect([27700, 28800, 28801].map((kg) => level("45' HQ", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
  });

  it("an empty weight is within any limit", () => {
    expect(checkContainerWeight("40' HC", undefined)?.level).toBe("standard");
  });

  it("equipment without agreed limits has none, unknown names included", () => {
    expect(["20' RF", "40' HRF", "20' OT", "40' FR", "", "constructor"].map((t) => checkContainerWeight(t, 30000))).toEqual([null, null, null, null, null, null]);
    expect(checkContainerWeight(undefined, 30000)).toBeNull();
  });
});
