import { describe, expect, it } from "vitest";
import {
  CLOSED_COMMENT,
  ONLY_MANAGERS_DECIDE,
  OWN_REQUEST,
  RELEASE_KIND,
  RELEASE_PASS_VALID_DAYS,
  RELEASE_WHATS,
  WHAT_OF_KIND,
  alreadyApproved,
  answeredLine,
  approvedReason,
  askedLine,
  canDecideRelease,
  closedLine,
  decideRefusal,
  isReleaseWhat,
  isUsable,
  nothingToRelease,
  passDecidedSince,
  unusedLine,
  validUntil,
} from "../lib/releaseRequest";
import { MIN_OVERRIDE_REASON, overrideLine, passOverride, prepaymentStop } from "../lib/prepaymentStop";

describe("what can be asked for", () => {
  it("is the House BoL's release or Warehouse Released, each the prepayment stop's own kind", () => {
    expect(RELEASE_WHATS).toEqual(["house_bol", "warehouse"]);
    expect(RELEASE_KIND).toEqual({ house_bol: "house_bol", warehouse: "warehouse_released" });
    // And back: the release the stop holds names the request that lets it through.
    for (const what of RELEASE_WHATS) expect(WHAT_OF_KIND[RELEASE_KIND[what]]).toBe(what);
    expect(isReleaseWhat("house_bol")).toBe(true);
    expect(isReleaseWhat("warehouse")).toBe(true);
    for (const other of ["", "warehouse_released", "HOUSE_BOL", "mbl"]) expect(isReleaseWhat(other)).toBe(false);
  });
});

describe("who decides a request", () => {
  const request = { requestedById: "asker" };

  it("is a manager, an admin or a superadmin - whoever the prepayment stop lets release with a reason", () => {
    for (const role of ["manager", "admin", "superadmin"]) {
      expect(canDecideRelease(role)).toBe(true);
      expect(decideRefusal(request, { userID: "other", role })).toBeNull();
      // The stop's own rule: with a reason, this role's release goes through.
      expect(prepaymentStop("house_bol", { prepaymentUnpaid: true, unpaid: [] }, role, "a reason")).toHaveProperty("override");
    }
    expect(canDecideRelease("user")).toBe(false);
    expect(decideRefusal(request, { userID: "other", role: "user" })).toBe(ONLY_MANAGERS_DECIDE);
    expect(prepaymentStop("house_bol", { prepaymentUnpaid: true, unpaid: [] }, "user", "a reason")).toHaveProperty("refusal");
  });

  it("is never the one who asked, a manager neither (four eyes)", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(decideRefusal(request, { userID: "asker", role })).toBe(OWN_REQUEST);
    expect(OWN_REQUEST).toBe("You asked for this release yourself: another manager decides it");
  });
});

describe("nothingToRelease", () => {
  const held = { houseBolRelease: "", warehouseReleasedDate: null, warehouseReceivedDate: "2026-11-10" };

  it("lets a release be asked for while it is not made", () => {
    expect(nothingToRelease(held, "house_bol")).toBeNull();
    expect(nothingToRelease(held, "warehouse")).toBeNull();
  });

  it("refuses a House BoL already released, naming who released it", () => {
    expect(nothingToRelease({ ...held, houseBolRelease: "eva@firma.cz — 18. 11. 2026 9:15:00" }, "house_bol")).toBe("The House BoL was already released (eva@firma.cz — 18. 11. 2026 9:15:00)");
    // The House BoL's release says nothing about the warehouse's.
    expect(nothingToRelease({ ...held, houseBolRelease: "eva@firma.cz — 18. 11. 2026 9:15:00" }, "warehouse")).toBeNull();
  });

  it("refuses Warehouse Released already set, and cargo never received: no manager's reason gets past that", () => {
    expect(nothingToRelease({ ...held, warehouseReleasedDate: "2026-11-17" }, "warehouse")).toBe("Warehouse Released is already set (2026-11-17)");
    expect(nothingToRelease({ ...held, warehouseReceivedDate: null }, "warehouse")).toBe("The cargo was not received in the warehouse yet: fill in Warehouse Received first");
    expect(nothingToRelease({ ...held, warehouseReceivedDate: null }, "house_bol")).toBeNull();
  });
});

describe("the reason the release is recorded with", () => {
  const request = { requestedByName: "Jan Novák", reason: " customer pays on Friday " };

  it("says who asked and why, who approved and why", () => {
    expect(approvedReason(request, "Eva Malá", " agreed with the owner ")).toBe("Asked by Jan Novák: customer pays on Friday — approved by Eva Malá: agreed with the owner");
  });

  it("stands without a comment and without names, and is always long enough for the stop", () => {
    expect(approvedReason(request, "Eva Malá", "")).toBe("Asked by Jan Novák: customer pays on Friday — approved by Eva Malá");
    const bare = approvedReason({ requestedByName: "", reason: "abc" }, "", "");
    expect(bare).toBe("Asked by a user: abc — approved by a manager");
    expect(bare.length).toBeGreaterThanOrEqual(MIN_OVERRIDE_REASON);
    expect(prepaymentStop("house_bol", { prepaymentUnpaid: true, unpaid: [] }, "manager", bare)).toEqual({ override: { reason: bare, invoices: [], checked: true } });
  });
});

describe("an approved request as a pass", () => {
  const decidedAt = new Date("2026-11-18T10:00:00Z");
  const approved = { status: "approved", decidedAt, usedAt: null };
  const at = (days: number, ms = 0) => new Date(decidedAt.getTime() + days * 86_400_000 + ms);

  it("is good for 7 days from the manager's decision", () => {
    expect(RELEASE_PASS_VALID_DAYS).toBe(7);
    expect(validUntil(approved)).toEqual(new Date("2026-11-25T10:00:00Z"));
    expect(isUsable(approved, decidedAt)).toBe(true);
    expect(isUsable(approved, at(6))).toBe(true);
    expect(isUsable(approved, at(7))).toBe(true);
    expect(isUsable(approved, at(7, 1))).toBe(false);
    expect(isUsable(approved, at(30))).toBe(false);
  });

  it("is used once", () => {
    expect(isUsable({ ...approved, usedAt: at(1) }, at(2))).toBe(false);
  });

  it("is only an approved request: one waiting, rejected or closed lets nothing through and has no validity", () => {
    for (const status of ["pending", "rejected", "closed"]) {
      expect(validUntil({ status, decidedAt })).toBeNull();
      expect(isUsable({ status, decidedAt, usedAt: null }, at(1))).toBe(false);
    }
    expect(validUntil({ status: "approved", decidedAt: null })).toBeNull();
  });

  it("is over once it is closed unused - the job was released another way - though it keeps who approved it and when", () => {
    const voided = { status: "closed", decidedAt, usedAt: null };
    expect(isUsable(voided, at(1))).toBe(false);
    expect(validUntil(voided)).toBeNull();
  });

  it("is read and used by the same bound: decided no longer ago than it is good for", () => {
    const now = at(7);
    expect(passDecidedSince(now)).toEqual(decidedAt);
    // A decision at exactly the bound is still in; a millisecond older is out - as isUsable says.
    expect(decidedAt.getTime() >= passDecidedSince(at(7)).getTime()).toBe(true);
    expect(decidedAt.getTime() >= passDecidedSince(at(7, 1)).getTime()).toBe(false);
  });

  it("tells whoever asks again to release now, with the day it runs out on Prague's calendar", () => {
    expect(alreadyApproved(new Date("2026-11-25T10:00:00Z"))).toBe("A release was already approved for this job: release it now (valid until 25.11.)");
    // 23:30 UTC is already the next day in Prague.
    expect(alreadyApproved(new Date("2026-11-25T23:30:00Z"))).toBe("A release was already approved for this job: release it now (valid until 26.11.)");
  });

  it("lets the release through as the override it is: the reason names who asked and who approved, the invoices are today's", () => {
    const reason = approvedReason({ requestedByName: "Jan Novák", reason: "customer pays on Friday" }, "Eva Malá", "agreed with the owner");
    const refusal = "The House BoL can't be released: …";
    const check = { prepaymentUnpaid: true, unpaid: [{ number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }] };
    const override = passOverride(check, { requestId: "r1", reason }, refusal);
    expect(override).toEqual({ reason, invoices: [{ number: "FV2026-0012", leftToPay: 1200, currency: "EUR" }], checked: true, pass: { requestId: "r1", refusal } });
    expect(overrideLine("house_bol", override)).toBe(
      "House BoL released on prepayment (unpaid: FV2026-0012 (1,200.00 EUR left to pay)) - reason: Asked by Jan Novák: customer pays on Friday — approved by Eva Malá: agreed with the owner",
    );
    // Invoicing could not be asked: recorded as unchecked, as a manager's own override is.
    expect(passOverride(null, { requestId: "r1", reason }, refusal)).toMatchObject({ invoices: [], checked: false });
  });
});

describe("the history lines", () => {
  it("say what was asked and why, and what the answer was", () => {
    expect(askedLine("house_bol", "customer pays on Friday")).toBe("House BoL release asked: customer pays on Friday");
    expect(askedLine("warehouse", "truck is waiting")).toBe("Warehouse Released asked: truck is waiting");
    expect(answeredLine({ what: "house_bol", requestedByName: "Jan Novák" }, true, "agreed with the owner")).toBe("House BoL release approved (asked by Jan Novák): agreed with the owner");
    expect(answeredLine({ what: "warehouse", requestedByName: "Jan Novák" }, false, "not before the payment")).toBe("Warehouse Released rejected (asked by Jan Novák): not before the payment");
    expect(answeredLine({ what: "warehouse", requestedByName: "" }, true, "ok by the owner")).toBe("Warehouse Released approved: ok by the owner");
  });

  it("say when a waiting request was closed by a release made another way", () => {
    expect(closedLine("house_bol")).toBe("House BoL release request closed: released without it");
    expect(closedLine("warehouse")).toBe("Warehouse Released request closed: released without it");
    // An approval nobody used, closed the same way, says so in its own words.
    expect(unusedLine("house_bol")).toBe("House BoL release approval closed unused: released without it");
    expect(unusedLine("warehouse")).toBe("Warehouse Released approval closed unused: released without it");
    expect(CLOSED_COMMENT).toBe("Released without it");
  });
});
