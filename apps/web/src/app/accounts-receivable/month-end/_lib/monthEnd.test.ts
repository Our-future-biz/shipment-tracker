import { describe, expect, it } from "vitest";
import { CZK_TOTAL_LABEL, defaultMonthEndDay, FUTURE_DAY, monthEndCsv, monthEndDayOf, monthEndFileName, typedDayProblem, type MonthEndCsvRow } from "./monthEnd";

describe("the day", () => {
  it("opens on the last day of the previous month", () => {
    expect(defaultMonthEndDay("2026-11-18")).toBe("2026-10-31");
    expect(defaultMonthEndDay("2026-03-01")).toBe("2026-02-28");
    expect(defaultMonthEndDay("2028-03-15")).toBe("2028-02-29");
    expect(defaultMonthEndDay("2027-01-05")).toBe("2026-12-31");
  });
  it("takes a day asked for, never after today, a wrong one falling back", () => {
    expect(monthEndDayOf("2026-09-30", "2026-11-18")).toBe("2026-09-30");
    expect(monthEndDayOf("2026-12-31", "2026-11-18")).toBe("2026-11-18");
    expect(monthEndDayOf("2026-02-30", "2026-11-18")).toBe("2026-10-31");
    expect(monthEndDayOf("soon", "2026-11-18")).toBe("2026-10-31");
    expect(monthEndDayOf(null, "2026-11-18")).toBe("2026-10-31");
  });
  it("says a typed day after today can't be shown, and nothing of any other text (A9)", () => {
    expect(typedDayProblem("30.11.2026", "2026-11-20")).toBe(FUTURE_DAY);
    expect(typedDayProblem("1.1.2027", "2026-11-20")).toBe(FUTURE_DAY);
    expect(typedDayProblem("20.11.2026", "2026-11-20")).toBe("");
    expect(typedDayProblem("31.10.2026", "2026-11-20")).toBe("");
    expect(typedDayProblem("31.11.2026", "2026-11-20")).toBe("");
    expect(typedDayProblem("30.11", "2026-11-20")).toBe("");
  });
});

describe("monthEndCsv", () => {
  const r: MonthEndCsvRow = {
    number: "2026CZ00000028-001",
    customer: "ACME s.r.o.",
    jobNumber: "SCZ00000028",
    issueDate: "2026-10-02",
    dueDate: "2026-10-16",
    currency: "EUR",
    gross: 1210,
    credited: 10,
    paid: 200,
    writtenOff: 0,
    leftToPay: 1000,
    fxRate: 24.335,
    leftToPayCzk: 24335,
    daysOverdue: 15,
    carriedOver: true,
  };
  it("writes one line per invoice, then the totals per currency and the CZK total, all the same width", () => {
    const lines = monthEndCsv("2026-10-31", [r], [{ currency: "EUR", amount: 1000 }], 24335);
    expect(lines).toHaveLength(4);
    expect(new Set(lines.map((l) => l.length)).size).toBe(1);
    expect(lines[0]![11]).toBe("Left to pay on 31.10.2026");
    expect(lines[1]).toEqual([
      "2026CZ00000028-001",
      "ACME s.r.o.",
      "SCZ00000028",
      "02.10.2026",
      "16.10.2026",
      "15",
      "EUR",
      "1210.00",
      "10.00",
      "200.00",
      "0.00",
      "1000.00",
      "24.335",
      "24335.00",
      "Includes a payment made before Accounts Receivable, day not known",
    ]);
    expect(lines[2]![0]).toBe("Total EUR");
    expect(lines[2]![6]).toBe("EUR");
    expect(lines[2]![11]).toBe("1000.00");
    expect(lines[3]![0]).toBe(`Total in CZK, ${CZK_TOTAL_LABEL}`);
    expect(lines[3]![13]).toBe("24335.00");
  });
  it("names the file after the day", () => {
    expect(monthEndFileName("2026-10-31")).toBe("accounts-receivable-month-end-2026-10-31.csv");
  });
});
