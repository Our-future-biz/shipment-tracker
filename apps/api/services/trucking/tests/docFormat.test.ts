import { describe, expect, it } from "vitest";
import { NBSP, formatDate, formatMoney, formatNumber, formatQuantity, label, partyLines, stopAddressLines, titleLines, wrapText } from "../lib/docFormat";
import type { DocParty, DocStop } from "../lib/documentTypes";

describe("labels", () => {
  it("prints Czech, English or both", () => {
    expect(label("cs", "loadingPlace")).toBe("Místo nakládky");
    expect(label("en", "loadingPlace")).toBe("Loading place");
    expect(label("both", "loadingPlace")).toBe("Místo nakládky / Loading place");
  });

  it("does not repeat a label that is the same in both languages", () => {
    expect(label("both", "ldm")).toBe("LDM");
  });

  it("gives a bilingual title as a Czech main line and an English sub line", () => {
    expect(titleLines("both", "transportOrder")).toEqual({ main: "Přepravní příkaz", sub: "Transport order" });
    expect(titleLines("en", "transportOrder")).toEqual({ main: "Transport order", sub: "" });
  });
});

describe("numbers", () => {
  // The figures as a reader sees them: the no-break space shown as a space.
  const seen = (s: string) => s.replace(new RegExp(NBSP, "g"), " ");

  it("formats Czech style with a no-break space and a decimal comma", () => {
    expect(formatQuantity(1250.5, "kg", "cs")).toBe(`1${NBSP}250,5 kg`);
    expect(seen(formatNumber(1234567.891, "cs"))).toBe("1 234 567,89");
  });

  it("formats English style with a comma and a decimal point", () => {
    expect(formatQuantity(1250.5, "kg", "en")).toBe("1,250.5 kg");
    expect(formatNumber(1234567.891, "en")).toBe("1,234,567.89");
  });

  it("formats a bilingual document with a no-break space and a decimal point", () => {
    expect(formatQuantity(1250.5, "kg", "both")).toBe(`1${NBSP}250.5 kg`);
    expect(seen(formatNumber(1234567.891, "both"))).toBe("1 234 567.89");
  });

  it("drops trailing zeros and respects the decimals asked for", () => {
    expect(formatNumber(13.6, "cs")).toBe("13,6");
    expect(formatNumber(13.6, "both")).toBe("13.6");
    expect(formatNumber(33, "cs")).toBe("33");
    expect(formatNumber(2.4567, "cs", 3)).toBe("2,457");
    expect(seen(formatNumber(-1500, "cs"))).toBe("-1 500");
    expect(formatNumber(-1500, "en")).toBe("-1,500");
    expect(seen(formatNumber(-1500, "both"))).toBe("-1 500");
    expect(formatNumber(-0.001, "cs")).toBe("0");
    expect(formatNumber(Number.NaN, "cs")).toBe("0");
  });

  it("prints money with two decimals", () => {
    expect(seen(formatMoney(12500, "CZK", "cs"))).toBe("12 500,00 CZK");
    expect(formatMoney(12500, "CZK", "en")).toBe("12,500.00 CZK");
    expect(seen(formatMoney(12500, "CZK", "both"))).toBe("12 500.00 CZK");
    expect(formatMoney(980.5, "EUR", "en")).toBe("980.50 EUR");
    expect(formatMoney(980.5, "EUR", "cs")).toBe("980,50 EUR");
    expect(seen(formatMoney(-1234.5, "CZK", "cs"))).toBe("-1 234,50 CZK");
    expect(formatMoney(0, "CZK", "cs")).toBe("0,00 CZK");
  });
});

describe("dates", () => {
  it("prints a day Czech or English style", () => {
    expect(formatDate("2026-10-16", "cs")).toBe("16. 10. 2026");
    expect(formatDate("2026-10-16", "both")).toBe("16. 10. 2026");
    expect(formatDate("2026-10-16", "en")).toBe("16 Oct 2026");
  });

  it("takes the Prague calendar day of a timestamp", () => {
    // 23:30 UTC on 15 Oct is already 16 Oct in Prague (CEST, UTC+2)
    expect(formatDate("2026-10-15T23:30:00.000Z", "cs")).toBe("16. 10. 2026");
  });

  it("leaves an unreadable value as it is", () => {
    expect(formatDate("soon", "en")).toBe("soon");
  });
});

describe("wrapText", () => {
  const width = (s: string) => s.length; // one unit per character

  it("breaks between words and keeps the text's own line breaks", () => {
    expect(wrapText("one two three four", 9, width)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a\nb c", 9, width)).toEqual(["a", "b c"]);
  });

  it("never breaks a figure at its no-break space", () => {
    expect(wrapText(`Weight 1${NBSP}250,5 kg`, 9, width)).toEqual(["Weight", `1${NBSP}250,5`, "kg"]);
  });

  it("cuts a word longer than the line", () => {
    expect(wrapText("https://example.cz/abc", 10, width)).toEqual(["https://ex", "ample.cz/a", "bc"]);
  });

  it("returns one empty line for empty text", () => {
    expect(wrapText("", 10, width)).toEqual([""]);
  });
});

describe("address lines", () => {
  const party: DocParty = {
    name: "Dopravní s.r.o.",
    street: "Řeznická 12",
    postcode: "110 00",
    city: "Praha 1",
    country: "CZ",
    ico: "12345679",
    dic: "CZ12345679",
    contact: "Jan Novák, +420 777 123 456",
  };

  it("prints a Czech party without the country and with IČO / DIČ on one line", () => {
    expect(partyLines(party, "cs")).toEqual(["Dopravní s.r.o.", "Řeznická 12", "110 00 Praha 1", "IČO: 12345679   DIČ: CZ12345679", "Jan Novák, +420 777 123 456"]);
  });

  it("adds a foreign country and leaves out empty parts", () => {
    const stop: DocStop = { ...party, country: "SK", windowText: "", reference: "", notes: "", avizaceRequired: false, street: "" };
    expect(stopAddressLines(stop)).toEqual(["Dopravní s.r.o.", "110 00 Praha 1, SK"]);
  });
});
