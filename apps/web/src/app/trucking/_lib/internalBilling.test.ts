import { describe, expect, it } from "vitest";
import { closeMonthState, consignmentInternalAmount, isNotPriced, monthLabel, monthOf, monthTotal } from "./internalBilling";

describe("months", () => {
  it("read as words", () => {
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(monthLabel("2027-01")).toBe("January 2027");
    expect(monthLabel("2026-13")).toBe("2026-13");
  });

  it("follow the Prague calendar", () => {
    // 31 Oct 23:30 UTC is already 1 November in Prague (CET, +1).
    expect(monthOf("2026-10-31T23:30:00Z")).toBe("2026-11");
    expect(monthOf(null)).toBe("");
  });

  it("sum their departments", () => {
    expect(monthTotal({ totals: [{ department: "Ocean", count: 2, amount: 3000 }, { department: "Air", count: 1, amount: 1200 }] })).toBe(4200);
  });
});

describe("closing a month", () => {
  const open = { status: "OPEN" as const, month: "2026-09" };

  it("is for a manager, after the month, with every charge priced", () => {
    expect(closeMonthState(open, [{ description: "D1 450 kg" }], true, "2026-10")).toEqual({ allowed: true, reason: "" });
    expect(closeMonthState(open, [], false, "2026-10").reason).toBe("Only a manager closes a month");
    expect(closeMonthState({ ...open, month: "2026-10" }, [], true, "2026-10").reason).toBe("The month is not over yet");
    expect(closeMonthState({ ...open, status: "CLOSED" }, [], true, "2026-10").reason).toBe("Already closed");
    expect(closeMonthState(open, [{ description: "Not priced: no Internal tariff for zone 7" }, { description: "not priced" }], true, "2026-10").reason).toMatch(/^2 charges are not priced/);
  });

  it("flags charges the tariff could not price", () => {
    expect(isNotPriced({ description: "Not priced — no valid Internal tariff" })).toBe(true);
    expect(isNotPriced({ description: "D2 1 200 kg" })).toBe(false);
  });
});

describe("internal price of a consignment", () => {
  it("sums its charges and adjustments of the month", () => {
    const charges = [
      { consignmentId: "c1", amount: 2400, description: "D1" },
      { consignmentId: "c1", amount: -400, description: "Adjustment" },
      { consignmentId: "c2", amount: 900, description: "D1" },
    ];
    expect(consignmentInternalAmount(charges, "c1")).toEqual({ amount: 2000, notPriced: false });
    expect(consignmentInternalAmount(charges, "c3")).toBeNull();
  });
});
