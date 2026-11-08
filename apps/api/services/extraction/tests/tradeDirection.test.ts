import { describe, expect, it } from "vitest";
import { applyTradeDirection, QUOTE_DESTINATION_LABELS } from "../lib/tradeDirection";

const directionOf = (record: Record<string, string>, labels?: readonly string[]) => {
  applyTradeDirection(record, labels);
  return record["Trade Direction"];
};

describe("the Trade Direction of a reading", () => {
  it.each([
    ["Prague (CZPRG)", "Import"],
    ["Prague, Czech Republic", "Import"],
    ["Ostrava, Czechia", "Import"],
    ["Brno, CZ", "Import"],
    ["Hamburg (DEHAM)", "Export"],
    ["Halifax, Canada", "Export"],
  ])("to %s is %s", (Destination, direction) => {
    expect(directionOf({ Destination })).toBe(direction);
  });

  it("goes by the destination, whatever the document called it", () => {
    expect(directionOf({ Destination: "Prague (CZPRG)", "Trade Direction": "EXP" })).toBe("Import");
    expect(directionOf({ Destination: "Hamburg (DEHAM)", "Trade Direction": "IMP" })).toBe("Export");
  });

  it("goes by the final destination before the port of discharge", () => {
    expect(directionOf({ POD: "Hamburg (DEHAM)", Destination: "Prague (CZPRG)" })).toBe("Import");
  });

  it("is an import when the cargo is discharged in the Czech Republic, wherever it goes on to", () => {
    expect(directionOf({ POD: "Praha (CZPRG)", Destination: "Linz (ATLNZ)", "Trade Direction": "EXP" })).toBe("Import");
    expect(directionOf({ POD: "Praha (CZPRG)", Destination: "Kladno" })).toBe("Import");
  });

  it("is an export when both the destination and the port of discharge are abroad", () => {
    expect(directionOf({ POD: "Hamburg (DEHAM)", Destination: "Linz (ATLNZ)" })).toBe("Export");
  });

  it("takes a Czech port of discharge for the destination when none was read", () => {
    expect(directionOf({ POD: "Prague (CZPRG)" })).toBe("Import");
  });

  it("is left unset by a port of discharge abroad with no destination read, whatever the reader said", () => {
    expect(directionOf({ POD: "Hamburg (DEHAM)" })).toBeUndefined();
    expect(directionOf({ POD: "Hamburg (DEHAM)", "Trade Direction": "EXP" })).toBeUndefined();
    expect(directionOf({ POD: "Hamburg, Germany", "Trade Direction": "IMP" })).toBeUndefined();
  });

  it("still goes by a quote's destination when it is a port abroad", () => {
    expect(directionOf({ Destination: "Hamburg (DEHAM)" }, QUOTE_DESTINATION_LABELS)).toBe("Export");
  });

  it("keeps the reader's answer when the place's country can't be told", () => {
    expect(directionOf({ Destination: "Kladno", POD: "Hamburg (DEHAM)", "Trade Direction": "IMP" })).toBe("IMP");
    expect(directionOf({ "Trade Direction": "EXP" })).toBe("EXP");
    expect(directionOf({ Destination: "Kladno" })).toBeUndefined();
  });

  it("goes by a quote's delivery address before its port", () => {
    expect(directionOf({ Destination: "Hamburg (DEHAM)", Delivery: "ACME s.r.o., Street 1, 110 00 Praha, Czech Republic" }, QUOTE_DESTINATION_LABELS)).toBe("Import");
    expect(directionOf({ Destination: "Prague (CZPRG)" }, QUOTE_DESTINATION_LABELS)).toBe("Import");
  });
});
