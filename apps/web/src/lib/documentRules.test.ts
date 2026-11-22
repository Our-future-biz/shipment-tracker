import { describe, expect, it } from "vitest";
import { OWN_UPLOAD_REFUSAL, ownUploadApprovalRefusal } from "./documentRules";

const eva = { id: "u-eva", email: "eva@firma.cz", role: "user" };

describe("ownUploadApprovalRefusal", () => {
  it("keeps a regular user from approving a document they uploaded themselves, told by their user id", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: "u-eva", uploadedByName: "Eva Malá" }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    expect(OWN_UPLOAD_REFUSAL).toBe("You uploaded this document: a colleague or a manager approves it");
  });

  // Mock test S19-175: the uploader came by name ("TEST MT3 User") and was compared with the e-mail, so
  // the user's own upload still offered Approve.
  it("goes by the id, not the name the document shows", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: "u-eva", uploadedByName: "TEST MT3 User" }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    // A colleague who happens to be called by the user's e-mail is still a colleague.
    expect(ownUploadApprovalRefusal({ uploadedById: "u-jan", uploadedByName: "eva@firma.cz" }, eva)).toBeNull();
  });

  it("lets them approve a colleague's document", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: "u-jan", uploadedByName: "Jan Novák" }, eva)).toBeNull();
  });

  it("lets a manager, an admin and a superadmin approve their own upload", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(ownUploadApprovalRefusal({ uploadedById: "u-eva", uploadedByName: "Eva Malá" }, { ...eva, role })).toBeNull();
  });

  it("offers the button when the uploader can't be told: the server decides", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: null, uploadedByName: "Unknown" }, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedById: "", uploadedByName: "" }, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedById: "u-eva" }, { ...eva, id: "" })).toBeNull();
    expect(ownUploadApprovalRefusal({}, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedByName: "" }, { email: "", role: "user" })).toBeNull();
  });

  it("falls back to the e-mail only for an older answer without the id, in any letter case", () => {
    expect(ownUploadApprovalRefusal({ uploadedByName: "eva@firma.cz" }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    expect(ownUploadApprovalRefusal({ uploadedByName: " EVA@firma.cz " }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    expect(ownUploadApprovalRefusal({ uploadedByName: "jan@firma.cz" }, eva)).toBeNull();
    // With the id there, the name is never taken for the e-mail.
    expect(ownUploadApprovalRefusal({ uploadedById: null, uploadedByName: "eva@firma.cz" }, eva)).toBeNull();
  });

  it("refuses nobody who isn't signed in: nothing is offered to them anyway", () => {
    expect(ownUploadApprovalRefusal({ uploadedById: "u-eva", uploadedByName: "Eva Malá" }, null)).toBeNull();
  });
});
