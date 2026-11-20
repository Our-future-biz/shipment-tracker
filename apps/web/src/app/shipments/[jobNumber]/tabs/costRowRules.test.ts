import { describe, expect, it } from "vitest";
import { billedRealCostOpen, closesRow } from "./costRowRules";

// A stand-in for an element: its tag, its type and the selectors it sits inside.
const field = (tagName: string, inside: string[] = [], type = "text") => ({
  tagName,
  type,
  closest: (selector: string) => (selector.split(",").some((s) => inside.includes(s.trim())) ? {} : null),
});
const rowHolding = (...held: unknown[]) => ({ contains: (node: unknown) => held.includes(node) });

describe("an Enter in an open cost row (User Council B3, O7)", () => {
  it("closes the row from a plain text or amount box of the row", () => {
    const box = field("INPUT");
    expect(closesRow(box as unknown as EventTarget, rowHolding(box))).toBe(true);
  });

  it("leaves it open from the category or currency Select, or the vendor field", () => {
    const select = field("INPUT", [".ant-select"], "search");
    expect(closesRow(select as unknown as EventTarget, rowHolding(select))).toBe(false);
    // The vendor field is an AutoComplete: a Select too, with a text input in it.
    const vendor = field("INPUT", [".ant-select"]);
    expect(closesRow(vendor as unknown as EventTarget, rowHolding(vendor))).toBe(false);
    const day = field("INPUT", [".ant-picker"]);
    expect(closesRow(day as unknown as EventTarget, rowHolding(day))).toBe(false);
  });

  it("leaves it open from a pop-up of the row, from a checkbox or from the row itself", () => {
    const inPopUp = field("INPUT");
    expect(closesRow(inPopUp as unknown as EventTarget, rowHolding())).toBe(false);
    const tick = field("INPUT", [], "checkbox");
    expect(closesRow(tick as unknown as EventTarget, rowHolding(tick))).toBe(false);
    const button = field("BUTTON");
    expect(closesRow(button as unknown as EventTarget, rowHolding(button))).toBe(false);
    expect(closesRow(null, rowHolding())).toBe(false);
  });
});

describe("a billed shipment's buying row (User Council Q1)", () => {
  const line = (invoiceNumber: string, realAmount = "") => ({ invoiceNumber, realAmount });

  it("takes its real cost once the supplier's invoice number is on it", () => {
    expect(billedRealCostOpen(line("TESTUC-AP-001"), false)).toBe(true);
    expect(billedRealCostOpen(line(""), false)).toBe(false);
    expect(billedRealCostOpen(line("   "), false)).toBe(false);
  });

  it("as soon as the number is typed in the row, before its save is back", () => {
    expect(billedRealCostOpen(line(""), false, "TESTUC-AP-001")).toBe(true);
    // The number being cleared shuts it again.
    expect(billedRealCostOpen(line("TESTUC-AP-001"), false, "")).toBe(false);
  });

  it("not on a line that has a real amount already: it stays as billed", () => {
    expect(billedRealCostOpen(line("X-1", "1000.00"), false)).toBe(false);
    expect(billedRealCostOpen(line("X-1", "0.00"), false)).toBe(false);
    expect(billedRealCostOpen(line("", "1000.00"), false, "X-2")).toBe(false);
  });

  it("not on a line of an invoice marked paid", () => {
    expect(billedRealCostOpen(line("TESTUC-AP-001"), true)).toBe(false);
  });
});
