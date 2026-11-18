import { describe, expect, it } from "vitest";
import { OWN_UPLOAD_REFUSAL, ownUploadApprovalRefusal } from "./documentRules";

const eva = { email: "eva@firma.cz", role: "user" };

describe("ownUploadApprovalRefusal", () => {
  it("keeps a regular user from approving a document they uploaded themselves, in any letter case", () => {
    expect(ownUploadApprovalRefusal({ uploadedByName: "eva@firma.cz" }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    expect(ownUploadApprovalRefusal({ uploadedByName: " EVA@firma.cz " }, eva)).toBe(OWN_UPLOAD_REFUSAL);
    expect(OWN_UPLOAD_REFUSAL).toBe("You uploaded this document: a colleague or a manager approves it");
  });

  it("lets them approve a colleague's document", () => {
    expect(ownUploadApprovalRefusal({ uploadedByName: "jan@firma.cz" }, eva)).toBeNull();
  });

  it("lets a manager, an admin and a superadmin approve their own upload", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(ownUploadApprovalRefusal({ uploadedByName: "eva@firma.cz" }, { ...eva, role })).toBeNull();
  });

  it("offers the button when the uploader can't be told: the server decides", () => {
    expect(ownUploadApprovalRefusal({ uploadedByName: "Unknown" }, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedByName: "" }, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({}, eva)).toBeNull();
    expect(ownUploadApprovalRefusal({ uploadedByName: "" }, { email: "", role: "user" })).toBeNull();
  });

  it("refuses nobody who isn't signed in: nothing is offered to them anyway", () => {
    expect(ownUploadApprovalRefusal({ uploadedByName: "eva@firma.cz" }, null)).toBeNull();
  });
});
