import { describe, expect, it } from "vitest";
import { canDeleteCustomerRecords } from "./customerPermissions";

describe("canDeleteCustomerRecords", () => {
  it("lets superadmins only delete customers, contacts and addresses", () => {
    expect(canDeleteCustomerRecords({ role: "superadmin" })).toBe(true);
    for (const role of ["admin", "manager", "user"]) expect(canDeleteCustomerRecords({ role })).toBe(false);
    expect(canDeleteCustomerRecords(null)).toBe(false);
    expect(canDeleteCustomerRecords(undefined)).toBe(false);
  });
});
