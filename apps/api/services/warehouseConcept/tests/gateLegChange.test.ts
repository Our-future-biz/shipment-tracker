import { describe, expect, it } from "vitest";
import { checkChangeProblem, legChangeProblem, mergeLegChange } from "../services/gateLegChange";
import { customsHolds } from "../services/overrideCustoms";
import { normalizeLegs } from "../services/gateMovement.service";

describe("one transport leg field merged into the stored legs (W2)", () => {
  const stored = normalizeLegs([{ leg: "OUT", company: "Haulier s.r.o.", plate: "", driver: "", phone: "", gateTime: "" }]);

  it("changes only the fields sent, on that leg only", () => {
    const merged = mergeLegChange(stored, { leg: "OUT", plate: " 1AB 2345 " })!;
    expect(merged.map((l) => l.leg)).toEqual(["IN", "OUT", "CFS"]);
    expect(merged.find((l) => l.leg === "OUT")).toMatchObject({ company: "Haulier s.r.o.", plate: "1AB 2345", driver: "" });
    expect(merged.find((l) => l.leg === "IN")).toEqual(stored.find((l) => l.leg === "IN"));
    expect(mergeLegChange(merged, { leg: "OUT", gateTime: "" })!.find((l) => l.leg === "OUT")!.gateTime).toBe("");
  });

  it("refuses a leg a Trucking trip filled", () => {
    const trip = normalizeLegs([{ leg: "IN", company: "Trip co", plate: "", driver: "", phone: "", gateTime: "", source: { kind: "trucking", tripRef: "LCZ1" } }]);
    expect(mergeLegChange(trip, { leg: "IN", plate: "2AB" })).toBeNull();
    expect(mergeLegChange(trip, { leg: "OUT", plate: "2AB" })).not.toBeNull();
  });

  it("checks what is sent", () => {
    expect(legChangeProblem({ leg: "OUT", driver: "Jan" })).toBeNull();
    expect(legChangeProblem({ leg: "OUT" })).toMatch(/Nothing to change/);
    expect(legChangeProblem({ leg: "X" as never, driver: "Jan" })).toMatch(/Leg must be/);
    expect(legChangeProblem({ leg: "IN", gateTime: "2026-11-20T08:00:00.000Z" })).toBeNull();
    expect(legChangeProblem({ leg: "IN", gateTime: "tomorrow" })).toMatch(/date and time/);
    expect(checkChangeProblem({ key: "ht", state: "g" })).toBeNull();
    expect(checkChangeProblem({ key: "ht", state: "x" as never })).toMatch(/state/);
  });
});

describe("a supervisor override never clears Customs (Q18 (b))", () => {
  it("holds while the Customs line is there and not OK", () => {
    expect(customsHolds([{ g: "Customs", s: "Pending" }, { g: "Charges", s: "OK" }])).toBe(true);
    expect(customsHolds([{ g: "Customs", s: "OK" }, { g: "B/L / release order", s: "Pending" }])).toBe(false);
    // Domestic positions have no Customs line.
    expect(customsHolds([{ g: "Charges", s: "OK" }])).toBe(false);
  });
});
