import { describe, expect, it } from "vitest";
import { isTruckingManager, managerOnlyReason } from "./roles";

describe("trucking role gating", () => {
  it("lets managers, admins and superadmins use a manager's control", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(managerOnlyReason({ role }, "block a haulier")).toBe("");
    expect(isTruckingManager({ role: "user" })).toBe(false);
  });

  it("gives everyone else the reason the control is disabled, never a hidden control", () => {
    expect(managerOnlyReason({ role: "user" }, "block or unblock a haulier")).toBe("Only a manager can block or unblock a haulier");
    expect(managerOnlyReason(null, "add a portal user")).toBe("Only a manager can add a portal user");
  });
});
