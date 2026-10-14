import { describe, expect, it } from "vitest";
import { formatInvoiceNumber, invoiceSeriesPrefix, jobYear, nextSequence } from "../lib/invoiceNumber";

describe("formatInvoiceNumber", () => {
  it("builds INV + job year + job number + 3-digit sequence", () => {
    expect(formatInvoiceNumber("INV", 2026, "CZ00000028", 1)).toBe("INV2026CZ00000028-001");
    expect(formatInvoiceNumber("INV", 2026, "CZ00000028", 12)).toBe("INV2026CZ00000028-012");
    expect(formatInvoiceNumber("CN", 2026, "CZ00000028", 1)).toBe("CN2026CZ00000028-001");
  });

  it("keeps sequences above 999 readable", () => {
    expect(formatInvoiceNumber("INV", 2026, "CZ00000028", 1000)).toBe("INV2026CZ00000028-1000");
  });
});

describe("nextSequence", () => {
  const prefix = invoiceSeriesPrefix("INV", 2026, "CZ00000028");

  it("starts at 1", () => {
    expect(nextSequence([], prefix)).toBe(1);
  });

  it("continues after the highest number, not the count", () => {
    expect(nextSequence(["INV2026CZ00000028-001", "INV2026CZ00000028-003"], prefix)).toBe(4);
  });

  it("ignores old-format numbers, credit notes and other jobs or years", () => {
    expect(
      nextSequence(
        ["CZ00000028-001", "CN2026CZ00000028-005", "INV2025CZ00000028-009", "INV2026CZ00000029-007", "INV2026CZ00000028-002"],
        prefix,
      ),
    ).toBe(3);
  });
});

describe("jobYear", () => {
  it("reads the year the job was created", () => {
    expect(jobYear("2026-10-13T08:00:00.000Z")).toBe(2026);
    expect(jobYear(new Date("2025-12-31T12:00:00Z"))).toBe(2025);
  });

  it("counts in Prague time: just after midnight on 1 January is the new year", () => {
    // 00:30 on 1 Jan 2026 in Prague (CET, UTC+1) is still 31 Dec 2025 in UTC
    expect(jobYear("2025-12-31T23:30:00.000Z")).toBe(2026);
    expect(jobYear("2025-12-31T22:30:00.000Z")).toBe(2025);
  });

  it("rejects an invalid date", () => {
    expect(() => jobYear("not a date")).toThrow();
  });
});
