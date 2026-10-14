import { describe, expect, it } from "vitest";
import { CODE128_PATTERNS, code128B, code128BValues, drawCode128 } from "./code128";

describe("code128B", () => {
  it("has 107 symbols of 11 modules, the stop 13", () => {
    expect(CODE128_PATTERNS).toHaveLength(107);
    CODE128_PATTERNS.forEach((p, i) => {
      const sum = [...p].map(Number).reduce((a, b) => a + b, 0);
      expect(sum).toBe(i === 106 ? 13 : 11);
    });
    expect(new Set(CODE128_PATTERNS).size).toBe(107);
  });

  it("computes the mod-103 check symbol", () => {
    // 104 + 48·1 + 42·2 + 42·3 + 17·4 + 18·5 + 19·6 + 35·7 = 879; 879 mod 103 = 55.
    const values = code128BValues("PJJ123C");
    expect(values[0]).toBe(104);
    expect(values.slice(1, -2)).toEqual([48, 42, 42, 17, 18, 19, 35]);
    expect(values.at(-2)).toBe(55);
    expect(values.at(-1)).toBe(106);
  });

  it("is 11·(n+3)+2 modules long, starting with Start B and ending with Stop", () => {
    const ref = "WCZ26101401";
    const widths = code128B(ref);
    expect(widths.reduce((a, b) => a + b, 0)).toBe(11 * (ref.length + 3) + 2);
    expect(widths.slice(0, 6).join("")).toBe("211214");
    expect(widths.slice(-7).join("")).toBe("2331112");
  });

  it("rejects characters outside printable ASCII", () => {
    expect(() => code128B("WCZ—1")).toThrow();
    expect(() => code128B("Příjem")).toThrow();
    expect(() => code128B("")).toThrow();
  });
});

describe("drawCode128", () => {
  it("draws one rectangle per bar, centred, in whole 0.125 mm dots", () => {
    const rects: number[][] = [];
    const doc = { rect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]) };
    const ref = "WCZ2610140001";
    const width = drawCode128(doc, 7, 97, 86, 16, ref);
    const modules = 11 * (ref.length + 3) + 2;
    expect(rects).toHaveLength((ref.length + 3) * 3 + 1);
    const moduleMm = width / modules;
    expect((moduleMm / 0.125) % 1).toBe(0);
    expect(moduleMm).toBeLessThanOrEqual(0.375);
    expect(rects[0]![0]).toBeCloseTo(7 + (86 - width) / 2);
  });

  it("refuses a text that does not fit", () => {
    expect(() => drawCode128({ rect: () => undefined }, 0, 0, 20, 10, "WCZ2610140001")).toThrow();
  });
});
