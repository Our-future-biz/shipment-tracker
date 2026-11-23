import { describe, expect, it } from "vitest";
import { CAPACITY_CONTAINER_TYPES, containerCapacity, PLANNING_VOLUME_SHARE } from "../containerCapacity";
import { SAILING_CONTAINER_TYPES } from "../../services/shipments/lib/coLoadingSailing";

describe("containerCapacity", () => {
  it("knows every container type a Co-Loading sailing can have, and no other", () => {
    expect([...CAPACITY_CONTAINER_TYPES].sort()).toEqual([...SAILING_CONTAINER_TYPES].sort());
  });

  it("plans a box to 85% of its inside volume", () => {
    expect(PLANNING_VOLUME_SHARE).toBe(0.85);
    expect(containerCapacity("40' HC")).toEqual({ containerType: "40' HC", insideCbm: 76.4, planningCbm: 64.9, standardKg: 26200, heavyTestedKg: 28400, maxKg: 28400 });
    expect(containerCapacity("20' DC")).toMatchObject({ insideCbm: 33.1, planningCbm: 28.1, standardKg: 26200, heavyTestedKg: 28000 });
    expect(containerCapacity("40' DC")).toMatchObject({ insideCbm: 67.5, planningCbm: 57.4 });
    expect(containerCapacity("45' HQ")).toMatchObject({ insideCbm: 86, planningCbm: 73.1 });
    expect(containerCapacity("40' HC", 0.9)?.planningCbm).toBe(68.8);
  });

  it("gives a weight but no volume to reefers, the 20' high-cube open top and flat racks", () => {
    for (const type of ["20' RF", "40' HRF", "20' HOT", "20' FR", "40' FR", "40' HFR"]) {
      expect(containerCapacity(type), type).toMatchObject({ insideCbm: null, planningCbm: null, heavyTestedKg: null });
      expect(containerCapacity(type)!.standardKg, type).toBeGreaterThan(20000);
    }
  });

  it("reads a type saved under its former name, and knows nothing of a type it does not have", () => {
    expect(containerCapacity("20' GP")?.containerType).toBe("20' DC");
    expect(containerCapacity(" 40' HC ")?.containerType).toBe("40' HC");
    expect(containerCapacity("53' HC")).toBeNull();
    expect(containerCapacity("")).toBeNull();
    expect(containerCapacity(null)).toBeNull();
  });
});
