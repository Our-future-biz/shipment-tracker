import { describe, expect, it } from "vitest";
import { LIFECYCLE_VALUES, isDayOnly, lifecycleText, stageLabel, stageOrder, stageTone } from "./lifecycle";

const lc = (stage: string, refused = false) => ({ stage, label: "server label", at: null, refused, steps: [] });

describe("lifecycle display", () => {
  it("labels and colours every stage, in process order", () => {
    expect(LIFECYCLE_VALUES).toEqual(["Expected", "Arrived", "Received", "In warehouse", "Stuffed", "Ready for release", "Left"]);
    expect(stageLabel("in_warehouse")).toBe("In warehouse");
    expect(stageLabel("ready")).toBe("Ready for release");
    expect(stageTone("left")).toBe("g");
    expect(stageTone("expected")).toBe("");
    expect(stageOrder("expected")).toBeLessThan(stageOrder("received"));
    expect(stageOrder("stuffed")).toBeLessThan(stageOrder("left"));
  });

  it("falls back to the server's label for an unknown stage", () => {
    expect(stageLabel("somethingNew", "Something new")).toBe("Something new");
    expect(stageTone("somethingNew")).toBe("");
    expect(stageOrder("somethingNew")).toBe(7);
  });

  it("reads one word for grids, with Refused next to the stage", () => {
    expect(lifecycleText(lc("received"))).toBe("Received");
    expect(lifecycleText(lc("expected", true))).toBe("Expected · Refused");
    expect(lifecycleText(null)).toBe("");
  });

  it("tells a typed day from a time", () => {
    expect(isDayOnly("2026-10-14")).toBe(true);
    expect(isDayOnly("2026-10-14T08:00:00.000Z")).toBe(false);
    expect(isDayOnly(null)).toBe(false);
  });
});
