import { describe, expect, it } from "vitest";
import { checkContainerWeight } from "./containerWeight";

const level = (type: string, kg: number) => checkContainerWeight(type, kg)?.level;

describe("checkContainerWeight", () => {
  it("20' DC: standard up to 26,200, heavy tested up to 28,000, the line's confirmation up to 28,250, then too heavy", () => {
    expect(level("20' DC", 26200)).toBe("standard");
    expect(level("20' DC", 26201)).toBe("heavyTested");
    expect(level("20' DC", 28000)).toBe("heavyTested");
    expect(level("20' DC", 28001)).toBe("confirm");
    expect(level("20' DC", 28250)).toBe("confirm");
    expect(level("20' DC", 28251)).toBe("tooHeavy");
    // The line under the container shows the most a heavy-tested box takes.
    expect(checkContainerWeight("20' DC", 0)).toEqual({ standard: 26200, max: 28250, heavyTested: true, level: "standard" });
  });

  it("reads a box saved as GP by the limits of the DC", () => {
    expect(level("20' GP", 28001)).toBe("confirm");
    expect(level("40' GP", 28501)).toBe("tooHeavy");
  });

  it("40' DC, 40' HC and 45' HQ go from heavy tested straight to too heavy", () => {
    expect([26500, 28500, 28501].map((kg) => level("40' DC", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
    expect([26200, 28400, 28401].map((kg) => level("40' HC", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
    expect([27700, 28800, 28801].map((kg) => level("45' HQ", kg))).toEqual(["standard", "heavyTested", "tooHeavy"]);
  });

  it("an empty weight is within any limit", () => {
    expect(checkContainerWeight("40' HC", undefined)?.level).toBe("standard");
  });

  it("reefers have no heavy-tested box: past standard the shipping line has to confirm it, up to the max", () => {
    expect([27470, 27471, 29140, 29141].map((kg) => level("20' RF", kg))).toEqual(["standard", "confirm", "confirm", "tooHeavy"]);
    expect([27600, 27601, 29000, 29001].map((kg) => level("40' HRF", kg))).toEqual(["standard", "confirm", "confirm", "tooHeavy"]);
    expect(checkContainerWeight("40' HRF", 0)).toEqual({ standard: 27600, max: 29000, heavyTested: false, level: "standard" });
  });

  it("open tops and flat racks work as reefers: past standard the shipping line confirms it, up to the max", () => {
    const bands: [string, number, number][] = [
      ["20' OT", 28000, 30050],
      ["20' HOT", 27570, 27970],
      ["20' FR", 31250, 42100],
      ["40' OT", 26600, 28550],
      ["40' HOT", 28250, 28650],
      ["40' FR", 47100, 47400],
      ["40' HFR", 47300, 49100],
    ];
    for (const [type, standard, max] of bands) {
      expect([standard, standard + 1, max, max + 1].map((kg) => level(type, kg)), type).toEqual(["standard", "confirm", "confirm", "tooHeavy"]);
      expect(checkContainerWeight(type, 0), type).toEqual({ standard, max, heavyTested: false, level: "standard" });
    }
  });

  it("every equipment offered has limits", async () => {
    const { CONTAINER_TYPES } = await import("@/lib/cargo");
    expect(CONTAINER_TYPES.filter((t) => !checkContainerWeight(t, 0))).toEqual([]);
  });

  it("equipment no longer offered and unknown names have none", () => {
    expect(["40' RF", "40' HR", "20' HC", "", "constructor"].map((t) => checkContainerWeight(t, 30000))).toEqual([null, null, null, null, null]);
    expect(checkContainerWeight(undefined, 30000)).toBeNull();
  });
});
