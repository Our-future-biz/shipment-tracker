import { describe, expect, it } from "vitest";
import { reportMonthOf } from "./salesReport";

describe("reportMonthOf", () => {
  it("is the Prague month the quote was sent in, not the UTC one", () => {
    // 23:30 UTC on 31 October is 00:30 on 1 November in Prague (CET).
    expect(reportMonthOf({ data: { sentAt: "2026-10-31T23:30:00.000Z" }, createdAt: "2026-10-02T08:00:00.000Z" })).toBe("2026-11");
    // And 22:30 UTC on 31 July is 00:30 on 1 August (CEST).
    expect(reportMonthOf({ data: { sentAt: "2026-07-31T22:30:00.000Z" }, createdAt: "2026-07-02T08:00:00.000Z" })).toBe("2026-08");
    expect(reportMonthOf({ data: { sentAt: "2026-10-31T22:30:00.000Z" }, createdAt: "2026-10-02T08:00:00.000Z" })).toBe("2026-10");
  });

  it("is the month it was created in when it was never sent", () => {
    expect(reportMonthOf({ data: {}, createdAt: "2026-12-31T23:15:00.000Z" })).toBe("2027-01");
  });

  it("is nothing for a quote without either", () => {
    expect(reportMonthOf({ data: {}, createdAt: "" })).toBe("");
  });
});
