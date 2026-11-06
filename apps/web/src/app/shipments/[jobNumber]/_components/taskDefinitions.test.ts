import { describe, expect, it } from "vitest";
import { CUSTOMS_CLEARED, EXPORT_TASKS, IMPORT_TASKS, freightKindOf, getActiveStage, getActiveStageFromTasks, getStageFromFacts, getTasksForDirection } from "./taskDefinitions";

const doneSet = (keys: string[]) => (key: string) => keys.includes(key);

describe("getActiveStageFromTasks", () => {
  it("starts on the first stage when nothing is done", () => {
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet([]))).toBe(0);
  });

  it("stays on a stage while some of its tasks are open", () => {
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet(["imp_booking_to_agent"]))).toBe(0);
  });

  it("moves on once every task of the stage is done", () => {
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet(["imp_booking_to_agent", "imp_booking_confirmed"]))).toBe(1);
  });

  it("still jumps to the furthest stage a done task belongs to", () => {
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet(["imp_cargo_shipped"]))).toBe(2);
  });

  it("moves past the furthest stage when that stage is complete", () => {
    // Stage 1 of the import list has one task.
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet(["imp_cargo_readiness"]))).toBe(2);
  });

  it("shows every stage done when every task is done", () => {
    for (const list of [IMPORT_TASKS, EXPORT_TASKS]) {
      expect(getActiveStageFromTasks(list, doneSet(list.map((t) => t.key)))).toBe(6);
    }
  });

  it("keeps the last stage active until all its tasks are done", () => {
    const allButOne = IMPORT_TASKS.map((t) => t.key).filter((k) => k !== "imp_extra_costs");
    expect(getActiveStageFromTasks(IMPORT_TASKS, doneSet(allButOne))).toBe(5);
  });
});

describe("getStageFromFacts", () => {
  it("says nothing without a date", () => {
    expect(getStageFromFacts({})).toBe(0);
    expect(getStageFromFacts({ customsStatus: "Paperwork Verified" })).toBe(0);
  });

  it("takes each fact to its stage", () => {
    expect(getStageFromFacts({ actualDeparture: "2026-09-20" })).toBe(2);
    expect(getStageFromFacts({ actualDeparture: "2026-09-20", actualArrival: "2026-10-16" })).toBe(4);
    expect(getStageFromFacts({ actualArrival: "2026-10-16", customsStatus: CUSTOMS_CLEARED })).toBe(5);
    expect(getStageFromFacts({ actualDeliveryDate: "2026-10-22" })).toBe(6);
  });

  it("doesn't read an export's customs clearance as being past arrival", () => {
    expect(getStageFromFacts({ tradeDirection: "Export", customsStatus: CUSTOMS_CLEARED })).toBe(0);
    expect(getStageFromFacts({ tradeDirection: "Export", customsStatus: CUSTOMS_CLEARED, actualDeparture: "2026-09-20" })).toBe(2);
  });
});

describe("getActiveStage", () => {
  it("moves a shipment forward on a date nobody ticked", () => {
    expect(getActiveStage(IMPORT_TASKS, doneSet([]), { actualArrival: "2026-10-16" })).toBe(4);
  });

  it("never moves it back: the ticks can be ahead of the dates", () => {
    expect(getActiveStage(IMPORT_TASKS, doneSet(["imp_customs_cleared"]), { actualDeparture: "2026-09-20" })).toBe(4);
  });
});

describe("getTasksForDirection", () => {
  const keys = (direction: string, mode?: string) => getTasksForDirection(direction, mode).map((t) => t.key);
  const label = (direction: string, mode: string, key: string) => getTasksForDirection(direction, mode).find((t) => t.key === key)?.label;

  it("is the full list for sea and for a job without a mode", () => {
    expect(getTasksForDirection("Import", "Sea Freight")).toEqual(IMPORT_TASKS);
    expect(getTasksForDirection("Export", "Sea Freight")).toEqual(EXPORT_TASKS);
    expect(getTasksForDirection("Export")).toEqual(EXPORT_TASKS);
  });

  it("drops the sea's filings on a flight and words it for the air", () => {
    const air = keys("Export", "Air Freight");
    expect(air).not.toContain("exp_vgm_filed");
    expect(air).not.toContain("exp_si_filed");
    expect(air).not.toContain("exp_ams_filed");
    expect(label("Export", "Air Freight", "exp_booked_line")).toBe("Booked with airline");
    expect(label("Export", "Air Freight", "exp_bl_provided")).toBe("Air Waybill provided to customer");
  });

  it("keeps a train's shipping instructions", () => {
    const rail = keys("Export", "Rail Freight");
    expect(rail).toContain("exp_si_filed");
    expect(rail).not.toContain("exp_vgm_filed");
    expect(label("Export", "Rail Freight", "exp_booked_line")).toBe("Booked with rail operator");
  });

  it("gives a road job only what isn't a Trucking stamp", () => {
    expect(keys("Domestic", "Sea Freight")).toEqual(["imp_booking_confirmed", "imp_cargo_readiness", "imp_booked_transport", "imp_billed", "imp_delivered", "imp_extra_costs"]);
    expect(keys("Import", "Road Freight")).not.toContain("imp_cargo_shipped");
    expect(label("Export", "Road Freight", "exp_booked_line")).toBe("Booked with haulier");
  });

  it("changes neither list it reads from", () => {
    getTasksForDirection("Export", "Air Freight");
    expect(EXPORT_TASKS.find((t) => t.key === "exp_booked_line")?.label).toBe("Booked with shipping line");
  });

  it("tells the modes apart as the server does", () => {
    expect(freightKindOf("Import", "Air Freight")).toBe("air");
    expect(freightKindOf("Domestic", "Rail Freight")).toBe("road");
    expect(freightKindOf("Import", "")).toBe("sea");
  });
});
