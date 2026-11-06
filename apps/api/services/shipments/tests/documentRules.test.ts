import { describe, expect, it } from "vitest";
import { canManageDocuments, documentReviewRefusal } from "../lib/documentRules";

describe("canManageDocuments", () => {
  it("is a manager, an admin or a superadmin, not a user", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(canManageDocuments(role)).toBe(true);
    expect(canManageDocuments("user")).toBe(false);
  });
});

describe("documentReviewRefusal", () => {
  it("refuses a user taking back an approval", () => {
    expect(documentReviewRefusal("approved", "", "user")).toContain("manager's approval");
    expect(documentReviewRefusal("approved", "declined", "user")).toContain("manager's approval");
  });

  it("lets a user review what isn't approved, and change a decline", () => {
    for (const [current, next] of [["", "approved"], ["", "declined"], ["declined", ""], ["declined", "approved"], ["approved", "approved"]]) {
      expect(documentReviewRefusal(current!, next!, "user")).toBeNull();
    }
  });

  it("does not hold a manager to it", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(documentReviewRefusal("approved", "", role)).toBeNull();
  });
});
