import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { chargeReading, PAGES_PER_HOUR } from "../lib/readingBudget";

describe("the hourly reading budget", () => {
  it("lets a user read up to the budget in an hour, then refuses until the hour has passed", () => {
    const start = Date.parse("2026-10-19T10:00:00Z");
    chargeReading("reader-1", PAGES_PER_HOUR - 1, start);
    chargeReading("reader-1", 1, start + 1000);
    expect(() => chargeReading("reader-1", 1, start + 2000)).toThrow("Reading limit reached");
    // Another user has a budget of their own.
    expect(() => chargeReading("reader-2", 1, start + 2000)).not.toThrow();
    // An hour after the first read, its pages no longer count.
    expect(() => chargeReading("reader-1", PAGES_PER_HOUR - 1, start + 60 * 60 * 1000)).not.toThrow();
  });

  it("refuses one read bigger than the whole budget", () => {
    expect(() => chargeReading("reader-3", PAGES_PER_HOUR + 1)).toThrow("Reading limit reached");
  });
});
