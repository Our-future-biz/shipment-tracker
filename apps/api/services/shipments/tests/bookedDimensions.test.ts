import { describe, expect, it } from "vitest";
import { bookedDimensionsFromQuote } from "../lib/bookedDimensions";
import { NOT_STACKABLE, STACKABLE } from "../lib/cargoProjection";

// Booked Dimensions (owner's answer 22 Nov): the quote's package lines, copied from the quote itself.
describe("bookedDimensionsFromQuote", () => {
  it("books each package line of the quote as a dimension line", () => {
    const data = {
      packages: [
        { qty: 4, type: "Pallets", length: 120, width: 80, height: 150, weight: 450, stackable: true },
        { qty: 2, type: "Cartons", length: 60, width: 40, height: 40, weight: 0, stackable: false },
      ],
    };
    expect(bookedDimensionsFromQuote(data)).toEqual([
      { containerId: null, pieces: "4", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "450", packageType: "Pallet(s)", stackable: STACKABLE },
      { containerId: null, pieces: "2", lengthCm: "60", widthCm: "40", heightCm: "40", weightPerPcKg: "", packageType: "Cartons", stackable: NOT_STACKABLE },
    ]);
  });

  it("puts the quote's dangerous goods on every line, a UN number of four digits only", () => {
    const lines = bookedDimensionsFromQuote({
      dangerous: true,
      adr: { adrUn: "UN 1203", adrClass: "3", adrPackingGroup: "II" },
      packages: [{ qty: 1 }, { qty: 2 }],
    });
    expect(lines.map((l) => [l.adrUn, l.adrClass, l.adrPackingGroup, l.adrLimitedQuantity])).toEqual([
      ["1203", "3", "II", false],
      ["1203", "3", "II", false],
    ]);
    expect(bookedDimensionsFromQuote({ dangerous: true, adr: { adrUn: "12" }, packages: [{ qty: 1 }] })[0]).not.toHaveProperty("adrUn");
  });

  it("books nothing for a quote without package lines, an empty line or data it cannot read", () => {
    expect(bookedDimensionsFromQuote({ containers: [{ qty: 1, type: "40' HC" }] })).toEqual([]);
    expect(bookedDimensionsFromQuote({ packages: [{ type: "Pallets" }] })).toEqual([]);
    expect(bookedDimensionsFromQuote(null)).toEqual([]);
    expect(bookedDimensionsFromQuote({ packages: "x" })).toEqual([]);
  });
});
