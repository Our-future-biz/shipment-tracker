import { describe, expect, it } from "vitest";
import {
  bookedDeclaredFigures,
  cargoContainers,
  cargoItemIsEmpty,
  cargoPanelCheck,
  shipmentDeclaredFigures,
  piecesOf,
  perPieceText,
  totalText,
  lineTotal,
  plainDecimal,
  checkConsistency,
  compareFigure,
  CURRENCIES,
  civByCurrency,
  jobInvoiceValue,
  FIGURE_TOLERANCE,
  fmtFixed,
  dimensionLineIsEmpty,
  hasAdr,
  isDangerousShipment,
  adrUnText,
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
  shipmentWeightKg,
  withShipmentStackability,
  withoutTypedVolumeWhenSized,
} from "./cargo";
import type { CargoDimensionLine, CargoItemLine, DeclaredFigures } from "./cargo";
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
  it("takes the volume within 1 % for a match, weight and pieces only when equal (user council O22, mock council R19)", () => {
    expect(compareFigure(58.08, 58, 3, FIGURE_TOLERANCE)).toMatchObject({ ok: true, near: true });
    expect(compareFigure(58.7, 58, 3, FIGURE_TOLERANCE)).toMatchObject({ ok: false });
    expect(compareFigure(58, 58, 3, FIGURE_TOLERANCE).near).toBeUndefined();
    // Nothing declared is not "near": the lines' figure has nothing to be near to.
    expect(compareFigure(850, 0, 1, FIGURE_TOLERANCE).ok).toBe(false);
    const line = { pieces: "11", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "10", packageType: "", stackable: "" };
    const c = { containerNumber: "", sealNumber: "", type: "", teu: "", packages: "10", packageType: "", grossWeight: "110", volume: "11.05" };
    const check = checkConsistency(c, [line]);
    expect(check.m3).toMatchObject({ ok: true, near: true });
    expect(check.pcs.ok).toBe(false);
    // A 28,000 kg box whose lines add up to 28,270 kg is no match: the weight goes into the VGM and the B/L.
    const box = { ...c, packages: "1", grossWeight: "28000", volume: "1" };
    const heavy = { pieces: "1", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "28270", packageType: "", stackable: "" };
    expect(checkConsistency(box, [heavy]).kg).toMatchObject({ ok: false });
    expect(checkConsistency(box, [heavy]).kg.near).toBeFalsy();
  });
  it("says which Invoice Value the job's card shows: the commercial invoices', else the Cargo Details lines' (user council c4)", () => {
    const item = { containerId: null, cargoDescription: "PARTS", hsCode: "", pieces: "1", packageType: "", grossWeight: "", commercialInvoiceValue: "5000", currency: "EUR" };
    expect(jobInvoiceValue({ civByCurrency: "12 500 USD", commercialInvoiceValue: "", cargoItems: [item] })).toEqual({ value: "12 500 USD", from: "invoices" });
    expect(jobInvoiceValue({ civByCurrency: "", commercialInvoiceValue: "800 EUR", cargoItems: [item] })).toEqual({ value: "800 EUR", from: "invoices" });
    expect(jobInvoiceValue({ civByCurrency: "", commercialInvoiceValue: "", cargoItems: [item] })).toEqual({ value: civByCurrency([item]), from: "lines" });
    expect(jobInvoiceValue({ civByCurrency: "", commercialInvoiceValue: null, cargoItems: [] })).toEqual({ value: "", from: null });
  });
  it("lists the home currency first (user council O25)", () => {
    expect(CURRENCIES[0]?.code).toBe("CZK");
    expect(CURRENCIES.filter((c) => c.code === "CZK")).toHaveLength(1);
  });
  it("matches a container whose dimension rows add up to what it declares", () => {
    const line = { pieces: "3", lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "33.333", packageType: "", stackable: "" };
    const c = { containerNumber: "", sealNumber: "", type: "", teu: "", packages: "3", packageType: "", grossWeight: "100", volume: "3" };
    expect(checkConsistency(c, [line]).matched).toBe(true);
  });
});

describe("shipmentDeclaredFigures", () => {
  it("reads Pcs with thousands separators as the server does, and tons as kg", () => {
    expect(shipmentDeclaredFigures({ pcs: "1,200", totalWeightTons: "2.345", totalVolumeCbm: "14.5" })).toEqual({ packages: "1200", grossWeight: "2345", volume: "14.5", kgDecimals: 1 });
  });
  it("leaves what the shipment doesn't declare empty", () => {
    expect(shipmentDeclaredFigures({ pcs: null, totalWeightTons: "", totalVolumeCbm: null })).toEqual({ packages: "", grossWeight: "", volume: "", kgDecimals: 1 });
  });
  it("checks a container-less shipment's lines as a container's", () => {
    const line = { pieces: "1200", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "2", packageType: "", stackable: "" };
    expect(checkConsistency(shipmentDeclaredFigures({ pcs: "1,200", totalWeightTons: "2.4", totalVolumeCbm: "1.2" }), [line]).matched).toBe(true);
  });
  it("checks the weight to the 0.1 kg Total Weight is stored to: 7 × 13.25 kg agrees with 0.0928 t (council finding X10)", () => {
    const line = { pieces: "7", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "13.25", packageType: "", stackable: "" };
    const check = checkConsistency(shipmentDeclaredFigures({ pcs: "7", totalWeightTons: "0.0928", totalVolumeCbm: "0.007" }), [line]);
    expect(check.kg).toMatchObject({ ok: true, decimals: 1 });
    expect(check.matched).toBe(true);
    // A container's own Gross Weight is still checked to 2 decimals: 92.75 kg is not its 92.8 kg (no tolerance on weight, R19).
    const c = { containerNumber: "", sealNumber: "", type: "", teu: "", packages: "7", packageType: "", grossWeight: "92.8", volume: "0.007" };
    expect(checkConsistency(c, [line]).kg).toMatchObject({ ok: false, decimals: 2 });
  });
  // Review: rounded as the server rounds what an acceptance stores (Math.round of x · 10ⁿ), not as the
  // browser formats - 3 × 1.15 kg is 3.4499… kg, stored 3.5; 56×125×72.5 cm is 0.5075 m³, stored 0.507.
  it("rounds the lines' totals as the server stored them, so the pills stay green right after an Accept", () => {
    const parcels = { pieces: "3", lengthCm: "10", widthCm: "10", heightCm: "10", weightPerPcKg: "1.15", packageType: "", stackable: "" };
    const kg = checkConsistency(shipmentDeclaredFigures({ pcs: "3", totalWeightTons: "0.0035", totalVolumeCbm: "0.003" }), [parcels]).kg;
    expect(kg).toMatchObject({ ok: true });
    expect(fmtFixed(kg.sum, kg.decimals)).toBe("3.5");
    const crate = { pieces: "1", lengthCm: "56", widthCm: "125", heightCm: "72.5", weightPerPcKg: "10", packageType: "", stackable: "" };
    const m3 = checkConsistency(shipmentDeclaredFigures({ pcs: "1", totalWeightTons: "0.0100", totalVolumeCbm: "0.5070" }), [crate]).m3;
    expect(m3).toMatchObject({ ok: true });
    expect(fmtFixed(m3.sum, 3)).toBe("0.507");
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

describe("shipmentWeightKg", () => {
  const line = (pieces: string, weightPerPcKg: string) => ({ pieces, weightPerPcKg }) as CargoDimensionLine;

  it("sums the dimension lines to the hundredth of a kg, as Cargo Details does", () => {
    // 1.235 t in the computed tons column; the lines say 1,234.56 kg.
    expect(shipmentWeightKg({ cargoDimensions: [line("2", "617.28")], totalWeightTons: "9" })).toBeCloseTo(1234.56, 6);
  });

  it("falls back to the typed tons when the lines carry no weight", () => {
    expect(shipmentWeightKg({ cargoDimensions: [line("3", "")], totalWeightTons: "1.2345" })).toBe(1234.5);
    expect(shipmentWeightKg({ cargoDimensions: null, totalWeightTons: "4,2" })).toBe(4200);
    expect(shipmentWeightKg({ totalWeightTons: "0" })).toBe(0);
  });

  it("is null with neither", () => {
    expect(shipmentWeightKg({ cargoDimensions: [], totalWeightTons: "" })).toBeNull();
    expect(shipmentWeightKg({ totalWeightTons: null })).toBeNull();
  });
});

describe("isDangerousShipment", () => {
  const line = { containerId: null, pieces: "1", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "", volumePerPcM3: "" };

  it("is marked so on the shipment, or told by a cargo line's ADR details", () => {
    expect(isDangerousShipment({ dangerous: "Yes" })).toBe(true);
    expect(isDangerousShipment({ dangerous: "", cargoDimensions: [{ ...line, adrUn: "1203" }] })).toBe(true);
  });

  it("is not otherwise", () => {
    expect(isDangerousShipment({ dangerous: "No", cargoDimensions: [line] })).toBe(false);
    expect(isDangerousShipment({ dangerous: "" })).toBe(false);
    expect(isDangerousShipment({})).toBe(false);
  });
});

describe("adrUnText", () => {
  it("shows the UN prefix once, however it was typed, and nothing without a number", () => {
    expect(adrUnText({ adrUn: "2673" })).toBe("UN 2673");
    expect(adrUnText({ adrUn: "un2382" })).toBe("UN 2382");
    expect(adrUnText({ adrUn: "" })).toBe("");
    expect(adrUnText({})).toBe("");
  });
});

describe("cargoContainers", () => {
  type Row = { id?: string; containerNumber: string };
  const box: Row = { id: "c1", containerNumber: "ACLU9821217" };
  const unsaved: Row = { containerNumber: "not saved yet" };
  it("are a sea job's saved containers", () => {
    expect(cargoContainers({ freightMode: "Sea Freight", containers: [box, unsaved] })).toEqual([box]);
    expect(cargoContainers({ freightMode: "Sea Freight", containers: null })).toEqual([]);
  });

  it("are none on an air job, whatever container rows it carries", () => {
    expect(cargoContainers({ freightMode: "Air Freight", containers: [box] })).toEqual([]);
    expect(cargoContainers({ freightMode: " air freight", containers: [box] })).toEqual([]);
  });
});

// Review: a UN number or class typed as blanks is no ADR detail - read as the server reads it
// (apps/api …/lib/remeasureAccept carriesAdr), so Accept remeasurement asks for a by-hand update
// on the page only when the server would.
describe("hasAdr", () => {
  const line = (over: Partial<CargoDimensionLine> = {}): CargoDimensionLine =>
    ({ containerId: null, pieces: "1", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "", ...over }) as CargoDimensionLine;

  it("is none for blanks in the UN number or class", () => {
    expect(hasAdr(line())).toBe(false);
    expect(hasAdr(line({ adrUn: "  ", adrClass: " \t" }))).toBe(false);
    expect(isDangerousShipment({ dangerous: "No", cargoDimensions: [line({ adrUn: " " })] })).toBe(false);
  });

  it("is any UN number, class, packing group or limited quantity", () => {
    expect(hasAdr(line({ adrUn: " 1203 " }))).toBe(true);
    expect(hasAdr(line({ adrClass: "3" }))).toBe(true);
    expect(hasAdr(line({ adrPackingGroup: "II" }))).toBe(true);
    expect(hasAdr(line({ adrLimitedQuantity: true }))).toBe(true);
  });
});

describe("bookedDeclaredFigures (Booked Dimensions, owner's answer 22 Nov)", () => {
  const line = (over: Partial<CargoDimensionLine>): CargoDimensionLine =>
    ({ containerId: null, pieces: "", lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "", packageType: "", stackable: "", ...over }) as CargoDimensionLine;

  it("is the booked lines' colli, kg and m³, what the Dimensions are checked against", () => {
    const booked = [line({ pieces: "4", lengthCm: "120", widthCm: "80", heightCm: "150", weightPerPcKg: "450" }), line({ pieces: "2", weightPerPcKg: "10", volumePerPcM3: "0.5" })];
    const declared = bookedDeclaredFigures(booked)!;
    expect([declared.packages, declared.grossWeight, declared.volume]).toEqual(["6", "1820", "6.76"]);
    const check = checkConsistency(declared, booked);
    expect(check.matched).toBe(true);
  });

  it("is nothing when no line was booked with colli", () => {
    expect(bookedDeclaredFigures([])).toBeNull();
    expect(bookedDeclaredFigures(undefined)).toBeNull();
    expect(bookedDeclaredFigures([line({ weightPerPcKg: "10" })])).toBeNull();
  });
});

// Review of system-23: one tab of Cargo Details - its pills, its Line value and its dot - counts one set of lines
// against one set of figures, and its dot agrees with its pills.
describe("cargoPanelCheck", () => {
  const dim = (containerId: string | null, pieces: string): CargoDimensionLine =>
    ({ containerId, pieces, lengthCm: "100", widthCm: "100", heightCm: "100", weightPerPcKg: "100", packageType: "", stackable: "" }) as CargoDimensionLine;
  const item = (containerId: string | null, pieces: string, value: string): CargoItemLine => ({
    containerId,
    cargoDescription: "PARTS",
    hsCode: "",
    pieces,
    packageType: "",
    grossWeight: pieces ? String(Number(pieces) * 100) : "",
    commercialInvoiceValue: value,
    currency: "USD",
  });
  const figures = (packages: string, grossWeight: string, volume: string): DeclaredFigures =>
    ({ containerNumber: "", sealNumber: "", type: "", teu: "", packageType: "", packages, grossWeight, volume }) as DeclaredFigures;
  // Two containers, A and B; the tab shown is A's.
  const all = { dims: [dim("A", "2"), dim("B", "3")], items: [item("A", "2", "1000"), item("B", "3", "500")] };
  const panel = { dims: [all.dims[0]!], items: [all.items[0]!] };
  const nothing = figures("", "", "");

  it("holds the tab's own lines against its container", () => {
    const c = cargoPanelCheck({ panel, all, declared: figures("2", "200", "2"), houseBl: null });
    expect([c.check.pcs.sum, c.descCheck.pcs.sum, c.descCheck.kg.sum]).toEqual([2, 2, 200]);
    expect(c.descCiv).toBe(civByCurrency([all.items[0]!]));
    expect(c.matched).toBe(true);
  });

  it("calls the lines of a container that declares nothing a mismatch, as its pills are red", () => {
    expect(cargoPanelCheck({ panel, all, declared: nothing, houseBl: null }).matched).toBe(false);
  });

  it("sums every line, of every container, under each pill against a House B/L - the Line value too", () => {
    const c = cargoPanelCheck({ panel, all, declared: figures("2", "200", "2"), houseBl: figures("5", "500", "5") });
    expect([c.check.pcs.sum, c.check.pcs.declared, c.descCheck.pcs.sum, c.descCheck.kg.sum]).toEqual([5, 5, 5, 500]);
    expect(c.descCiv).toBe(civByCurrency(all.items));
    expect(c.descCiv).not.toBe(civByCurrency(panel.items));
    expect(c.matched).toBe(true);
  });

  it("shows no dot while the House B/L declares nothing (no B/L read), as its pills are grey", () => {
    expect(cargoPanelCheck({ panel, all, declared: figures("2", "200", "2"), houseBl: nothing }).matched).toBeNull();
  });

  it("counts only the figures the House B/L declares, as only those pills are coloured", () => {
    expect(cargoPanelCheck({ panel, all, declared: nothing, houseBl: figures("5", "", "") }).matched).toBe(true);
    expect(cargoPanelCheck({ panel, all, declared: nothing, houseBl: figures("4", "", "") }).matched).toBe(false);
  });

  it("shows no dot for a tab with no line of its own", () => {
    const blankDim = { ...dim("A", ""), lengthCm: "", widthCm: "", heightCm: "", weightPerPcKg: "" };
    const blankItem = { ...item("A", "", ""), cargoDescription: "" };
    expect(cargoItemIsEmpty(blankItem)).toBe(true);
    expect(cargoPanelCheck({ panel: { dims: [blankDim], items: [blankItem] }, all, declared: figures("2", "200", "2"), houseBl: null }).matched).toBeNull();
  });
});
