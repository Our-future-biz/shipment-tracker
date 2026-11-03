import { describe, expect, it } from "vitest";
import { median, overLimitCzk, statusSinceOf } from "../../utils/managersFacts.utils";

const SHEET = { today: "2026-11-03", rates: { EUR: 25, USD: 23, CNY: null }, roePct: 100 };
const credit = (over = {}) => ({ creditLimit: 100_000, currency: "CZK", unpaid: [], overdueCount: 0, oldestOverdueDue: null, ...over });

describe("overLimitCzk", () => {
  it("converts what the customer owes to CZK and compares it with the limit", () => {
    expect(overLimitCzk(credit({ unpaid: [{ currency: "EUR", amount: 3_000 }, { currency: "CZK", amount: 40_000 }] }), SHEET)).toBe(15_000);
    expect(overLimitCzk(credit({ unpaid: [{ currency: "EUR", amount: 2_000 }] }), SHEET)).toBeNull();
    expect(overLimitCzk(credit({ creditLimit: 5_000, currency: "EUR", unpaid: [{ currency: "USD", amount: 6_000 }] }), SHEET)).toBe(13_000);
  });

  it("says nothing with no limit, or a limit in a currency with no rate today", () => {
    expect(overLimitCzk(credit({ creditLimit: 0, unpaid: [{ currency: "CZK", amount: 1 }] }), SHEET)).toBeNull();
    expect(overLimitCzk(credit({ currency: "CNY", unpaid: [{ currency: "CZK", amount: 10_000_000 }] }), SHEET)).toBeNull();
  });
});

describe("statusSinceOf", () => {
  const created = new Date("2026-10-01T08:00:00.000Z");

  it("takes the last status line, an old line without a kind included", () => {
    const timeline = [
      { at: "2026-10-01T08:00:00.000Z", status: "draft" },
      { kind: "status", at: "2026-10-02T08:00:00.000Z", status: "ready_to_send" },
      { kind: "owner", at: "2026-10-03T08:00:00.000Z" },
    ];
    expect(statusSinceOf({ timeline }, created)).toBe("2026-10-02T08:00:00.000Z");
    expect(statusSinceOf({ timeline: [{ at: "2026-10-05T08:00:00.000Z", status: "quoted" }] }, created)).toBe("2026-10-05T08:00:00.000Z");
  });

  it("falls back to when the quote was created", () => {
    expect(statusSinceOf({}, created)).toBe(created.toISOString());
    expect(statusSinceOf({ timeline: "broken" }, created)).toBe(created.toISOString());
    // A moment that is no date (a browser wrote it) is no moment: the creation stands in, never the text.
    expect(statusSinceOf({ timeline: [{ at: "13.10.2026 14:05", status: "ready_to_send" }] }, created)).toBe(created.toISOString());
    expect(statusSinceOf({ timeline: [{ at: "2026-10-05T10:00:00+02:00", status: "quoted" }] }, created)).toBe("2026-10-05T08:00:00.000Z");
  });
});

describe("median", () => {
  it("takes the middle figure, or the mean of the middle two", () => {
    expect(median([])).toBeNull();
    expect(median([30, 10, 20])).toBe(20);
    expect(median([10, 20, 31, 40])).toBe(26);
  });
});
