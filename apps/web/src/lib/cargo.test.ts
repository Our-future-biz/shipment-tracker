import { describe, expect, it } from "vitest";
import { CONTAINER_TYPES, containerType, NOT_STACKABLE, numberInput, STACKABLE, shipmentStackability, withShipmentStackability } from "./cargo";
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
