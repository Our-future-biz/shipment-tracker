import { describe, expect, it } from "vitest";
import { containersFromText, containersText, packagesFromText, packagesText } from "./quoteCargoText";
import { quoteReadingPatch, quoteReviewRows } from "./quoteReading";

describe("containers as text", () => {
  it("reads the quote's container types, with the cargo weight per container", () => {
    expect(containersFromText("2 x 20' DC, 18000 kg; 1 x 40' hc")).toEqual([
      { qty: 2, type: "20' DC", weight: 18000 },
      { qty: 1, type: "40' HC" },
    ]);
  });

  it("reads nothing of a list with a type the quote has no option for, or a weight in another unit", () => {
    expect(containersFromText("1 x 40' HC; 1 x 40HC")).toBeUndefined();
    expect(containersFromText("1 x 40' HC, 18 t")).toBeUndefined();
    expect(containersFromText("")).toBeUndefined();
  });

  it("writes the lines back as the reading gives them", () => {
    const text = "2 x 20' DC, 18000 kg; 1 x 40' HC";
    expect(containersText(containersFromText(text)!)).toBe(text);
  });
});

describe("packages as text", () => {
  it("reads pieces with their package type, size in cm and weight of one piece", () => {
    expect(packagesFromText("4 x Pallets, 120 x 80 x 150 cm, 450 kg each; 3 pcs, 200 x 100 x 90 cm")).toEqual([
      { qty: 4, type: "Pallets", length: 120, width: 80, height: 150, weight: 450 },
      { qty: 3, type: "", length: 200, width: 100, height: 90 },
    ]);
    expect(packagesFromText("6 x cartons")).toEqual([{ qty: 6, type: "Cartons" }]);
  });

  it("reads nothing of a list with a package type the quote has no option for, or a size in metres", () => {
    expect(packagesFromText("4 x Pallets; 2 x Rolls")).toBeUndefined();
    expect(packagesFromText("4 x Pallets, 1.2 x 0.8 x 1.5 m")).toBeUndefined();
  });

  it("writes the lines back as the reading gives them", () => {
    const text = "4 x Pallets, 120 x 80 x 150 cm, 450 kg each; 3 pcs, 200 x 100 x 90 cm";
    expect(packagesText(packagesFromText(text)!)).toBe(text);
  });
});

describe("a reading's containers and packages on a quote", () => {
  it("writes them as the quote's lines", () => {
    const { fields } = quoteReviewRows({ "Freight Mode": "Sea FCL", Containers: "1 x 40' HC, 15000 kg" }, null);
    expect(quoteReadingPatch(fields)).toEqual({ patch: { serviceType: "Sea FCL", containers: [{ qty: 1, type: "40' HC", weight: 15000 }] }, problems: [] });
    const lcl = quoteReviewRows({ Packages: "2 x Pallets, 120 x 80 x 100 cm, 300 kg each", "Volume (cbm)": "1.92" }, null);
    expect(quoteReadingPatch(lcl.fields).patch).toEqual({ packages: [{ qty: 2, type: "Pallets", length: 120, width: 80, height: 100, weight: 300 }], cbm: 1.92 });
  });

  it("refuses a corrected list it cannot read, saying what it takes", () => {
    const { fields } = quoteReviewRows({ Containers: "1 x 40' HC" }, null);
    const { problems } = quoteReadingPatch(fields.map((f) => ({ ...f, extractedValue: "one big box" })));
    expect(problems).toEqual([`Containers must be entries like "2 x 20' DC, 18000 kg; 1 x 40' HC" (a container type of Cargo details)`]);
  });

  it("shows what an existing quote already lists, the different list unticked", () => {
    const quote = { containers: [{ qty: 2, type: "20' DC" }] };
    expect(quoteReviewRows({ Containers: "2 x 20' DC" }, quote)).toMatchObject({ fields: [], alreadyThere: 1 });
    expect(quoteReviewRows({ Containers: "1 x 40' HC" }, quote).fields).toEqual([
      { column: "Containers", extractedValue: "1 x 40' HC", existingValue: "2 x 20' DC", hasConflict: true, approved: false },
    ]);
  });
});
