import { describe, expect, it } from "vitest";
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH, clampColumnWidth, parseColumnWidths } from "./useColumnWidths";

describe("clampColumnWidth", () => {
  it("keeps a width between the narrowest and the widest, in whole pixels", () => {
    expect(clampColumnWidth(10)).toBe(MIN_COLUMN_WIDTH);
    expect(clampColumnWidth(5000)).toBe(MAX_COLUMN_WIDTH);
    expect(clampColumnWidth(212.6)).toBe(213);
  });
});

describe("parseColumnWidths", () => {
  it("reads the stored widths", () => {
    expect(parseColumnWidths('{"customer":260,"pol":90}')).toEqual({ customer: 260, pol: 90 });
  });

  it("drops what is not a width and clamps the rest", () => {
    expect(parseColumnWidths('{"customer":"wide","pol":null,"pod":2,"eta":9999}')).toEqual({ pod: MIN_COLUMN_WIDTH, eta: MAX_COLUMN_WIDTH });
  });

  it("gives no widths for nothing stored or something broken", () => {
    expect(parseColumnWidths(null)).toEqual({});
    expect(parseColumnWidths("not json")).toEqual({});
    expect(parseColumnWidths("[120, 80]")).toEqual({});
  });
});
