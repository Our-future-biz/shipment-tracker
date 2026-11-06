import { describe, expect, it } from "vitest";
import { isDetailsManager, isOpenToPerson, touchesDetails } from "../lib/shipmentEditRule";

const EVA = "eva@firma.cz";

describe("who may change a shipment's details", () => {
  it("always a manager, an admin and a superadmin, never just a user by role", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(isDetailsManager(role)).toBe(true);
    expect(isDetailsManager("user")).toBe(false);
  });

  it("at user level its Person in Charge and its Holiday Cover", () => {
    expect(isOpenToPerson({ personInCharge: EVA, holidayCover: "" }, EVA)).toBe(true);
    expect(isOpenToPerson({ personInCharge: "jan@firma.cz", holidayCover: EVA }, EVA)).toBe(true);
    expect(isOpenToPerson({ personInCharge: "jan@firma.cz", holidayCover: "ana@firma.cz" }, EVA)).toBe(false);
    expect(isOpenToPerson({ personInCharge: "jan@firma.cz", holidayCover: "" }, EVA)).toBe(false);
  });

  it("reads a person however the value is written", () => {
    expect(isOpenToPerson({ personInCharge: " EVA@firma.cz " }, EVA)).toBe(true);
    expect(isOpenToPerson({ personInCharge: "eva@firma.cz — Eva Nová" }, " Eva@Firma.cz ")).toBe(true);
  });

  it("is open to anyone while nobody is named", () => {
    for (const people of [{}, { personInCharge: "", holidayCover: "" }, { personInCharge: null, holidayCover: " " }]) {
      expect(isOpenToPerson(people, EVA)).toBe(true);
    }
  });

  it("does not take an unknown user for a named one", () => {
    expect(isOpenToPerson({ personInCharge: EVA }, "")).toBe(false);
  });
});

describe("touchesDetails", () => {
  it("leaves the departments' own fields open", () => {
    for (const data of [{ customsStatus: "x", mrn: "1", customsOffice: "o" }, { warehouseReceivedDate: "2026-11-06", plateNumber: "1AB" }, { invoicingStatus: "Billing" }, { commercialInvoices: [] }]) {
      expect(touchesDetails(data)).toBe(false);
    }
  });

  it("catches anything else, also next to a department's field", () => {
    for (const data of [{ customer: "Alza" }, { containers: [] }, { cargoDimensions: [] }, { cargoItems: [] }, { personInCharge: "a@b.cz" }, { mrn: "1", vessel: "x" }]) {
      expect(touchesDetails(data)).toBe(true);
    }
  });

  it("ignores what wasn't sent", () => {
    expect(touchesDetails({ vessel: undefined })).toBe(false);
    expect(touchesDetails({})).toBe(false);
  });
});
