import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import type { Actor } from "../../../../lib/rbac";
import { permissionsService } from "../../services/permissions.service";

const actor = (role: string): Actor => ({ userID: "user-1", companyID: "company-1", role });

describe("get", () => {
  it("tells a manager, an admin and a superadmin that they manage Sales and may change its shared settings", () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      expect(permissionsService.get(actor(role)), role).toEqual({ canManageSales: true, canEditTerms: true, canEditCompanyDetails: true });
    }
  });

  it("tells a plain user - and a role nobody knows - that they may not", () => {
    for (const role of ["user", "", "Admin"]) {
      expect(permissionsService.get(actor(role)), role).toEqual({ canManageSales: false, canEditTerms: false, canEditCompanyDetails: false });
    }
  });
});

describe("requireSettingsEditor", () => {
  it("lets through who may change the shared settings", () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      expect(() => permissionsService.requireSettingsEditor(actor(role)), role).not.toThrow();
    }
  });

  it("refuses everybody else, in words for the user", () => {
    for (const role of ["user", "", "Admin"]) {
      expect(() => permissionsService.requireSettingsEditor(actor(role)), role).toThrowError(
        expect.objectContaining({ code: "permission_denied", message: "only managers and admins can change this" }),
      );
    }
  });

  it("refuses exactly those the flags are false for: a screen never offers what the API would refuse", () => {
    for (const role of ["superadmin", "admin", "manager", "user", "guest"]) {
      const { canEditTerms, canEditCompanyDetails } = permissionsService.get(actor(role));
      let refused = false;
      try {
        permissionsService.requireSettingsEditor(actor(role));
      } catch {
        refused = true;
      }
      expect([canEditTerms, canEditCompanyDetails], role).toEqual([!refused, !refused]);
    }
  });
});
