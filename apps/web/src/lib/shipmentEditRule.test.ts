import { describe, expect, it } from "vitest";
import { canChangeShipmentDetails, canChangeShipmentField, isApprovedByLocked, isCreditCheckLocked } from "./shipmentEditRule";

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

describe("Approved By once the credit check is approved", () => {
  const approved = { creditCheck: "Green", approvedBy: "eva@firma.cz — 7. 11. 2026 10:47:35" };
  const as = (role: string) => ({ role, email: "x@firma.cz" });

  it("is closed to a user", () => {
    expect(isApprovedByLocked(as("user"), approved)).toBe(true);
    expect(isApprovedByLocked(null, approved)).toBe(true);
  });

  it("stays open to a manager, an admin and a superadmin", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(isApprovedByLocked(as(role), approved)).toBe(false);
  });

  it("stays open while the credit check isn't approved, or nobody is named", () => {
    expect(isApprovedByLocked(as("user"), { ...approved, creditCheck: "Red" })).toBe(false);
    expect(isApprovedByLocked(as("user"), { ...approved, approvedBy: "" })).toBe(false);
    expect(isApprovedByLocked(as("user"), {})).toBe(false);
  });
});

describe("the credit check once it is approved", () => {
  const as = (role: string) => ({ role, email: "x@firma.cz" });

  it("is closed to a user", () => {
    expect(isCreditCheckLocked(as("user"), { creditCheck: "Green" })).toBe(true);
    expect(isCreditCheckLocked(as("user"), { creditCheck: " green " })).toBe(true);
  });

  it("stays open to a manager, an admin and a superadmin", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(isCreditCheckLocked(as(role), { creditCheck: "Green" })).toBe(false);
  });

  it("stays open to a user until it is approved", () => {
    for (const creditCheck of ["Red", "Yellow", "", null]) expect(isCreditCheckLocked(as("user"), { creditCheck })).toBe(false);
  });
});
