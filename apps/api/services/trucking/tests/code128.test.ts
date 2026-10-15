import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128BValues, code128BWidths } from "../lib/code128";

const sum = (digits: string) => [...digits].reduce((a, d) => a + Number(d), 0);

describe("Code 128 patterns", () => {
  it("has 107 distinct symbols of 11 modules (stop: 13) with an even number of bar modules", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
    CODE128_PATTERNS.forEach((p, value) => {
      const isStop = value === 106;
      expect(p).toMatch(isStop ? /^[1-4]{7}$/ : /^[1-4]{6}$/);
      expect(sum(p)).toBe(isStop ? 13 : 11);
      const bars = [...p].filter((_, i) => i % 2 === 0).join("");
      expect(sum(bars) % 2).toBe(0);
    });
    expect(CODE128_PATTERNS[104]).toBe("211214"); // start B
    expect(CODE128_PATTERNS[106]).toBe("2331112"); // stop
  });
});

describe("Code 128 B encoding", () => {
  it("encodes one character with start B, checksum and stop", () => {
    // "A" = 33; checksum (104 + 33 × 1) mod 103 = 34
    expect(code128BValues("A")).toEqual([104, 33, 34, 106]);
    expect(code128BWidths("A").join("")).toBe("211214" + "111323" + "131123" + "2331112");
  });

  it("weights the checksum by position", () => {
    // P J J 1 2 3 C = 48 42 42 17 18 19 35; 104 + 48 + 84 + 126 + 68 + 90 + 114 + 245 = 879; 879 mod 103 = 55
    expect(code128BValues("PJJ123C")).toEqual([104, 48, 42, 42, 17, 18, 19, 35, 55, 106]);
    // a consignment ref, checked with a real scanner
    expect(code128BValues("TCZ2026001234")).toEqual([104, 52, 35, 58, 18, 16, 18, 22, 16, 16, 17, 18, 19, 20, 88, 106]);
  });

  it("covers printable ASCII: space is 0, tilde is 94", () => {
    expect(code128BValues(" ~").slice(1, 3)).toEqual([0, 94]);
  });

  it("gives 11 modules per symbol plus the stop's closing bar, starting and ending with a bar", () => {
    const widths = code128BWidths("TCZ2026001234");
    expect(sum(widths.join(""))).toBe(11 * (13 + 3) + 2);
    expect(widths.length % 2).toBe(1); // odd count: bar, space, …, bar
  });

  it("refuses empty text and characters outside code set B", () => {
    expect(() => code128BValues("")).toThrow();
    expect(() => code128BValues("TCŽ1")).toThrow(/Ž/);
    expect(() => code128BValues("A\nB")).toThrow();
  });
});
