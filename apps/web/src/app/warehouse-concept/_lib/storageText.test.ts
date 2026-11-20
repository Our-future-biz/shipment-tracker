import { describe, expect, it } from "vitest";
import type { interfaces } from "@/lib/api/client";
import { storageHint } from "./storageText";

const running = (startSource: string): interfaces.GateStorageInfo => ({
  started: true,
  stopped: false,
  state: "Within free time",
  freeDays: 7,
  freeDaysLeft: 5,
  daysInWarehouse: 3,
  chargeableDays: 0,
  estimatedCzk: 0,
  dailyCzk: 120,
  startDate: "2026-11-18",
  stopDate: "",
  lastFreeDay: "2026-11-24",
  wm: 1,
  startSource,
});

describe("storage hover text", () => {
  it("says how the receipt that started the clock was made", () => {
    expect(storageHint(running("tally"))).toMatch(/^Received 2026-11-18 \(day 1, ticked off at the stripping tally\)/);
    // Loose import cargo received by its receipt (Q19).
    expect(storageHint(running("receipt"))).toMatch(/^Received 2026-11-18 \(day 1, at its receipt in the warehouse\)/);
    expect(storageHint(running("loadInDate"))).toMatch(/^Received 2026-11-18 \(day 1\)/);
  });
});
