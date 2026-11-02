import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { assertTimes, clearStaleTimes } from "../lib/dateTimes";

describe("times beside the dates", () => {
  it("refuses a time that is not HH:MM", () => {
    expect(() => assertTimes({ closingTime: "12:00", pickupTime: "" })).not.toThrow();
    expect(() => assertTimes({ closingTime: "2026-11-05" })).toThrow("closingTime");
  });

  it("drops the time of a date moved to another day without one", () => {
    const existing = { closingDate: "2026-11-20", closingTime: "12:00", vgmClosing: "2026-11-18", vgmClosingTime: "09:00" };
    const moved: Record<string, unknown> = { closingDate: "2026-11-25" };
    clearStaleTimes(moved, existing);
    expect(moved).toEqual({ closingDate: "2026-11-25", closingTime: "" });

    // the same day, a time sent with it, or no time before: left as written
    const same: Record<string, unknown> = { closingDate: "2026-11-20" };
    clearStaleTimes(same, existing);
    expect(same).toEqual({ closingDate: "2026-11-20" });
    const timed: Record<string, unknown> = { closingDate: "2026-11-25", closingTime: "08:00" };
    clearStaleTimes(timed, existing);
    expect(timed).toEqual({ closingDate: "2026-11-25", closingTime: "08:00" });
    const untimed: Record<string, unknown> = { amsDeadline: "2026-11-25" };
    clearStaleTimes(untimed, { amsDeadline: null, amsDeadlineTime: "" });
    expect(untimed).toEqual({ amsDeadline: "2026-11-25" });
  });
});
