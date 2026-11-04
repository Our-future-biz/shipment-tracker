import { describe, expect, it } from "vitest";
import { isSupplierOnly, shownStatus, supplierInUse, supplierStatusValue } from "./supplierStatus";

describe("the status a company shows", () => {
  it("is the stored status for a customer, also one that is a supplier too", () => {
    expect(shownStatus({ status: "Prospect", roles: ["customer"] })).toBe("Prospect");
    expect(shownStatus({ status: "Active", roles: ["haulier", "customer"] })).toBe("Active");
    expect(shownStatus({ status: "Inactive", roles: ["customer"] })).toBe("Inactive");
  });

  it("is In use or Not in use for a supplier only: never Prospect", () => {
    expect(shownStatus({ status: "Prospect", roles: ["shipping_line"] })).toBe("In use");
    expect(shownStatus({ status: "Active", roles: ["haulier", "first_last_mile_haulier"] })).toBe("In use");
    expect(shownStatus({ status: "Inactive", roles: ["rail_operator"] })).toBe("Not in use");
  });

  it("knows a supplier only by the missing customer role", () => {
    expect(isSupplierOnly(["co_loader"])).toBe(true);
    expect(isSupplierOnly(["co_loader", "customer"])).toBe(false);
  });

  it("selects In use for a stored Prospect, without changing it", () => {
    expect(supplierStatusValue("Prospect")).toBe("Active");
    expect(supplierStatusValue("Active")).toBe("Active");
    expect(supplierStatusValue("Inactive")).toBe("Inactive");
  });

  it("is Not in use only for a supplier only stored Inactive: a customer's Inactive leaves it in use as a supplier (A-2)", () => {
    expect(supplierInUse({ status: "Inactive", roles: ["haulier"] })).toBe(false);
    expect(supplierInUse({ status: "Inactive", roles: ["haulier", "customer"] })).toBe(true);
    expect(supplierInUse({ status: "Prospect", roles: ["shipping_line"] })).toBe(true);
    expect(supplierInUse({ status: "Active", roles: ["rail_operator"] })).toBe(true);
  });
});
