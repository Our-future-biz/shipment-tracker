import { describe, expect, it } from "vitest";
import {
  piecesOf,
  perPieceText,
  totalText,
  lineTotal,
  plainDecimal,
  checkConsistency,
  compareFigure,
  dimensionLineIsEmpty,
  dimensionLineVolume,
  dimensionTotals,
  lineInCm,
  lineInUnit,
  CONTAINER_TYPES,
  containerType,
  NOT_STACKABLE,
  numberInput,
  STACKABLE,
  shipmentStackability,
  withShipmentStackability,
  withoutTypedVolumeWhenSized,
} from "./cargo";
import { containerTypeFrom } from "@/app/documents/_lib/extraction";

describe("CONTAINER_TYPES", () => {
  it("offers the agreed equipment: the dry box is DC; no 20' HC, 20' HR or 40' RF; the 40' high-cube reefer is HRF", () => {
    expect(CONTAINER_TYPES).toEqual([
      "20' DC", "20' RF", "20' OT", "20' HOT", "20' FR",
      "40' DC", "40' HC", "40' HRF", "40' OT", "40' HOT", "40' FR", "40' HFR",
      "45' HQ",
    ]);
  });
});

describe("containerType", () => {
  it("reads a dry box saved as GP as the DC it is today, and leaves the others", () => {
    expect(["20' GP", "40' GP", " 40'GP ", "40' DC", "40' HC", "", undefined].map(containerType)).toEqual(["20' DC", "40' DC", "40' DC", "40' DC", "40' HC", "", ""]);
  });

  it("reads a document's dry box as DC", () => {
    expect([containerTypeFrom("20", "DRY"), containerTypeFrom("40", "GP"), containerTypeFrom("40", "DC")]).toEqual(["20' DC", "40' DC", "40' DC"]);
  });
});

describe("containerTypeFrom", () => {
  it("reads a 40' reefer as the high-cube reefer and a 20' one as RF", () => {
    expect(containerTypeFrom("40", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40", "RH")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "HR")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "REEFER")).toBe("40' HRF");
    expect(containerTypeFrom("40HC", "DRY")).toBe("40' HC");
    expect(containerTypeFrom("20", "RF")).toBe("20' RF");
  });

  it("leaves out equipment that isn't offered", () => {
    expect(containerTypeFrom("20HC", "DRY")).toBe("");
  });
});

describe("shipmentStackability", () => {
  const row = (stackable: string) => ({ stackable });
  it("is not stackable when any row is not stackable", () => {
    expect(shipmentStackability([row(STACKABLE), row(NOT_STACKABLE)])).toBe(NOT_STACKABLE);
  });
  it("is stackable when a row is stackable and none is not", () => {
    expect(shipmentStackability([row(""), row(STACKABLE)])).toBe(STACKABLE);
  });
  it("is empty when no row says", () => {
    expect(shipmentStackability([row("")])).toBe("");
    expect(shipmentStackability([])).toBe("");
  });
});

describe("withShipmentStackability", () => {
  const line = (stackable: string, containerId: string | null = "c1") => ({
    containerId, pieces: "2", lengthCm: "120", widthCm: "80", heightCm: "100", weightPerPcKg: "300", packageType: "Pallet(s)", stackable,
  });

  it("puts the picked value on every row and keeps the rest of each row", () => {
    const out = withShipmentStackability([line(STACKABLE), line("")], NOT_STACKABLE);
    expect(out.map((r) => r.stackable)).toEqual([NOT_STACKABLE, NOT_STACKABLE]);
    expect(out[0]).toMatchObject({ pieces: "2", lengthCm: "120", containerId: "c1" });
  });

  it("gives a shipment without rows one row holding only the stackability", () => {
    expect(withShipmentStackability([], STACKABLE, "c9")).toEqual([
      { containerId: "c9", pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: STACKABLE },
    ]);
  });

  it("adds no row when clearing a shipment without rows", () => {
    expect(withShipmentStackability([], "")).toEqual([]);
  });
});

describe("numberInput", () => {
  it("drops letters and other characters", () => {
    expect(numberInput("E")).toBe("");
    expect(numberInput("12a3 kg")).toBe("123");
    expect(numberInput("R", false)).toBe("");
  });
  it("keeps one decimal point and turns a comma into a point", () => {
    expect(numberInput("350.5")).toBe("350.5");
    expect(numberInput("350,5")).toBe("350.5");
    expect(numberInput("1.2.3")).toBe("1.23");
    expect(numberInput(".5")).toBe(".5");
  });
  it("takes whole numbers only when decimals are off", () => {
    expect(numberInput("12.5", false)).toBe("125");
    expect(numberInput("-4", false)).toBe("4");
  });
  it("keeps at most maxDigits digits in the whole-number part", () => {
    expect(numberInput("12345", false, 4)).toBe("1234");
    expect(numberInput("99999.5", true, 4)).toBe("9999.5");
    expect(numberInput("1234", true, 4)).toBe("1234");
  });
});

describe("compareFigure / checkConsistency", () => {
  it("agrees with the figures shown: equal at the shown decimals is a match", () => {
    expect(compareFigure(99.999, 100, 2).ok).toBe(true);
    expect(compareFigure(1.2346, 1.2355, 3).ok).toBe(false);
    expect(compareFigure(0, 0, 0)).toMatchObject({ empty: true, ok: true });
  });
  it("matches a container whose dimension rows add up to what it declares", () => {
    const line = { pieces: "3", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "33.333", packageType: "", stackable: "" };
    const c = { containerNumber: "", sealNumber: "", type: "", teu: "", packages: "3", packageType: "", grossWeight: "100", volume: "3" };
    expect(checkConsistency(c, [line]).matched).toBe(true);
  });
});

describe("dimensionLineIsEmpty", () => {
  const blank = { pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "" };
  it("keeps a line holding only a pallet type or ADR data", () => {
    expect(dimensionLineIsEmpty(blank)).toBe(true);
    expect(dimensionLineIsEmpty({ ...blank, palletType: "EUR" })).toBe(false);
    expect(dimensionLineIsEmpty({ ...blank, adrUn: "1203" })).toBe(false);
  });
});

describe("dimension units", () => {
  const line = { pieces: "2", lengthCm: "44", widthCm: "40.5", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "", dimensionUnit: "in" as const };
  it("sends inches as exact cm and shows them back as typed", () => {
    const cm = lineInCm(line);
    expect([cm.lengthCm, cm.widthCm, cm.heightCm]).toEqual(["111.76", "102.87", ""]);
    expect(lineInUnit(cm)).toMatchObject({ lengthCm: "44", widthCm: "40.5", heightCm: "" });
  });
  it("leaves a cm line as it is", () => {
    const cmLine = { ...line, dimensionUnit: "cm" as const };
    expect(lineInCm(cmLine)).toBe(cmLine);
    expect(lineInUnit(cmLine)).toBe(cmLine);
  });
  it("brings an inch size with up to 4 decimals back unchanged", () => {
    for (const inch of ["0.0001", "1.2345", "44.1234", "12.5", "9999.9999"]) {
      const back = lineInUnit(lineInCm({ ...line, lengthCm: inch }));
      expect(back.lengthCm).toBe(String(Number(inch)));
    }
  });
  it("leaves a size that is not a number as it is", () => {
    expect(lineInCm({ ...line, lengthCm: "12,5" }).lengthCm).toBe("12,5");
  });
  it("converts a row holding only the sizes and their unit, keeping its other fields", () => {
    const row = { pieces: "1", lengthCm: "25.4", widthCm: "50.8", heightCm: "", weightPerPcKg: "3", dimensionUnit: "in" as const };
    expect(lineInUnit(row)).toEqual({ ...row, lengthCm: "10", widthCm: "20" });
  });
});

describe("a dimension line without its sizes", () => {
  const line = { containerId: null, pieces: "4", lengthCm: "", widthCm: "", heightCm: "", dimensionUnit: "cm" as const, weightPerPcKg: "250", volumePerPcM3: "0.6", packageType: "", stackable: "" };

  it("keeps the volume typed for it and adds it to the container's check", () => {
    expect(dimensionLineIsEmpty({ ...line, pieces: "", weightPerPcKg: "" })).toBe(false);
    const c = { containerNumber: "", sealNumber: "", type: "", teu: "", packages: "4", packageType: "", grossWeight: "1000", volume: "2.4" };
    const check = checkConsistency(c, [line]);
    expect(check.matched).toBe(true);
    expect(check.m3.sum).toBeCloseTo(2.4, 6);
  });

  // What the warehouse's Dimensions / Remeasurement card lists for each line and adds up, on both
  // sides: a line nobody remeasured counts the same, so it never reads as a difference.
  it("counts its typed volume in the line's m³ and the totals, beside a sized line", () => {
    const sized = { ...line, pieces: "2", lengthCm: "100", widthCm: "100", heightCm: "100", volumePerPcM3: "" };
    expect(dimensionLineVolume(line)).toBeCloseTo(2.4, 6);
    expect(dimensionLineVolume(sized)).toBe(2);
    const t = dimensionTotals([sized, line]);
    expect(t.pcs).toBe(6);
    expect(t.kg).toBe(1500);
    expect(t.m3).toBeCloseTo(4.4, 6);
  });

  it("reads a decimal comma as a point, and a typed volume or pieces that are no number as none", () => {
    expect(dimensionLineVolume({ ...line, volumePerPcM3: "0,5" })).toBe(2);
    expect(dimensionLineVolume({ ...line, volumePerPcM3: "abc" })).toBe(0);
    expect(dimensionLineVolume({ ...line, pieces: "" })).toBe(0);
    expect(dimensionTotals([{ ...line, pieces: "x" }])).toEqual({ pcs: 0, kg: 0, m3: 0 });
  });

  it("loses its typed volume once a change gives it all three sizes, so it cannot come back when one is cleared", () => {
    const sized = withoutTypedVolumeWhenSized({ ...line, lengthCm: "120", widthCm: "80", heightCm: "100" });
    expect(sized.volumePerPcM3).toBe("");
    expect(dimensionLineVolume({ ...sized, heightCm: "" })).toBe(0);
    // Inches are sizes too; a line still short of a size keeps what was typed.
    expect(withoutTypedVolumeWhenSized({ ...line, lengthCm: "40", widthCm: "40", heightCm: "40", dimensionUnit: "in" as const }).volumePerPcM3).toBe("");
    const short = { ...line, lengthCm: "120", widthCm: "80" };
    expect(withoutTypedVolumeWhenSized(short)).toBe(short);
  });
});

describe("All pieces: totals stored per piece", () => {
  it("shares a total out per piece and shows it back as typed", () => {
    // 20 pallets, 3,000 kg and 10 m³ in all.
    expect([perPieceText(3000, 20), perPieceText(10, 20)]).toEqual(["150", "0.5"]);
    expect([totalText(150, 20, 2), totalText(0.5, 20, 3)]).toEqual(["3000", "10"]);
  });

  it("keeps a total that does not share out evenly, as shown", () => {
    const share = perPieceText(1000, 3);
    expect(share).toBe("333.333333333");
    expect(totalText(Number(share), 3, 2)).toBe("1000");
    expect(totalText(Number(perPieceText(10, 7)), 7, 3)).toBe("10");
  });

  it("gives a total back over thousands of pieces - and a declared container matches it", () => {
    // 7 m³ over 3,000 pieces: 0.002333 a piece would be 6.999 m³ and a Volume Mismatch.
    const share = perPieceText(7, 3000);
    expect(share).toBe("0.00233333333333");
    expect(totalText(Number(share), 3000, 3)).toBe("7");
    const line = { containerId: "c1", pieces: "3000", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: perPieceText(4500, 3000), volumePerPcM3: share, packageType: "", stackable: "" };
    expect(compareFigure(dimensionTotals([line]).m3, 7, 3).ok).toBe(true);
    expect(compareFigure(dimensionTotals([line]).kg, 4500, 2).ok).toBe(true);
    // A tiny volume over many pieces is not lost to rounding, and stays a plain number the server takes.
    expect(perPieceText(0.001, 3000)).toBe("0.000000333333333333");
    expect(totalText(Number(perPieceText(0.001, 3000)), 3000, 3)).toBe("0.001");
    for (const [total, pieces] of [[7, 9999], [12345.67, 1234], [0.5, 4321]] as const) {
      expect(perPieceText(total, pieces)).toMatch(/^\d+(\.\d+)?$/);
      expect(Number(totalText(Number(perPieceText(total, pieces)), pieces, 3))).toBe(Number(total.toFixed(3)));
    }
  });

  it("shares a total out again from the total, so changing Pcs keystroke after keystroke does not drift", () => {
    // Typing 3000 pieces over a 7 m³ line: 3 → 30 → 300 → 3000, each step from the line's total.
    let pieces = 1;
    let share = perPieceText(7, pieces);
    for (const next of [3, 30, 300, 3000, 1, 2999]) {
      share = perPieceText(lineTotal(Number(share), pieces), next);
      pieces = next;
      expect(lineTotal(Number(share), pieces)).toBe(7);
    }
    expect(lineTotal(Number(perPieceText(3000.555, 7)), 7)).toBe(3000.555);
  });

  it("writes a share as a plain decimal, never with an exponent", () => {
    expect([plainDecimal(150), plainDecimal(0.5), plainDecimal(1 / 3), plainDecimal(3.333e-7)]).toEqual(["150", "0.5", "0.333333333333", "0.0000003333"]);
    expect([plainDecimal(0), plainDecimal(-1), plainDecimal(Number.NaN)]).toEqual(["", "", ""]);
  });

  it("counts a line without pieces as none: it has no totals, as the totals row and the server count it", () => {
    expect([piecesOf({ pieces: "" }), piecesOf({ pieces: "0" }), piecesOf({ pieces: "12" })]).toEqual([0, 0, 12]);
    expect([perPieceText(3000, 0), totalText(150, 0, 2), lineTotal(150, 0)]).toEqual(["", "", 0]);
    expect([perPieceText(0, 5), totalText(0, 5, 2)]).toEqual(["", ""]);
  });
});
