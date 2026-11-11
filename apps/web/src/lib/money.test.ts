import { describe, expect, it } from "vitest";
import { amountEdited, amountInBox, amountTypingAllowed, decimalInputText, money, normaliseAmount, num, parseMoney, round2, sumRounded } from "./money";

describe("num", () => {
  it.each([
    ["1250", 1250],
    ["1250.50", 1250.5],
    ["1250,50", 1250.5],
    ["1 250,50", 1250.5],
    ["1 250,50", 1250.5],
    ["1,250.50", 1250.5],
    ["1.250,50", 1250.5],
    ["-500", -500],
    ["-1,5", -1.5],
    ["EUR 99,90", 99.9],
  ])("reads %j as %d", (input, expected) => {
    expect(num(input)).toBe(expected);
  });

  it("gives 0 for empty or non-numeric input", () => {
    expect(num("")).toBe(0);
    expect(num(null)).toBe(0);
    expect(num(undefined)).toBe(0);
    expect(num("abc")).toBe(0);
    expect(num(NaN)).toBe(0);
    expect(num(Infinity)).toBe(0);
  });

  it("passes finite numbers through", () => {
    expect(num(12.34)).toBe(12.34);
  });
});

describe("parseMoney", () => {
  it.each([
    ["", 0],
    ["  ", 0],
    ["1250", 1250],
    ["1 250,50", 1250.5],
    ["1.250,50", 1250.5],
    ["1,250.50", 1250.5],
    ["-500,5", -500.5],
  ])("accepts %j as %d", (input, expected) => {
    expect(parseMoney(input)).toBe(expected);
  });

  it.each(["abc", "12a", "1.2.3", "1,0055", "--5", "1e5"])("rejects %j", (input) => {
    expect(parseMoney(input)).toBeNull();
  });
});

describe("normaliseAmount", () => {
  it("converts typed amounts to the API form", () => {
    expect(normaliseAmount("4 999,50")).toBe("4999.5");
    expect(normaliseAmount("1.250,00")).toBe("1250");
    expect(normaliseAmount("-150")).toBe("-150");
    // A comma in threes separates thousands, as the amounts are shown; any other single comma is the decimal one.
    expect(normaliseAmount("1,250")).toBe("1250");
    expect(normaliseAmount("0,50")).toBe("0.5");
  });

  it("keeps empty text empty and rejects invalid text", () => {
    expect(normaliseAmount("")).toBe("");
    expect(normaliseAmount("  ")).toBe("");
    expect(normaliseAmount("12a")).toBeNull();
  });
});

describe("round2", () => {
  it("rounds half away from zero despite binary noise", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.004)).toBe(1);
  });

  it("gives 0 for non-finite values", () => {
    expect(round2(NaN)).toBe(0);
    expect(round2(Infinity)).toBe(0);
  });
});

describe("sumRounded", () => {
  it("equals the sum of the rounded lines", () => {
    // unrounded these sum to 3.015 -> 3.02, but the printed lines are 1.01 + 1.01 + 1.01 = 3.03
    expect(sumRounded([1.005, 1.005, 1.005])).toBe(3.03);
  });

  it("handles negative lines (discounts)", () => {
    expect(sumRounded([1000, -250.5])).toBe(749.5);
  });
});

describe("formatting", () => {
  it("money is English style", () => {
    expect(money(1234.5)).toBe("1,234.50");
    expect(money(NaN)).toBe("0.00");
  });

  it("reads commas in threes as thousands, any other single comma as the decimal one", () => {
    expect(parseMoney("1,234")).toBe(1234);
    expect(parseMoney("12,222,222")).toBe(12222222);
    expect(parseMoney("12,222,222.00")).toBe(12222222);
    expect(parseMoney("25,20")).toBe(25.2);
    expect(parseMoney("1,250")).toBe(1250);
    expect(parseMoney("12,345,678")).toBe(12345678);
  });

  it("never reads a comma after a leading 0 as thousands", () => {
    // a decimal comma with three decimals: refused, not saved a thousand times too big
    expect(parseMoney("0,500")).toBeNull();
    expect(parseMoney("-0,250")).toBeNull();
    expect(parseMoney("0,125")).toBeNull();
    expect(parseMoney("0,50")).toBe(0.5);
    expect(normaliseAmount("0,500")).toBeNull();
  });

  it("writes an amount in a box as figures are written, and leaves what is no amount", () => {
    expect(amountInBox("12222222")).toBe("12,222,222.00");
    expect(amountInBox("25,20")).toBe("25.20");
    expect(amountInBox("12 222 222")).toBe("12,222,222.00");
    expect(amountInBox("")).toBe("");
    expect(amountInBox("abc")).toBe("abc");
  });

  it("tells another amount from the same one written differently", () => {
    expect(amountEdited("1,111,111.00", "1111111.00")).toBe(false);
    expect(amountEdited("25,20", "25.20")).toBe(false);
    expect(amountEdited("26", "25.20")).toBe(true);
    expect(amountEdited("", "25.20")).toBe(true);
    expect(amountEdited("", "")).toBe(false);
  });
});

describe("amountTypingAllowed", () => {
  it("lets digits and the separators parseMoney reads be typed", () => {
    for (const key of ["0", "7", ",", ".", " "]) expect(amountTypingAllowed(key, "12", 2, 2)).toBe(true);
    // a decimal comma, Czech style
    expect(amountTypingAllowed(",", "4 999", 5, 5)).toBe(true);
    // a whole typed run (a mobile keyboard, autocompletion)
    expect(amountTypingAllowed("4 999,50", "", 0, 0)).toBe(true);
  });

  it("refuses letters and other signs", () => {
    for (const key of ["a", "e", "x", "€", "+", "*"]) expect(amountTypingAllowed(key, "12", 2, 2)).toBe(false);
    expect(amountTypingAllowed("2 x 40HC", "", 0, 0)).toBe(false);
  });

  it("lets one minus be typed, in front only (a discount)", () => {
    expect(amountTypingAllowed("-", "", 0, 0)).toBe(true);
    expect(amountTypingAllowed("-", "50", 0, 0)).toBe(true);
    expect(amountTypingAllowed("-50", "", 0, 0)).toBe(true);
    // over a selection that holds the old minus
    expect(amountTypingAllowed("-", "-50", 0, 1)).toBe(true);
    expect(amountTypingAllowed("-", "50", 1, 1)).toBe(false);
    expect(amountTypingAllowed("-", "-50", 0, 0)).toBe(false);
    expect(amountTypingAllowed("--", "", 0, 0)).toBe(false);
    expect(amountTypingAllowed("5-", "", 0, 0)).toBe(false);
  });

  it("leaves pasted text to the validation: text with letters is refused, not stripped to another number", () => {
    // pasted text goes in as it is; when the field is saved, parseMoney refuses it
    expect(parseMoney("2 x 40HC")).toBeNull();
    expect(parseMoney("1e5")).toBeNull();
    expect(normaliseAmount("2 x 40HC")).toBeNull();
    expect(normaliseAmount("CZK 200")).toBeNull();
  });
});

describe("decimalInputText", () => {
  it("reads the Czech decimal comma and the English figures alike", () => {
    expect(decimalInputText("1 234,56")).toBe("1234.56");
    expect(decimalInputText("2 592,45")).toBe("2592.45");
    expect(decimalInputText("1,234.56")).toBe("1234.56");
    expect(decimalInputText("1.234,56")).toBe("1234.56");
    expect(decimalInputText("12,5")).toBe("12.5");
    expect(decimalInputText("-3,25")).toBe("-3.25");
    expect(decimalInputText("37,50", 0)).toBe("37.50");
  });

  it("keeps the decimals of a value in its range, which the default parser turned into a clamped maximum", () => {
    expect(decimalInputText("101,5", 80, 120)).toBe("101.5");
    expect(decimalInputText("12,5", 0, 100)).toBe("12.5");
    expect(decimalInputText("50,0875", -90, 90)).toBe("50.0875");
  });

  it("reads a lone comma before three digits as thousands, unless only the decimal figure fits the range", () => {
    expect(decimalInputText("1,250")).toBe("1250");
    expect(decimalInputText("1,250", 0, 10_000)).toBe("1250");
    expect(decimalInputText("50,087", -90, 90)).toBe("50.087");
    expect(decimalInputText("-14,421", -180, 180)).toBe("-14.421");
    expect(decimalInputText("101,125", 80, 120)).toBe("101.125");
    // Neither fits: the field clamps the figure as it always did.
    expect(decimalInputText("999,500", 0, 100)).toBe("999500");
  });

  it("lets a half-typed number and an emptied field be", () => {
    expect(decimalInputText("")).toBe("");
    expect(decimalInputText(undefined)).toBe("");
    expect(decimalInputText("12,")).toBe("12.");
    expect(decimalInputText("-")).toBe("-");
  });
});
