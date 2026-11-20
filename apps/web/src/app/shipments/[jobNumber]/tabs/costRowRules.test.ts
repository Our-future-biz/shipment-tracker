import { describe, expect, it } from "vitest";
import { billedRealCostOpen, closesRow, ownDirectionFirst } from "./costRowRules";
import { chargeOptions } from "@/lib/chargeCodes";

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

describe("the cost categories in the job's direction (user council O25)", () => {
  const customs = (dir: string) =>
    ownDirectionFirst(chargeOptions(undefined, "Sea Freight"), dir)
      .filter((o) => o.label.toLowerCase().includes("customs"))
      .map((o) => o.value);
  it("lists the export customs fee first on an export, the import one on an import", () => {
    expect(customs("Export").indexOf("customs_export")).toBeLessThan(customs("Export").indexOf("customs_import"));
    expect(customs("Import").indexOf("customs_import")).toBeLessThan(customs("Import").indexOf("customs_export"));
  });
  it("moves only the twin: every other category keeps its place, and no direction keeps the list", () => {
    const all = chargeOptions(undefined, "Air");
    const exp = ownDirectionFirst(all, "Export");
    expect(exp.map((o) => o.value).sort()).toEqual(all.map((o) => o.value).sort());
    expect(exp.findIndex((o) => o.value === "air_export_handling")).toBeLessThan(exp.findIndex((o) => o.value === "air_import_handling"));
    const imp = ownDirectionFirst(all, "Import");
    expect(imp.findIndex((o) => o.value === "air_import_handling")).toBeLessThan(imp.findIndex((o) => o.value === "air_export_handling"));
    expect(ownDirectionFirst(all, "")).toBe(all);
  });
});
