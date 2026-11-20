import { describe, expect, it } from "vitest";
import { newDefaultsSeenKey, tellsNewDefaults } from "./newDefaultColumns";

const DEFAULTS = ["reference", "customer", "status", "pol"];

describe("telling a user with columns of their own about new defaults (mock council S9-2)", () => {
  it("tells a user whose own set is not the defaults, once per version of them", () => {
    expect(tellsNewDefaults(["reference", "pol", "status"], DEFAULTS, null, "v2")).toBe(true);
    expect(tellsNewDefaults(["reference", "pol", "status"], DEFAULTS, "v1", "v2")).toBe(true);
    expect(tellsNewDefaults(["reference", "pol", "status"], DEFAULTS, "v2", "v2")).toBe(false);
  });

  it("tells nobody who has no set of their own (they get the defaults) or has the defaults already", () => {
    expect(tellsNewDefaults(null, DEFAULTS, null, "v2")).toBe(false);
    expect(tellsNewDefaults([], DEFAULTS, null, "v2")).toBe(false);
    expect(tellsNewDefaults([...DEFAULTS], DEFAULTS, null, "v2")).toBe(false);
  });

  it("counts the same columns in another order as a set of their own", () => {
    expect(tellsNewDefaults(["reference", "status", "customer", "pol"], DEFAULTS, null, "v2")).toBe(true);
  });

  it("keeps the mark per list and per user", () => {
    expect(newDefaultsSeenKey("quotes", "u1")).toBe("quotes:newDefaultsSeen:u1");
    expect(newDefaultsSeenKey("shipmentColumns", "u1")).not.toBe(newDefaultsSeenKey("quotes", "u1"));
  });
});
