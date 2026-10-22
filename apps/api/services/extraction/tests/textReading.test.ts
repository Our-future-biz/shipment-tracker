import { describe, expect, it } from "vitest";
import { textReadingUsable } from "../lib/fields";

describe("textReadingUsable", () => {
  it("keeps a text reading that found what it must", () => {
    expect(textReadingUsable({ total_amount: "4200.00", invoice_number: "DC4126080172" }, ["total_amount"])).toBe(true);
  });

  it("drops a scan's stamp read as text: a vendor and a ref number, but no total", () => {
    // PRIMA AIR SEA's stamp on a scanned debit note was the PDF's only text.
    expect(textReadingUsable({ vendor: "PRIMA AIR SEA, S.R.O.", invoice_number: "2026-PAS0567" }, ["total_amount"])).toBe(false);
    expect(textReadingUsable({ total_amount: " " }, ["total_amount"])).toBe(false);
  });

  it("with nothing required, keeps any reading that found something", () => {
    expect(textReadingUsable({ Shipper: "ACME" }, [])).toBe(true);
    expect(textReadingUsable({}, [])).toBe(false);
  });
});
