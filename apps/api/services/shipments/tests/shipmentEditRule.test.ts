import { describe, expect, it } from "vitest";
import { approvedByLockRefusal, creditCheckLockRefusal, isDetailsManager, isOpenToPerson, touchesDetails } from "../lib/shipmentEditRule";

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

describe("Approved By once the credit check is approved", () => {
  const STAMP = "eva@firma.cz — 7. 11. 2026 10:47:35";
  const approved = { creditCheck: "Green", approvedBy: STAMP };

  it("can't be deleted or replaced by a user", () => {
    expect(approvedByLockRefusal(approved, { approvedBy: "" }, "user")).toContain("only a manager");
    expect(approvedByLockRefusal(approved, { approvedBy: "  " }, "user")).toContain("only a manager");
    expect(approvedByLockRefusal(approved, { approvedBy: null }, "user")).toContain("only a manager");
    expect(approvedByLockRefusal(approved, { approvedBy: "jan@firma.cz" }, "user")).toContain("only a manager");
  });

  it("can by a manager, an admin and a superadmin", () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      expect(approvedByLockRefusal(approved, { approvedBy: "" }, role)).toBeNull();
      expect(approvedByLockRefusal(approved, { approvedBy: "jan@firma.cz" }, role)).toBeNull();
    }
  });

  it("isn't touched by an edit of something else, or the same person sent again", () => {
    expect(approvedByLockRefusal(approved, {}, "user")).toBeNull();
    expect(approvedByLockRefusal(approved, { approvedBy: STAMP }, "user")).toBeNull();
    expect(approvedByLockRefusal(approved, { approvedBy: " EVA@firma.cz " }, "user")).toBeNull();
  });

  it("stays open to a user while the credit check isn't approved, or nobody is named", () => {
    expect(approvedByLockRefusal({ creditCheck: "Red", approvedBy: STAMP }, { approvedBy: "" }, "user")).toBeNull();
    expect(approvedByLockRefusal({ creditCheck: "", approvedBy: STAMP }, { approvedBy: "" }, "user")).toBeNull();
    expect(approvedByLockRefusal({ creditCheck: "Green", approvedBy: " " }, { approvedBy: "jan@firma.cz" }, "user")).toBeNull();
  });

  it("reads the credit check however it was written", () => {
    expect(approvedByLockRefusal({ creditCheck: " green ", approvedBy: STAMP }, { approvedBy: "" }, "user")).toContain("only a manager");
  });
});

describe("the credit check once it is approved", () => {
  const approved = { creditCheck: "Green" };

  it("can't be taken back by a user", () => {
    for (const next of ["Red", "Yellow", "", " ", null]) {
      expect(creditCheckLockRefusal(approved, { creditCheck: next }, "user")).toContain("only a manager");
    }
  });

  it("can by a manager, an admin and a superadmin", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(creditCheckLockRefusal(approved, { creditCheck: "Red" }, role)).toBeNull();
  });

  it("isn't touched by an edit of something else, or Green sent again", () => {
    expect(creditCheckLockRefusal(approved, {}, "user")).toBeNull();
    expect(creditCheckLockRefusal(approved, { creditCheck: "Green" }, "user")).toBeNull();
    expect(creditCheckLockRefusal(approved, { creditCheck: " green " }, "user")).toBeNull();
  });

  it("stays open to a user until it is approved, approving included", () => {
    expect(creditCheckLockRefusal({ creditCheck: "Red" }, { creditCheck: "Green" }, "user")).toBeNull();
    expect(creditCheckLockRefusal({ creditCheck: "Red" }, { creditCheck: "Yellow" }, "user")).toBeNull();
    expect(creditCheckLockRefusal({ creditCheck: "" }, { creditCheck: "Red" }, "user")).toBeNull();
  });
});
