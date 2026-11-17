import { describe, expect, it } from "vitest";
import { quoteDeleteOffer } from "./quoteDelete";

const base = { canChangeOwner: "own" as const, canApproveMargin: false };

describe("quoteDeleteOffer", () => {
  it("offers Delete quote when the server would delete the quote", () => {
    expect(quoteDeleteOffer({ ...base, canDelete: true })).toBe("offer");
  });

  it("shows why nobody may delete a quote that went to the customer, or is on its way there - not a confirmation that is then refused", () => {
    const reason = "the quote is Quoted - it went to the customer and stays for the reports; mark it Lost instead, or revise it";
    expect(quoteDeleteOffer({ ...base, canDelete: false, deleteBlockedReason: reason, deleteBlockedBy: "status" })).toEqual({ reason });
  });

  it("shows why nobody may delete the revision of a Replaced quote, or a quote a shipment carries", () => {
    const revision = "it is the revision that replaced QCZ20261111002 - deleted, it would leave QCZ20261111002 Replaced for good; mark it Lost instead, or keep working on it";
    expect(quoteDeleteOffer({ ...base, canDelete: false, deleteBlockedReason: revision, deleteBlockedBy: "status" })).toEqual({ reason: revision });
    const shipment = "shipment CZ00000101 was created from this quote - remove the Sales Reference from the shipment first";
    expect(quoteDeleteOffer({ ...base, canDelete: false, deleteBlockedReason: shipment, deleteBlockedBy: "shipment" })).toEqual({ reason: shipment });
  });

  it("offers nothing to a user who may not delete the quote for want of a role", () => {
    expect(quoteDeleteOffer({ ...base, canDelete: false, deleteBlockedReason: "only a manager can delete this quote", deleteBlockedBy: "role" })).toBe("hide");
    expect(quoteDeleteOffer({ ...base, canDelete: false })).toBe("hide");
  });
});
