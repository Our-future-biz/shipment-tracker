import { describe, expect, it } from "vitest";
import { dailySource } from "./fxShared";

describe("dailySource (the Daily tab's Source, B22)", () => {
  it("reads one way for every fixing day, the number only in the hover text", () => {
    expect(dailySource({ kind: "fixing", fixingNo: 222, rates: [] })).toEqual({ text: "ČNB fixing", title: "ČNB fixing no. 222" });
    expect(dailySource({ kind: "fixing", fixingNo: null, rates: [] })).toEqual({ text: "ČNB fixing", title: undefined });
  });

  it("names the fixing a weekend or holiday carries", () => {
    expect(dailySource({ kind: "weekend", rates: [{ fixingDate: "2026-11-13" }] })).toEqual({ text: "Carried from 13.11.2026" });
    expect(dailySource({ kind: "weekend", rates: [] })).toEqual({ text: "" });
  });
});
