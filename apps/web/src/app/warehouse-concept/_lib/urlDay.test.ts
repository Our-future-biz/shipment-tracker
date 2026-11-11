import { describe, expect, it } from "vitest";
import { dayParamOf } from "./urlDay";

describe("dayParamOf", () => {
  it("keeps a day from the address", () => {
    expect(dayParamOf("2026-11-13", "2026-11-11")).toBe("2026-11-13");
  });

  it("reads a missing, mistyped or impossible day as today", () => {
    expect(dayParamOf(null, "2026-11-11")).toBe("2026-11-11");
    expect(dayParamOf("", "2026-11-11")).toBe("2026-11-11");
    expect(dayParamOf("13.11.2026", "2026-11-11")).toBe("2026-11-11");
    expect(dayParamOf("2026-02-30", "2026-11-11")).toBe("2026-11-11");
  });
});
