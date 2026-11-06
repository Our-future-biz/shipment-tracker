import { describe, expect, it } from "vitest";
import { canChangeShipmentDetails, canChangeShipmentField } from "./shipmentEditRule";

const eva = { role: "user", email: "eva@firma.cz" };
const hers = { personInCharge: "eva@firma.cz", holidayCover: "" };
const theirs = { personInCharge: "jan@firma.cz", holidayCover: "ana@firma.cz" };

describe("canChangeShipmentDetails", () => {
  it("at user level is its Person in Charge and its Holiday Cover", () => {
    expect(canChangeShipmentDetails(eva, hers)).toBe(true);
    expect(canChangeShipmentDetails(eva, { personInCharge: "jan@firma.cz", holidayCover: " EVA@firma.cz " })).toBe(true);
    expect(canChangeShipmentDetails(eva, { personInCharge: "eva@firma.cz — Eva Nová" })).toBe(true);
    expect(canChangeShipmentDetails(eva, theirs)).toBe(false);
  });

  it("is always a manager, an admin and a superadmin", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(canChangeShipmentDetails({ ...eva, role }, theirs)).toBe(true);
  });

  it("is anyone while nobody is named", () => {
    expect(canChangeShipmentDetails(eva, {})).toBe(true);
    expect(canChangeShipmentDetails(eva, { personInCharge: " ", holidayCover: "" })).toBe(true);
  });

  it("is nobody who isn't signed in", () => {
    expect(canChangeShipmentDetails(null, {})).toBe(false);
  });
});

describe("canChangeShipmentField", () => {
  it("leaves the departments' own fields open", () => {
    for (const field of ["customsStatus", "customsOffice", "mrn", "warehouseReceivedDate", "plateNumber", "invoicingStatus"]) {
      expect(canChangeShipmentField(eva, theirs, field)).toBe(true);
    }
  });

  it("holds every other field to the rule", () => {
    expect(canChangeShipmentField(eva, theirs, "vessel")).toBe(false);
    expect(canChangeShipmentField(eva, hers, "vessel")).toBe(true);
  });
});
