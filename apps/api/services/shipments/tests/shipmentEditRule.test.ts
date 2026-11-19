import { describe, expect, it } from "vitest";
import {
  RELEASED_BEFORE_RECEIVED,
  approvedByLockRefusal,
  blDateRefusal,
  cancelInvoicedRefusal,
  creditCheckLockRefusal,
  followsPartyRenames,
  isInvoicingDepartment,
  isDetailsManager,
  isOpenToPerson,
  leavesInvoicedStatus,
  touchesDetails,
  warehouseReceivedRefusal,
  warehouseReleaseRefusal,
} from "../lib/shipmentEditRule";

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

  it("isn't touched by an edit of something else, or the value sent back as it is", () => {
    expect(approvedByLockRefusal(approved, {}, "user")).toBeNull();
    expect(approvedByLockRefusal(approved, { approvedBy: STAMP }, "user")).toBeNull();
    expect(approvedByLockRefusal(approved, { approvedBy: ` ${STAMP} ` }, "user")).toBeNull();
  });

  it("keeps the approval's date: the same person with another date, or none, is a change", () => {
    expect(approvedByLockRefusal(approved, { approvedBy: "eva@firma.cz — 1. 1. 2026 08:00" }, "user")).toContain("only a manager");
    expect(approvedByLockRefusal(approved, { approvedBy: " EVA@firma.cz " }, "user")).toContain("only a manager");
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

describe("the names an invoiced shipment holds", () => {
  it("stay as they were billed: a rename in the Customer Database skips the shipment, however Invoiced is written", () => {
    for (const status of ["Invoiced", "invoiced", " INVOICED "]) expect(followsPartyRenames(status)).toBe(false);
  });

  it("follow renames as before on a shipment that is not invoiced", () => {
    for (const status of ["", "Not Invoiced", "Ready to Invoice", "Partially Invoiced", null, undefined]) expect(followsPartyRenames(status)).toBe(true);
  });
});

describe("the shipment's Warehouse Received, as the warehouse's received date", () => {
  const TODAY = "2026-11-17";
  const stored = (warehouseReceivedDate: string | null, warehouseReleasedDate: string | null = null) => ({ warehouseReceivedDate, warehouseReleasedDate });

  it("refuses a user a day still to come, also the first time it is set", () => {
    expect(warehouseReceivedRefusal(stored(null), { warehouseReceivedDate: "2026-11-18" }, "user", TODAY)).toBe(
      "Warehouse Received can't be a day still to come: the cargo was received today at the latest",
    );
    expect(warehouseReceivedRefusal(stored(null), { warehouseReceivedDate: TODAY }, "user", TODAY)).toBeNull();
  });

  it("refuses a user moving it later or clearing it, and lets them move it earlier", () => {
    const later = "Only a manager moves Warehouse Received later or clears it: the days in between are storage given away";
    expect(warehouseReceivedRefusal(stored("2026-11-10"), { warehouseReceivedDate: "2026-11-12" }, "user", TODAY)).toBe(later);
    expect(warehouseReceivedRefusal(stored("2026-11-10"), { warehouseReceivedDate: null }, "user", TODAY)).toBe(later);
    expect(warehouseReceivedRefusal(stored("2026-11-10"), { warehouseReceivedDate: "2026-11-09" }, "user", TODAY)).toBeNull();
  });

  it("refuses a user any change once the cargo is released from the warehouse", () => {
    expect(warehouseReceivedRefusal(stored("2026-11-10", "2026-11-12"), { warehouseReceivedDate: "2026-11-09" }, "user", TODAY)).toBe(
      "The cargo was released: only a manager changes Warehouse Received now",
    );
  });

  it("lets a manager, an admin and a superadmin do all of it", () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      expect(warehouseReceivedRefusal(stored("2026-11-10", "2026-11-12"), { warehouseReceivedDate: "2026-12-01" }, role, TODAY)).toBeNull();
      expect(warehouseReceivedRefusal(stored("2026-11-10"), { warehouseReceivedDate: null }, role, TODAY)).toBeNull();
    }
  });

  it("isn't touched by an edit of something else, or the date sent again", () => {
    expect(warehouseReceivedRefusal(stored("2026-11-10", "2026-11-12"), {}, "user", TODAY)).toBeNull();
    expect(warehouseReceivedRefusal(stored("2026-11-10", "2026-11-12"), { warehouseReceivedDate: "2026-11-10" }, "user", TODAY)).toBeNull();
  });
});

describe("the shipment's Warehouse Released", () => {
  it("is refused while Warehouse Received is empty", () => {
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: null, warehouseReleasedDate: null }, { warehouseReleasedDate: "2026-11-12" })).toBe(RELEASED_BEFORE_RECEIVED);
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: "2026-11-10", warehouseReleasedDate: null }, { warehouseReceivedDate: null, warehouseReleasedDate: "2026-11-12" })).toBe(RELEASED_BEFORE_RECEIVED);
  });

  it("is set once the cargo was received, also in the same write", () => {
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: "2026-11-10", warehouseReleasedDate: null }, { warehouseReleasedDate: "2026-11-12" })).toBeNull();
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: null, warehouseReleasedDate: null }, { warehouseReceivedDate: "2026-11-10", warehouseReleasedDate: "2026-11-12" })).toBeNull();
  });

  it("can always be cleared, and a release already stored is not asked about again", () => {
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: null, warehouseReleasedDate: "2026-11-12" }, { warehouseReleasedDate: null })).toBeNull();
    expect(warehouseReleaseRefusal({ warehouseReceivedDate: null, warehouseReleasedDate: "2026-11-12" }, { warehouseReleasedDate: "2026-11-12" })).toBeNull();
  });
});

describe("an Invoicing user (council finding K6)", () => {
  it("sits in a department named Invoicing's", () => {
    for (const name of ["Invoicing", " invoicing CZ ", "Invoices"]) expect(isInvoicingDepartment(name)).toBe(true);
    for (const name of ["Customs", "Sea export", "", null, undefined]) expect(isInvoicingDepartment(name)).toBe(false);
  });
});

describe("cancelling an invoiced job (council finding K22)", () => {
  it("is a manager's, an admin's or a superadmin's", () => {
    expect(cancelInvoicedRefusal("user", true)).toBe("This shipment is invoiced: only a manager can cancel it");
    for (const role of ["manager", "admin", "superadmin"]) expect(cancelInvoicedRefusal(role, true)).toBeNull();
    expect(cancelInvoicedRefusal("user", false)).toBeNull();
  });

  // Mock test council n35: Invoicing Status moved to Not Invoiced first, then the cancel.
  it("knows a write that takes Invoicing Status off Invoiced", () => {
    expect(leavesInvoicedStatus("Invoiced", { invoicingStatus: "Not Invoiced" })).toBe(true);
    expect(leavesInvoicedStatus(" invoiced ", { invoicingStatus: "" })).toBe(true);
    expect(leavesInvoicedStatus("Invoiced", { invoicingStatus: "Invoiced" })).toBe(false);
    expect(leavesInvoicedStatus("Invoiced", {})).toBe(false);
    expect(leavesInvoicedStatus("Billing", { invoicingStatus: "Not Invoiced" })).toBe(false);
  });
});

describe("the B/L dates (council finding m24)", () => {
  it("are never a day after today, a day already stored aside", () => {
    // The day as the screens write it (mock test council n34).
    expect(blDateRefusal("Delivery Order", "2026-11-20", null, "2026-11-19")).toBe("Delivery Order can't be a day still to come: it says when it happened (today is 19.11.2026)");
    expect(blDateRefusal("Delivery Order", "2026-11-19", null, "2026-11-19")).toBeNull();
    expect(blDateRefusal("Delivery Order", "2026-11-20", "2026-11-20", "2026-11-19")).toBeNull();
    expect(blDateRefusal("Delivery Order", "", "2026-11-20", "2026-11-19")).toBeNull();
  });
});
