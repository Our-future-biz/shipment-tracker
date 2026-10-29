import { describe, expect, it } from "vitest";
import { checkConsistency, compareFigure, dimensionLineIsEmpty, lineInCm, lineInUnit, CONTAINER_TYPES, containerType, NOT_STACKABLE, numberInput, STACKABLE, shipmentStackability, withShipmentStackability } from "./cargo";
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
