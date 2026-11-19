import { describe, expect, it, vi } from "vitest";

// The labelled keys come from libs that reach lib/personPick, which loads encore.dev/api.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { HISTORY_VALUE_MAX, absenceCoverSaves, historyEntry, historyLabel, historyLimit, historyValue } from "../lib/shipmentHistory";

// A job's history as a manager reads it: the app's own entries labelled, a field of the job by its key.

describe("a history entry's label", () => {
  it("is the app's own for what it writes under its own keys", () => {
    expect(historyLabel("claimStatus")).toBe("Claim status");
    expect(historyLabel("claimDeleted")).toBe("Claim deleted");
    expect(historyLabel("handOver")).toBe("Handed over by a manager");
    expect(historyLabel("deletedAt")).toBe("Shipment deleted");
    expect(historyLabel("absenceCover")).toBe("Holiday Cover while away");
    expect(historyLabel("task:pod")).toBe("Task tick taken back: pod");
    expect(historyLabel("trackingEvent:arrived")).toBe("Tracking event: arrived");
  });

  it("is none for a field of the job: the web labels it", () => {
    expect(historyLabel("estimatedArrival")).toBeNull();
    expect(historyLabel("claim")).toBeNull();
  });
});

describe("a history entry", () => {
  it("carries who by name and e-mail, and a long value cut", () => {
    const long = "x".repeat(HISTORY_VALUE_MAX + 5);
    const row = { id: "a1", userId: "u1", field: "remeasurementAccepted", oldValue: long, newValue: null, changedAt: new Date("2026-11-18T10:00:00Z") };
    expect(historyEntry(row, new Map([["u1", { name: "Eva", email: "eva@firma.cz" }]]))).toEqual({
      id: "a1",
      field: "remeasurementAccepted",
      label: "Remeasurement accepted",
      oldValue: `${"x".repeat(HISTORY_VALUE_MAX)}…`,
      newValue: null,
      cut: true,
      changedAt: "2026-11-18T10:00:00.000Z",
      userId: "u1",
      userName: "Eva",
      userEmail: "eva@firma.cz",
    });
    // Not found by the look-up that answered: a user since removed.
    expect(historyEntry({ ...row, oldValue: "a" }, new Map())).toMatchObject({ cut: false, userName: "former user", userEmail: "" });
    // The look-up failed: nobody is named.
    expect(historyEntry(row, null)).toMatchObject({ userName: "", userEmail: "" });
  });

  it("names the Holiday Cover's job for its own saves, not the service identity it writes as - Trucking's saves stay its own (m26)", () => {
    const system = new Map([["svc", { name: "Trucking (system)", email: "trucking-system+c1@system.invalid" }]]);
    const set = new Date("2026-11-16T06:00:00Z");
    const rows = [
      { id: "a1", userId: "svc", field: "holidayCover", oldValue: "", newValue: "eva@firma.cz", changedAt: set },
      { id: "a2", userId: "svc", field: "absenceCover", oldValue: null, newValue: "Holiday Cover eva@firma.cz while Jan Novák is away 16.11.–20.11.", changedAt: set },
      // Trucking's write as the same identity, at another moment.
      { id: "a3", userId: "svc", field: "deliveryDate", oldValue: null, newValue: "2026-11-20", changedAt: new Date("2026-11-16T06:00:01Z") },
    ];
    const saves = absenceCoverSaves(rows);
    expect(rows.map((r) => historyEntry(r, system, saves)).map((e) => [e.id, e.userName, e.userEmail])).toEqual([
      ["a1", "Holiday Cover (automatic)", ""],
      ["a2", "Holiday Cover (automatic)", ""],
      ["a3", "Trucking (system)", "trucking-system+c1@system.invalid"],
    ]);
    // Named so even when the people could not be looked up.
    expect(historyEntry(rows[0]!, null, saves).userName).toBe("Holiday Cover (automatic)");
  });

  it("keeps a value up to the limit whole", () => {
    expect(historyValue("y".repeat(HISTORY_VALUE_MAX))).toEqual({ value: "y".repeat(HISTORY_VALUE_MAX), cut: false });
  });
});

describe("a page's size", () => {
  it("is 50 unless asked, 1 to 100", () => {
    expect(historyLimit(undefined)).toBe(50);
    expect(historyLimit(0)).toBe(1);
    expect(historyLimit(500)).toBe(100);
    expect(historyLimit(20.7)).toBe(20);
    expect(historyLimit(Number.NaN)).toBe(50);
  });
});
