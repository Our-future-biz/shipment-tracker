import { describe, expect, it } from "vitest";
import {
  SALES_REFERENCE_PATTERN,
  baseReference,
  formatReference,
  isSalesReference,
  nextSequence,
  nextVariant,
  salesPrefix,
} from "../salesReference";

describe("isSalesReference", () => {
  it("accepts a quote reference and its variants", () => {
    expect(isSalesReference("QCZ20261010001")).toBe(true);
    expect(isSalesReference("QCZ20261010001-2")).toBe(true);
    expect(isSalesReference("QCZ20261010001-12")).toBe(true);
    // The sequence grows past 999.
    expect(isSalesReference("QCZ202610101000")).toBe(true);
  });

  it("refuses anything else", () => {
    // The old quotes module numbered its quotes CZQ…
    expect(isSalesReference("CZQ20261010001")).toBe(false);
    expect(isSalesReference("QCZ2026101001")).toBe(false);
    expect(isSalesReference("QCZ20261010001-")).toBe(false);
    expect(isSalesReference("QCZ20261010001-2-3")).toBe(false);
    expect(isSalesReference(" QCZ20261010001")).toBe(false);
    expect(isSalesReference("QCZ20261010001 ")).toBe(false);
    expect(isSalesReference("qcz20261010001")).toBe(false);
    expect(isSalesReference("")).toBe(false);
  });

  it("uses only syntax Postgres reads the same way", () => {
    // The pattern is also an SQL parameter (text ~ $pattern): no \d, no flags, anchored.
    expect(SALES_REFERENCE_PATTERN).not.toContain("\\");
    expect(SALES_REFERENCE_PATTERN.startsWith("^")).toBe(true);
    expect(SALES_REFERENCE_PATTERN.endsWith("$")).toBe(true);
  });
});

describe("salesPrefix", () => {
  it("is QCZ and the business day", () => {
    expect(salesPrefix("2026-10-10")).toBe("QCZ20261010");
    expect(salesPrefix("2027-01-05")).toBe("QCZ20270105");
  });
});

describe("nextSequence", () => {
  const prefix = "QCZ20261010";

  it("starts at 1", () => {
    expect(nextSequence(prefix, [])).toBe(1n);
  });

  it("is the highest number of the day + 1, gaps or not", () => {
    expect(nextSequence(prefix, ["QCZ20261010001", "QCZ20261010002", "QCZ20261010004"])).toBe(5n);
    expect(nextSequence(prefix, ["QCZ20261010009", "QCZ20261010010"])).toBe(11n);
    expect(nextSequence(prefix, ["QCZ20261010999"])).toBe(1000n);
    expect(nextSequence(prefix, ["QCZ202610101000", "QCZ20261010999"])).toBe(1001n);
  });

  it("ignores variants", () => {
    expect(nextSequence(prefix, ["QCZ20261010001", "QCZ20261010001-2", "QCZ20261010001-17"])).toBe(2n);
    // Also a variant whose base is not among the references.
    expect(nextSequence(prefix, ["QCZ20261010001", "QCZ20261010007-2"])).toBe(2n);
  });

  it("ignores references it cannot read and those of other days", () => {
    expect(nextSequence(prefix, ["QCZ20261010001", "QCZ20261010abc", "QCZ20261010009x", "QCZ20261010", "QCZ20261009007", "CZQ20261010009"])).toBe(2n);
  });

  it("counts exactly past what a JavaScript number can hold", () => {
    expect(nextSequence(prefix, [`${prefix}9007199254740992`])).toBe(9007199254740993n);
    expect(nextSequence(prefix, [`${prefix}${"9".repeat(20)}`])).toBe(10n ** 20n);
  });

  it("never picks a reference that exists, however long a number somebody stored", () => {
    // The old quotes module stored any number it was sent, so such a row can sit under the prefix.
    for (const planted of ["9".repeat(9), "9".repeat(16), "9".repeat(20), "9007199254740992"]) {
      const existing = [`${prefix}${planted}`];
      const first = formatReference(prefix, nextSequence(prefix, existing));
      const second = formatReference(prefix, nextSequence(prefix, [...existing, first]));
      expect(isSalesReference(first), planted).toBe(true);
      expect(isSalesReference(second), planted).toBe(true);
      expect(existing, planted).not.toContain(first);
      expect([...existing, first], planted).not.toContain(second);
    }
  });
});

describe("formatReference", () => {
  it("writes three digits and grows past 999", () => {
    expect(formatReference("QCZ20261010", 1n)).toBe("QCZ20261010001");
    expect(formatReference("QCZ20261010", 42n)).toBe("QCZ20261010042");
    expect(formatReference("QCZ20261010", 999n)).toBe("QCZ20261010999");
    expect(formatReference("QCZ20261010", 1000n)).toBe("QCZ202610101000");
  });

  it("writes every digit of a number too large for a JavaScript number", () => {
    expect(formatReference("QCZ20261010", 10n ** 22n)).toBe(`QCZ202610101${"0".repeat(22)}`);
  });

  it("gives references the pattern accepts", () => {
    expect(isSalesReference(formatReference(salesPrefix("2026-10-10"), nextSequence("QCZ20261010", [])))).toBe(true);
    expect(isSalesReference(formatReference("QCZ20261010", 1000n))).toBe(true);
  });
});

describe("baseReference", () => {
  it("drops the variant suffix", () => {
    expect(baseReference("QCZ20261010001-2")).toBe("QCZ20261010001");
    expect(baseReference("QCZ20261010001-13")).toBe("QCZ20261010001");
  });

  it("leaves a base reference alone", () => {
    expect(baseReference("QCZ20261010001")).toBe("QCZ20261010001");
  });
});

describe("nextVariant", () => {
  const base = "QCZ20261010001";

  it("makes the first duplicate -2: the base is variant 1", () => {
    expect(nextVariant(base, [])).toBe("QCZ20261010001-2");
    expect(nextVariant(base, [base])).toBe("QCZ20261010001-2");
  });

  it("is the highest variant + 1, gaps or not", () => {
    expect(nextVariant(base, [`${base}-2`])).toBe("QCZ20261010001-3");
    expect(nextVariant(base, [`${base}-2`, `${base}-5`])).toBe("QCZ20261010001-6");
    expect(nextVariant(base, [`${base}-9`, `${base}-10`])).toBe("QCZ20261010001-11");
  });

  it("ignores other quotes and suffixes it cannot read", () => {
    // QCZ…0011 and QCZ…0010-4 start with the same characters but are other quotes.
    expect(nextVariant(base, ["QCZ202610100011", "QCZ202610100010-4", "QCZ20261010002-7", `${base}-x`, `${base}-2-3`])).toBe("QCZ20261010001-2");
  });

  it("never picks a variant that exists, however long a number somebody stored", () => {
    for (const planted of ["9".repeat(9), "9".repeat(16), "9".repeat(20), "9007199254740992"]) {
      const existing = [base, `${base}-${planted}`];
      const first = nextVariant(base, existing);
      const second = nextVariant(base, [...existing, first]);
      expect(isSalesReference(first), planted).toBe(true);
      expect(isSalesReference(second), planted).toBe(true);
      expect(existing, planted).not.toContain(first);
      expect([...existing, first], planted).not.toContain(second);
    }
    expect(nextVariant(base, [`${base}-${"9".repeat(20)}`])).toBe(`${base}-1${"0".repeat(20)}`);
  });

  it("gives references the pattern accepts", () => {
    expect(isSalesReference(nextVariant(base, [`${base}-2`]))).toBe(true);
  });
});
