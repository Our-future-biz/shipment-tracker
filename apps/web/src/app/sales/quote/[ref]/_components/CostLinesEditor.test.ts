import { describe, expect, it } from "vitest";
import type { CostLine } from "@/app/sales/_lib/types";
import { withBasis } from "@/app/sales/_lib/salesQuote";
import { amountOf, basisNotes, basisOptions, newCostLine, noteFor, serviceChange } from "./CostLinesEditor";

const line = (over: Partial<CostLine> = {}): CostLine => ({ type: "Ocean freight", chargeCode: "ocean_freight", description: "Ocean freight", supplier: "", currency: "USD", amount: 0, ...over });

describe("amountOf", () => {
  it("reads a stored amount as a number, whether it was saved as one, as text, or not at all", () => {
    expect(amountOf(line({ amount: 750 }))).toBe(750);
    expect(amountOf({ ...line(), amount: "750" as unknown as number })).toBe(750);
    expect(amountOf({ ...line(), amount: undefined as unknown as number })).toBe(0);
  });
});

describe("serviceChange", () => {
  it("names a line after its new service when its description is blank or the old service's name", () => {
    expect(serviceChange(line({ description: "" }), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "Air freight" }), ask: false });
    expect(serviceChange(line(), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "Air freight" }), ask: false });
  });

  it("follows the service while the description is still the pre-typed one", () => {
    const air = serviceChange(line({ type: "Other", chargeCode: "other", description: "" }), "air_freight").line;
    expect(serviceChange(air, "rail_freight")).toMatchObject({ line: { chargeCode: "rail_freight", description: "Rail freight / linehaul" }, ask: false });
  });

  it("keeps a description written by hand, and asks whether it gives way", () => {
    expect(serviceChange(line({ description: "SHA–HAM 40HC" }), "air_freight")).toEqual({ line: line({ type: "Air freight", chargeCode: "air_freight", description: "SHA–HAM 40HC" }), ask: true });
  });

  it("asks nothing when the description is the new service's name already", () => {
    expect(serviceChange(line({ description: "Air freight" }), "air_freight")).toMatchObject({ ask: false });
  });

  it("leaves the description blank for Other", () => {
    expect(serviceChange(line(), "other")).toMatchObject({ line: { chargeCode: "other", description: "" }, ask: false });
  });
});

// User Council S1, owner answer Q10 (20 Nov 2026): air is priced per chargeable kg, never by W/M.
describe("basisOptions", () => {
  const values = (...args: Parameters<typeof basisOptions>) => basisOptions(...args).map((o) => o.value);

  it("offers per chargeable kg on an air quote, and no W/M", () => {
    expect(values({ serviceType: "Air" }, {})).toEqual(["lumpsum", "kg"]);
    expect(basisOptions({ serviceType: "Air" }, {}).find((o) => o.value === "kg")?.label).toBe("Per chargeable kg");
  });

  it("still shows W/M on an air quote's line that has it, so an older quote reads as it did", () => {
    expect(values({ serviceType: "Air" }, { basis: "wm" })).toEqual(["lumpsum", "wm", "kg"]);
  });

  it("offers W/M on any other quote, per container only with containers, per chargeable kg only on air", () => {
    expect(values({ serviceType: "Sea LCL" }, {})).toEqual(["lumpsum", "wm"]);
    expect(values({ serviceType: "Sea FCL", containers: [{ qty: 2, type: "40' HC" }] }, {})).toEqual(["lumpsum", "wm", "container"]);
    expect(values({ serviceType: "Sea LCL" }, { basis: "kg" })).toEqual(["lumpsum", "wm", "kg"]);
  });
});

// The chair's finding (User Council, 20 Nov 2026): a line whose basis changed says how its rate came about.
describe("basisNotes", () => {
  const air = { serviceType: "Air", packages: [{ qty: 4, type: "Pallet", length: 120, width: 80, height: 100, weight: 87.5 }] };
  const lump = line({ type: "Air freight", description: "PRG → ORD", currency: "EUR", amount: 1344 });
  const perKg = withBasis(lump, "kg", air);

  it("notes a line whose basis changed since the last render, by its row key", () => {
    const notes = basisNotes({ "row-0": lump }, ["row-0"], [perKg], {});
    expect(noteFor(notes["row-0"], perKg)).toBe("Rate set from the lump sum: 1,344.00 ÷ 640 kg = 2.10");
  });

  it("keeps a note while the line is as it left it, and drops it once the rate or the cargo moves it", () => {
    const notes = basisNotes({ "row-0": lump }, ["row-0"], [perKg], {});
    const same = basisNotes({ "row-0": perKg }, ["row-0"], [perKg], notes);
    expect(same).toBe(notes);
    expect(noteFor(same["row-0"], { ...perKg, unitPrice: 2.5, amount: 1600 })).toBeNull();
    // A row that went takes its note with it.
    expect(basisNotes({ "row-0": perKg }, [], [], notes)).toEqual({});
  });

  it("notes nothing on the first render or for a line whose basis stayed", () => {
    expect(basisNotes({}, ["row-0"], [perKg], {})).toEqual({});
    expect(basisNotes({ "row-0": lump }, ["row-0"], [{ ...lump, amount: 1500 }], {})).toEqual({});
  });
});

describe("newCostLine", () => {
  it("starts an Air quote's Air freight line per chargeable kg, the chargeable weight as its quantity (R8)", () => {
    const air = { serviceType: "Air", currency: "EUR", weight: 640 } as never;
    expect(newCostLine(air)).toMatchObject({ chargeCode: "air_freight", basis: "kg", qty: 640, unit: "chargeable kg", unitPrice: 0, amount: 0 });
    // Another charge on an Air quote, or the freight line of another mode, starts as a lump sum.
    expect(newCostLine(air, { basis: "lumpsum", code: "handling" })).toMatchObject({ basis: "lumpsum", amount: 0 });
    expect(newCostLine({ serviceType: "Sea LCL", currency: "EUR" } as never)).toMatchObject({ chargeCode: "ocean_freight", basis: "lumpsum" });
  });
});
