import { describe, expect, it } from "vitest";
import { directionOfHandling, directionOfVisit, handlingOfDirection, releaseGatesText } from "./glossary";

describe("direction mapping", () => {
  it("maps visits", () => {
    expect(directionOfVisit("příjem")).toBe("Inbound");
    expect(directionOfVisit("výdej")).toBe("Outbound");
    expect(directionOfVisit("")).toBe("");
  });
  it("maps handling both ways and leaves other values alone", () => {
    expect(directionOfHandling("Import")).toBe("Outbound");
    expect(directionOfHandling("Export")).toBe("Inbound");
    expect(directionOfHandling("Transit")).toBe("Transit");
    expect(handlingOfDirection("Outbound")).toBe("Import");
    expect(handlingOfDirection("Inbound")).toBe("Export");
    expect(handlingOfDirection("Transit")).toBe("Transit");
  });
});

describe("releaseGatesText", () => {
  it("reads clear / blocked / released for outbound, n/a for inbound", () => {
    expect(releaseGatesText({ visit: "příjem", armed: true, impRelease: null })).toBe("n/a — inbound");
    expect(releaseGatesText({ visit: "výdej", armed: true, impRelease: null })).toBe("Clear");
    expect(releaseGatesText({ visit: "výdej", armed: false, impRelease: null })).toBe("Blocked");
    expect(releaseGatesText({ visit: "výdej", armed: false, impRelease: "2026-10-14T08:00:00Z" })).toBe("Released");
  });
});
