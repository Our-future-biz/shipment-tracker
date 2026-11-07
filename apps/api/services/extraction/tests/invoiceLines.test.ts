import { describe, expect, it } from "vitest";
import { invoiceLinesOf, plainAmount, withInvoiceLines } from "../lib/invoiceLines";

describe("an invoice row's amount", () => {
  it.each([
    ["1177.20", "1177.20"],
    ["1,177.20", "1177.20"],
    ["1 177,20", "1177.20"],
    ["1.177,20", "1177.20"],
    ["399.6", "399.60"],
    ["3650", "3650.00"],
    ["1,250", "1250.00"],
    ["-30.00", "-30.00"],
    [464.62, "464.62"],
  ])("reads %s", (raw, plain) => expect(plainAmount(raw)).toBe(plain));

  it.each(["", "abc", "0", "0.00", null, undefined])("refuses %s", (raw) => expect(plainAmount(raw)).toBeNull());
});

describe("an invoice's rows", () => {
  it("keeps the B/L, charge and amount of a row, the B/L in capitals", () => {
    expect(invoiceLinesOf([{ bl: " glsl26060771 ", item: "POD COST", amount: "399.60", currency: "usd", service_type: "other" }])).toEqual([
      { bl: "GLSL26060771", item: "POD COST", amount: "399.60", currency: "USD", serviceType: "other" },
    ]);
  });

  it("gives a row with no B/L an empty one", () => {
    expect(invoiceLinesOf([{ item: "CUSTOM CLEARANCE", amount: "45" }])[0]).toMatchObject({ bl: "", amount: "45.00" });
  });

  it("leaves out what isn't a row with an amount", () => {
    expect(invoiceLinesOf([{ item: "TOTAL" }, "x", null, { amount: "abc" }])).toEqual([]);
    expect(invoiceLinesOf("not a list")).toEqual([]);
  });
});

describe("a reading with its rows", () => {
  const result = (extracted: Record<string, string>) => ({ extracted, fieldCount: 9, method: "text" as const, fileName: "a.pdf" });

  it("takes the rows out of the fields, which are then counted again", () => {
    const out = withInvoiceLines(result({ total_amount: "10", lines: JSON.stringify([{ bl: "A1", amount: "10" }]) }));
    expect(out.extracted).toEqual({ total_amount: "10" });
    expect(out.fieldCount).toBe(1);
    expect(out.invoiceLines).toHaveLength(1);
  });

  it("has none when the invoice lists none, or they can't be read", () => {
    expect(withInvoiceLines(result({ total_amount: "10" })).invoiceLines).toEqual([]);
    expect(withInvoiceLines(result({ lines: "{broken" })).invoiceLines).toEqual([]);
  });
});
