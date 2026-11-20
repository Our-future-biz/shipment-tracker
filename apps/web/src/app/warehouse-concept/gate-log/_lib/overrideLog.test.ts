import { describe, expect, it } from "vitest";
import { overrideLogParts, overrideSummary } from "./overrideLog";

const OLD =
  "2026-11-20 09:27 · OVERRIDE by Lukas Slavik · gates at moment of override: B/L / release order: Pending; Customs: Pending; No open exceptions: Blocked · reason: customer collects, agreed";

describe("the override log, readable (W17)", () => {
  it("splits an older log and shows its ISO date as DD.MM.YYYY HH:mm", () => {
    expect(overrideLogParts(OLD)).toEqual({
      at: "20.11.2026 09:27",
      by: "Lukas Slavik",
      lines: [
        { g: "B/L / release order", s: "Pending" },
        { g: "Customs", s: "Pending" },
        { g: "No open exceptions", s: "Blocked" },
      ],
      reason: "customer collects, agreed",
    });
    expect(overrideSummary(OLD)).toBe("Supervisor override 20.11.2026 09:27 · Lukas Slavik");
  });

  it("reads the new date form, no lines and no name", () => {
    expect(overrideLogParts("20.11.2026 09:27 · OVERRIDE by — · gates at moment of override: none · reason: ok · really")).toEqual({
      at: "20.11.2026 09:27",
      by: "",
      lines: [],
      reason: "ok · really",
    });
  });

  it("leaves text in another form as it is", () => {
    expect(overrideLogParts("overridden by hand")).toBeNull();
    expect(overrideSummary("overridden by hand")).toBe("overridden by hand");
    expect(overrideSummary("")).toBe("");
  });
});
