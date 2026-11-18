import { describe, expect, it } from "vitest";
import { OWN_UPLOAD_REFUSAL, canManageDocuments, documentReviewRefusal, ownUploadApprovalRefusal } from "../lib/documentRules";

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

describe("ownUploadApprovalRefusal", () => {
  const mine = { uploadedById: "u1" };

  it("refuses a regular user approving a document they uploaded themselves", () => {
    expect(ownUploadApprovalRefusal(mine, "approved", "u1", "user")).toBe(OWN_UPLOAD_REFUSAL);
    expect(OWN_UPLOAD_REFUSAL).toBe("You uploaded this document: a colleague or a manager approves it");
  });

  it("leaves declining one's own upload, and putting it back to pending, allowed", () => {
    expect(ownUploadApprovalRefusal(mine, "declined", "u1", "user")).toBeNull();
    expect(ownUploadApprovalRefusal(mine, "", "u1", "user")).toBeNull();
  });

  it("lets a colleague approve it, and a manager, an admin and a superadmin their own", () => {
    expect(ownUploadApprovalRefusal(mine, "approved", "u2", "user")).toBeNull();
    for (const role of ["manager", "admin", "superadmin"]) expect(ownUploadApprovalRefusal(mine, "approved", "u1", role)).toBeNull();
  });

  it("holds nobody to a document with no uploader on record", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: null }, "approved", "u1", "user")).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedById: "" }, "approved", "", "user")).toBeNull();
  });
});
