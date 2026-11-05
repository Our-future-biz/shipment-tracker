import { describe, expect, it } from "vitest";
import { isSupplierOnly, shownStatus, supplierInUse, supplierOffered, supplierStatusValue } from "./supplierStatus";

describe("the status a company shows", () => {
  it("is the stored status for a customer, also one that is a supplier too", () => {
    expect(shownStatus({ status: "Prospect", roles: ["customer"] })).toBe("Prospect");
    expect(shownStatus({ status: "Active", roles: ["haulier", "customer"] })).toBe("Active");
    expect(shownStatus({ status: "Inactive", roles: ["customer"] })).toBe("Inactive");
  });

  it("is Waiting for approval for a new supplier a manager has not approved yet", () => {
    expect(shownStatus({ status: "Prospect", roles: ["shipping_line"], approvalStatus: "pending" })).toBe("Waiting for approval");
    expect(shownStatus({ status: "Prospect", roles: ["shipping_line"], approvalStatus: "" })).toBe("In use");
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

describe("a supplier offered for picking", () => {
  const haulier = { status: "Active" as const, roles: ["haulier" as const] };
  it("is one in use and approved, on a quote or elsewhere", () => {
    expect(supplierOffered(haulier, "", true)).toBe(true);
    expect(supplierOffered(haulier, "", false)).toBe(true);
    expect(supplierOffered({ ...haulier, status: "Inactive" }, "", true)).toBe(false);
  });
  it("is one waiting for a manager only on a quote, whose sending waits for it too; a declined one never", () => {
    expect(supplierOffered(haulier, "pending", true)).toBe(true);
    expect(supplierOffered(haulier, "pending", false)).toBe(false);
    expect(supplierOffered(haulier, "declined", true)).toBe(false);
    expect(supplierOffered(haulier, "declined", false)).toBe(false);
  });
});
