import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => ({ APIError: { invalidArgument: (msg: string) => new Error(msg) } }));

import { dateInput, dateOutput, isoDateOrNull } from "../lib/dates";

describe("customer dates", () => {
  it("keeps real calendar dates only", () => {
    expect(isoDateOrNull("2024-02-29")).toBe("2024-02-29");
    expect(isoDateOrNull("2025-01-09T10:00:00Z")).toBe("2025-01-09");
    expect(isoDateOrNull("2023-02-29")).toBeNull();
    expect(isoDateOrNull("2024-13-01")).toBeNull();
    expect(isoDateOrNull("09.01.2025")).toBeNull();
  });

  it("reads a write: not sent, cleared, set, or refused", () => {
    expect(dateInput(undefined, "dueDate")).toBeUndefined();
    expect(dateInput("  ", "dueDate")).toBeNull();
    expect(dateInput("2026-11-30", "dueDate")).toBe("2026-11-30");
    expect(() => dateInput("30.11.2026", "dueDate")).toThrow("dueDate must be a date");
  });

  it("sends a missing date as an empty string", () => {
    expect(dateOutput(null)).toBe("");
    expect(dateOutput("2026-11-30")).toBe("2026-11-30");
  });
});
