import { describe, expect, it } from "vitest";
import {
  ACCEPT_BY_HAND,
  ALREADY_ACCEPTED,
  acceptByHandRefusal,
  acceptRefusal,
  alreadyAccepted,
  acceptedContainerFigures,
  acceptedDimensionLines,
  acceptedLinesOf,
  acceptedTotals,
  exactFiguresOf,
  figuresOf,
  holdsRemeasuredLines,
  parseRemeasuredLines,
  readFigures,
  roundedFigures,
  sameCargoDetails,
  sameRemeasuredLines,
} from "../lib/remeasureAccept";
import type { CargoDimensionLine, ContainerLine } from "../interfaces/interfaces";

// CZAIR00000094: declared 5 cartons 120×80×150 cm, 34 kg each; the warehouse found 5 × 140×220×225 cm, 50 kg each.
const declared: CargoDimensionLine = {
  containerId: "c1",
  pieces: "5",
  lengthCm: "120",
  widthCm: "80",
  heightCm: "150",
  dimensionUnit: "cm",
  weightPerPcKg: "34",
  volumePerPcM3: "",
  packageType: "Cartons",
  stackable: "Stackable / Overstowable",
  palletType: null,
  adrUn: "1203",
  adrClass: "3",
  adrPackingGroup: "II",
  adrLimitedQuantity: false,
};
const saved = JSON.stringify([{ pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]);

describe("parseRemeasuredLines", () => {
  it("reads the saved lines, a decimal comma as a point", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "10,5", widthCm: "20", heightCm: "30", weightPerPcKg: "1,5" }]))).toEqual([
      { pieces: "2", lengthCm: "10.5", widthCm: "20", heightCm: "30", weightPerPcKg: "1.5" },
    ]);
  });

  it("leaves out lines without pieces, which need no figures", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "", lengthCm: "10" }, { pieces: "1", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "1" }]))).toHaveLength(1);
  });

  it("refuses a line with pieces whose weight or sizes are not measured, naming the line, so no empty weight or volume is written over the shipment's", () => {
    const full = { pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };
    const rule = "the warehouse must measure weight and sizes of every line before it can be accepted";
    expect(() => parseRemeasuredLines(JSON.stringify([full, { ...full, weightPerPcKg: "" }]))).toThrow(`Remeasured line 2 has no kg per piece: ${rule}`);
    expect(() => parseRemeasuredLines(JSON.stringify([{ ...full, heightCm: "" }]))).toThrow(`Remeasured line 1 has no height: ${rule}`);
    // A missing field and a 0 alike; the number is the line's in the warehouse's list, lines without pieces counted.
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "" }, { pieces: "3", lengthCm: "0", weightPerPcKg: "10" }]))).toThrow(`Remeasured line 2 has no length, width or height: ${rule}`);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "3" }]))).toThrow(`Remeasured line 1 has no kg per piece, length, width or height: ${rule}`);
  });

  // Owner decision (22 Nov 2026): a House B/L read by Document Reading is saved as one line with the
  // B/L's m³ per piece and no sizes. Its volume counts where lines are compared and totalled, but
  // Accept still needs the sizes measured - the B/L's volume is no remeasurement of the pieces.
  it("still refuses a line written from a House B/L: its m³ per piece is no measured sizes", () => {
    const rule = "the warehouse must measure weight and sizes of every line before it can be accepted";
    const bl = JSON.stringify([{ pieces: "30", weightPerPcKg: "50", volumePerPcM3: "0.1166667" }]);
    expect(() => parseRemeasuredLines(bl)).toThrow(`Remeasured line 1 has no length, width or height: ${rule}`);
  });

  it("refuses nothing to accept, unreadable text and a figure that is not a number", () => {
    expect(() => parseRemeasuredLines("")).toThrow(/nothing to accept/);
    expect(() => parseRemeasuredLines("[]")).toThrow(/nothing to accept/);
    expect(() => parseRemeasuredLines("{")).toThrow(/cannot be read/);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "abc" }]))).toThrow("Remeasured line 1: length is not a number");
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "1.5" }]))).toThrow("Remeasured line 1: Qty must be a whole number");
  });
});

describe("figuresOf", () => {
  it("adds pieces, kg and m³ as the Warehouse tab does", () => {
    expect(figuresOf(parseRemeasuredLines(saved))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(figuresOf([declared])).toEqual({ colli: 5, weightKg: 170, volumeCbm: 7.2 });
  });

  it("takes a line's typed m³ when its sizes are not all known", () => {
    expect(figuresOf([{ ...declared, lengthCm: "", volumePerPcM3: "0.5" }]).volumeCbm).toBe(2.5);
  });

  it("totals a line written from a House B/L by its m³ per piece; all three sizes win over it", () => {
    const bl = { pieces: "30", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "50", volumePerPcM3: "0.1166667" };
    expect(figuresOf([bl])).toEqual({ colli: 30, weightKg: 1500, volumeCbm: 3.5 });
    expect(figuresOf([{ ...bl, pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100" }]).volumeCbm).toBe(2);
  });
});

describe("acceptedDimensionLines", () => {
  it("takes the measured figures and keeps what the warehouse does not measure", () => {
    const [line] = acceptedDimensionLines(parseRemeasuredLines(saved), [declared]);
    expect(line).toEqual({
      ...declared,
      lengthCm: "140",
      widthCm: "220",
      heightCm: "225",
      weightPerPcKg: "50",
    });
  });

  it("gives extra lines the first line's package type, and works without any line", () => {
    const two = parseRemeasuredLines(JSON.stringify([{ pieces: "1", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "1" }, { pieces: "2", lengthCm: "20", widthCm: "20", heightCm: "20", weightPerPcKg: "2" }]));
    expect(acceptedDimensionLines(two, [declared]).map((l) => l.packageType)).toEqual(["Cartons", "Cartons"]);
    const [bare] = acceptedDimensionLines(two, []);
    expect(bare).toMatchObject({ containerId: null, packageType: "", stackable: "", adrUn: null, dimensionUnit: "cm", volumePerPcM3: "" });
  });

  it("sizes typed in inches are replaced by the measured cm", () => {
    const [line] = acceptedDimensionLines(parseRemeasuredLines(saved), [{ ...declared, dimensionUnit: "in" }]);
    expect(line!.dimensionUnit).toBe("cm");
  });
});

describe("acceptedTotals", () => {
  it("stores Pcs, tons and m³ as the shipment keeps them", () => {
    expect(acceptedTotals({ colli: 5, weightKg: 250, volumeCbm: 34.65 })).toEqual({ pcs: "5", totalWeightTons: "0.2500", totalVolumeCbm: "34.6500" });
    expect(acceptedTotals({ colli: 3, weightKg: 0, volumeCbm: 0 })).toEqual({ pcs: "3", totalWeightTons: null, totalVolumeCbm: null });
  });

  it("rounds the exact totals once: the weight to 0.1 kg, the volume to 0.001 m³, as they are compared", () => {
    // 7 × 13.25 kg = 92.75 kg.
    const exact = exactFiguresOf(parseRemeasuredLines(JSON.stringify([{ pieces: "7", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "13.25" }])));
    expect(exact.weightKg).toBe(92.75);
    expect(acceptedTotals(exact).totalWeightTons).toBe("0.0928");
    expect(roundedFigures(exact).weightKg).toBe(92.8);
    // Mock test council n13: lines of 1.23449 m³ are 1.234 at the 3 decimals Cargo Details compares;
    // a Total Volume kept as 1.2345 read 1.235 there, and the Volume pill turned red after the Accept.
    expect(acceptedTotals({ colli: 3, weightKg: 1, volumeCbm: 1.23449 }).totalVolumeCbm).toBe("1.2340");
    expect(acceptedTotals({ colli: 3, weightKg: 1, volumeCbm: 1.23456 }).totalVolumeCbm).toBe("1.2350");
    expect(acceptedTotals({ colli: 1, weightKg: 1, volumeCbm: 0.0004 }).totalVolumeCbm).toBeNull();
  });
});

describe("acceptedContainerFigures", () => {
  it("gives the only container the exact totals, no trailing zeros", () => {
    expect(acceptedContainerFigures({ colli: 7, weightKg: 92.75, volumeCbm: 0.007 })).toEqual({ packages: "7", grossWeight: "92.75", volume: "0.007" });
    expect(acceptedContainerFigures({ colli: 0, weightKg: 0, volumeCbm: 0 })).toEqual({ packages: "", grossWeight: "", volume: "" });
  });
});

// Council finding X2, mock test council Y8: line n keeps the shipment's line n's container, packing
// and dangerous goods - with dangerous goods or several containers only when it is the same cargo.
describe("acceptByHandRefusal", () => {
  const general = { ...declared, adrUn: null, adrClass: null, adrPackingGroup: null, pieces: "4" };
  const un1993 = { ...general, pieces: "1", adrUn: "1993", adrClass: "3" };
  const pcs = (...n: number[]) => n.map((p) => ({ pieces: String(p) }));

  it("refuses another number of lines when dangerous goods are on the lines, so a UN number neither vanishes nor moves", () => {
    expect(acceptByHandRefusal(pcs(5), [general, un1993])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(pcs(4, 1, 1), [general, un1993])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(pcs(4, 1), [general, un1993])).toBeNull();
  });

  it("refuses the same number of lines in another order: 3 drums UN 1203 and 10 cartons, the cartons saved first", () => {
    const drums = { ...general, pieces: "3", packageType: "Drums", adrUn: "1203", adrClass: "3" };
    const cartons = { ...general, pieces: "10", packageType: "Cartons" };
    expect(acceptByHandRefusal(pcs(10, 3), [drums, cartons])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(pcs(3, 10), [drums, cartons])).toBeNull();
    // " 3" and "3.0" are the same pieces.
    expect(acceptByHandRefusal([{ pieces: " 3" }, { pieces: "10.0" }], [drums, cartons])).toBeNull();
  });

  it("refuses another number of lines, or other pieces on a line, on several containers, so no line falls into another", () => {
    expect(acceptByHandRefusal(pcs(4, 4, 1), [general, { ...general, containerId: "c2" }])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(pcs(5, 3), [general, { ...general, containerId: "c2" }])).toBe(ACCEPT_BY_HAND);
    expect(acceptByHandRefusal(pcs(4, 3), [general, { ...general, pieces: "3", containerId: "c2" }])).toBeNull();
  });

  // Review: lines told apart by their pieces only. (1) 1 drum pallet UN 1203, (2) 1 carton pallet;
  // the warehouse saved the carton pallet first - same number of lines, same pieces on each, and the
  // carton pallet would have become "Drum pallet, UN 1203".
  it("refuses lines of other cargo with the same pieces, in either order: the pieces don't say which is which", () => {
    const drums = { ...general, pieces: "1", packageType: "Drum pallet", adrUn: "1203", adrClass: "3", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "400" };
    const cartons = { ...general, pieces: "1", packageType: "Carton pallet", lengthCm: "120", widthCm: "100", heightCm: "180", weightPerPcKg: "150" };
    expect(acceptByHandRefusal(pcs(1, 1), [drums, cartons])).toBe(ACCEPT_BY_HAND);
    // Two containers of 4 pallets each: which of the warehouse's lines is whose is not known.
    expect(acceptByHandRefusal(pcs(4, 4), [general, { ...general, containerId: "c2" }])).toBe(ACCEPT_BY_HAND);
    // Lines that take over the same - one container, the same packing and UN number - may swap.
    expect(acceptByHandRefusal(pcs(1, 1, 3), [drums, { ...drums, lengthCm: "110" }, { ...cartons, pieces: "3" }])).toBeNull();
  });

  it("lets general cargo of one container, or none, take another number of lines and other pieces", () => {
    expect(acceptByHandRefusal(pcs(1, 1, 1), [general])).toBeNull();
    expect(acceptByHandRefusal(pcs(9), [general, { ...general, containerId: null }])).toBeNull();
    expect(acceptByHandRefusal(pcs(2, 2), [])).toBeNull();
  });
});

// Council finding m7: "120." and ".5" are numbers on both sides.
describe("a figure typed with a point at its end or start", () => {
  it("is read and stored tidy", () => {
    expect(parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "120.", widthCm: ".5", heightCm: "10", weightPerPcKg: "1," }]))).toEqual([
      { pieces: "2", lengthCm: "120", widthCm: "0.5", heightCm: "10", weightPerPcKg: "1" },
    ]);
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "1.2.3" }]))).toThrow("Remeasured line 1: length is not a number");
    expect(() => parseRemeasuredLines(JSON.stringify([{ pieces: "2", lengthCm: "." }]))).toThrow("Remeasured line 1: length is not a number");
  });
});

// Council finding m8: the same lines are not accepted twice.
describe("the lines an acceptance took over", () => {
  it("are read from its history entry, and the same lines are found however they were saved", () => {
    expect(acceptedLinesOf(JSON.stringify({ colli: 5, lines: saved }))).toBe(saved);
    expect(acceptedLinesOf(JSON.stringify({ colli: 5 }))).toBe("");
    expect(acceptedLinesOf("null")).toBe("");
    expect(sameRemeasuredLines(saved, JSON.stringify([{ weightPerPcKg: "50", pieces: " 5", lengthCm: "140.", widthCm: "220", heightCm: "225" }]))).toBe(true);
    expect(sameRemeasuredLines(saved, JSON.stringify([{ pieces: "6", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }]))).toBe(false);
    expect(sameRemeasuredLines("", saved)).toBe(false);
  });
});

describe("readFigures", () => {
  it("reads a history entry's figures, zeros when it can't", () => {
    expect(readFigures(JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines: "[]" }))).toEqual({ colli: 5, weightKg: 250, volumeCbm: 34.65 });
    expect(readFigures("nonsense")).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
    expect(readFigures(null)).toEqual({ colli: 0, weightKg: 0, volumeCbm: 0 });
  });
});

// Review: two Accepts at once, or one after the lines were accepted, record one acceptance - asked
// before the write and again in its write turn, on the history as it is then.
describe("acceptRefusal", () => {
  const general = { ...declared, adrUn: null, adrClass: null, adrPackingGroup: null };
  const accepted = (lines: string) => JSON.stringify({ colli: 5, weightKg: 250, volumeCbm: 34.65, lines });
  const remeasured = parseRemeasuredLines(saved);
  // Cargo Details as the acceptance of `saved` left them: its sizes and kg per piece, the packing kept.
  const holding = { ...general, pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };

  it("refuses the lines the last acceptance took over while Cargo Details hold them, also saved again with other spacing", () => {
    expect(acceptRefusal(saved, remeasured, accepted(saved), [holding])).toBe(ALREADY_ACCEPTED);
    expect(acceptRefusal(saved, remeasured, accepted(JSON.stringify([{ pieces: " 5 ", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" }])), [holding])).toBe(
      ALREADY_ACCEPTED,
    );
  });

  // Mock test council Y10: a page opened before the acceptance saved its old lines over it.
  it("lets the same lines be accepted again once Cargo Details no longer hold them", () => {
    expect(acceptRefusal(saved, remeasured, accepted(saved), [general])).toBeNull();
    expect(acceptRefusal(saved, remeasured, accepted(saved), [{ ...holding, weightPerPcKg: "49" }])).toBeNull();
    expect(acceptRefusal(saved, remeasured, accepted(saved), [holding, holding])).toBeNull();
  });

  it("lets new lines through, and lines when nothing was accepted or the entry names no lines", () => {
    const other = JSON.stringify([{ pieces: "6", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "40" }]);
    expect(acceptRefusal(saved, remeasured, accepted(other), [holding])).toBeNull();
    expect(acceptRefusal(saved, remeasured, null, [holding])).toBeNull();
    expect(acceptRefusal(saved, remeasured, "{}", [holding])).toBeNull();
  });

  it("alreadyAccepted says the first half alone: what the write turn asks before anything else", () => {
    expect(alreadyAccepted(saved, accepted(saved), [holding])).toBe(true);
    // A package type or UN number set since changes nothing measured.
    expect(alreadyAccepted(saved, accepted(saved), [{ ...holding, packageType: "Crates", adrUn: "1993" }])).toBe(true);
    expect(alreadyAccepted(saved, accepted(saved), [general])).toBe(false);
    expect(alreadyAccepted(saved, null, [holding])).toBe(false);
    expect(alreadyAccepted(saved, accepted("[]"), [holding])).toBe(false);
  });

  it("then asks whether the lines must be updated by hand", () => {
    expect(acceptRefusal(saved, remeasured, null, [general, declared])).toBe(ACCEPT_BY_HAND);
    // Already accepted says more: nothing new to accept at all.
    expect(acceptRefusal(saved, remeasured, accepted(saved), [{ ...holding, adrUn: "1203" }])).toBe(ALREADY_ACCEPTED);
  });
});

describe("holdsRemeasuredLines", () => {
  const line = { ...declared, pieces: "5", lengthCm: "140", widthCm: "220", heightCm: "225", weightPerPcKg: "50" };

  it("compares pieces, sizes and kg per piece line for line, as numbers", () => {
    const remeasured = parseRemeasuredLines(saved);
    expect(holdsRemeasuredLines([line], remeasured)).toBe(true);
    // Shown in inches once and saved back in cm.
    expect(holdsRemeasuredLines([{ ...line, lengthCm: "140.0000", dimensionUnit: "in" }], remeasured)).toBe(true);
    expect(holdsRemeasuredLines([{ ...line, heightCm: "226" }], remeasured)).toBe(false);
    expect(holdsRemeasuredLines([line, line], remeasured)).toBe(false);
    expect(holdsRemeasuredLines([], remeasured)).toBe(false);
  });
});

// Review: an acceptance is decided on Cargo Details as read before its write turn; a save in
// between makes it be looked at again rather than undo the save.
describe("sameCargoDetails", () => {
  const box: ContainerLine = { id: "c1", containerNumber: "MSKU1234567", sealNumber: "S1", type: "40' HC", teu: "2", packages: "5", packageType: "Cartons", grossWeight: "170", volume: "7.2" };
  const read = { containers: [box], lines: [declared] };

  it("holds for the same rows, whatever order their keys were built in", () => {
    const reordered = Object.fromEntries(Object.entries(box).reverse()) as unknown as ContainerLine;
    expect(sameCargoDetails(read, { containers: [reordered], lines: [{ ...declared }] })).toBe(true);
  });

  it("fails for a container added or removed, a changed seal or figure", () => {
    expect(sameCargoDetails(read, { containers: [box, { ...box, id: "c2" }], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [{ ...box, sealNumber: "S2" }], lines: [declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [{ ...box, grossWeight: "180" }], lines: [declared] })).toBe(false);
  });

  it("fails for a line added, removed, reordered or given other dangerous goods", () => {
    const second = { ...declared, pieces: "1", adrUn: "1993" };
    expect(sameCargoDetails(read, { containers: [box], lines: [declared, second] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [box], lines: [] })).toBe(false);
    expect(sameCargoDetails({ containers: [box], lines: [declared, second] }, { containers: [box], lines: [second, declared] })).toBe(false);
    expect(sameCargoDetails(read, { containers: [box], lines: [{ ...declared, adrClass: "8" }] })).toBe(false);
    // A value cleared to null is a change too.
    expect(sameCargoDetails(read, { containers: [box], lines: [{ ...declared, adrUn: null }] })).toBe(false);
  });
});
