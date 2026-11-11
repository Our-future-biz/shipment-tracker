import { describe, expect, it } from "vitest";
import { userActionRefusals } from "./userRules";

const admin = { id: "A", role: "admin" };
const manager = { id: "M", role: "manager" };
const superadmin = { id: "S", role: "superadmin" };
const user = { id: "U", role: "user" };

describe("userActionRefusals", () => {
  it("lets an admin change and deactivate anyone of the company but themselves, and change roles", () => {
    expect(userActionRefusals(admin, user)).toEqual({ edit: null, editRole: null, deactivate: null });
    expect(userActionRefusals(admin, { id: "M2", role: "manager" })).toEqual({ edit: null, editRole: null, deactivate: null });
    expect(userActionRefusals(admin, { id: "a", role: "admin" })).toEqual({
      edit: null,
      editRole: "You cannot change your own role",
      deactivate: "You can't deactivate yourself",
    });
  });

  it("lets a manager change and deactivate standard users only, never their role", () => {
    expect(userActionRefusals(manager, user)).toEqual({ edit: null, editRole: "Only admins can change roles", deactivate: null });
    for (const target of [admin, { id: "M2", role: "manager" }]) {
      const refusals = userActionRefusals(manager, target);
      expect(refusals.edit).toBe("Managers can only change standard users");
      expect(refusals.deactivate).toBe("Managers can only change standard users");
    }
  });

  it("keeps a superadmin's account to superadmins", () => {
    expect(userActionRefusals(admin, superadmin).deactivate).toBe("Only a superadmin can change a superadmin's account");
    expect(userActionRefusals(superadmin, { id: "S2", role: "superadmin" }).deactivate).toBeNull();
  });
});
