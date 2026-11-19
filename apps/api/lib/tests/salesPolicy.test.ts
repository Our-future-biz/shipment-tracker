import { describe, expect, it } from "vitest";
import { SALES_MANAGE_ROLES, canApproveMargin, canDecideQuoteInquiry, canManageSupplierTerms, canRateSupplier, canEditSalesSettings, canManageSales, canSetOwner, ownerChangeRight, quoteCostCopyRefusal, quoteDeletePermission, shipmentFromQuoteBlocked, shipmentFromQuoteRefusal, shipmentLinkRefusal } from "../salesPolicy";

const ME = "user-me";
const COLLEAGUE = "user-colleague";
const THIRD = "user-third";

const actor = (role: string) => ({ userID: ME, role });

const mine = { ownerUserId: ME };
const colleagues = { ownerUserId: COLLEAGUE };
const nobodys = { ownerUserId: null };

describe("canManageSales", () => {
  it("is true for superadmin, admin and manager only", () => {
    expect(SALES_MANAGE_ROLES).toEqual(["superadmin", "admin", "manager"]);
    expect(canManageSales("superadmin")).toBe(true);
    expect(canManageSales("admin")).toBe(true);
    expect(canManageSales("manager")).toBe(true);
    expect(canManageSales("user")).toBe(false);
  });

  it("treats a role it does not know as a plain user", () => {
    expect(canManageSales("")).toBe(false);
    expect(canManageSales("Admin")).toBe(false);
    expect(canManageSales("owner")).toBe(false);
  });
});

describe("canEditSalesSettings", () => {
  it("lets exactly the roles that manage Sales change the shared settings", () => {
    for (const role of ["superadmin", "admin", "manager", "user", "", "Admin", "owner"]) {
      expect(canEditSalesSettings(role), role).toBe(canManageSales(role));
    }
    expect(canEditSalesSettings("manager")).toBe(true);
    expect(canEditSalesSettings("user")).toBe(false);
  });
});

describe("canApproveMargin", () => {
  it("lets exactly the roles that manage Sales approve a margin below the floor", () => {
    for (const role of ["superadmin", "admin", "manager", "user", "", "Admin", "owner"]) {
      expect(canApproveMargin(role), role).toBe(canManageSales(role));
    }
    expect(canApproveMargin("manager")).toBe(true);
    expect(canApproveMargin("user")).toBe(false);
  });
});

describe("canRateSupplier", () => {
  it("lets the roles that manage Sales rate a supplier, and nobody else", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canRateSupplier(role), role).toBe(true);
    for (const role of ["user", "", "Manager", "owner"]) expect(canRateSupplier(role), role).toBe(false);
  });
});

describe("canManageSupplierTerms", () => {
  it("lets the roles that manage Sales change a supplier's terms and VAT / bank details, and nobody else", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canManageSupplierTerms(role), role).toBe(true);
    for (const role of ["user", "", "Manager"]) expect(canManageSupplierTerms(role), role).toBe(false);
  });
});

describe("canDecideQuoteInquiry", () => {
  it("lets the supervisor roles answer a quote inquiry, and nobody else", () => {
    for (const role of ["superadmin", "admin", "manager"]) expect(canDecideQuoteInquiry(role), role).toBe(true);
    for (const role of ["user", "", "Manager", "owner"]) expect(canDecideQuoteInquiry(role), role).toBe(false);
  });
});

describe("ownerChangeRight", () => {
  it("lets a manager reassign any quote", () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      for (const quote of [mine, colleagues, nobodys]) {
        expect(ownerChangeRight(actor(role), quote), `${role} ${quote.ownerUserId}`).toBe("any");
      }
    }
  });

  it("lets a plain user hand over their own quote", () => {
    expect(ownerChangeRight(actor("user"), mine)).toBe("own");
  });

  it("lets a plain user take a quote that belongs to no user", () => {
    expect(ownerChangeRight(actor("user"), nobodys)).toBe("claim");
  });

  it("gives a plain user no say over a colleague's quote", () => {
    expect(ownerChangeRight(actor("user"), colleagues)).toBe("none");
  });
});

describe("canSetOwner", () => {
  // Rows: whose quote it is. Columns: the new owner - me, a colleague, a third user, nobody.
  const targets = [ME, COLLEAGUE, THIRD, null];
  const answers = (role: string, quote: { ownerUserId: string | null }) =>
    targets.map((target) => canSetOwner(actor(role), quote, target));

  it("lets a manager set any owner, or none, on any quote", () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      for (const quote of [mine, colleagues, nobodys]) {
        expect(answers(role, quote), `${role} ${quote.ownerUserId}`).toEqual([true, true, true, true]);
      }
    }
  });

  it("lets a plain user hand their own quote to anybody, or give it up", () => {
    expect(answers("user", mine)).toEqual([true, true, true, true]);
  });

  it("lets a plain user take an unowned quote for themselves - and do nothing else with it", () => {
    expect(answers("user", nobodys)).toEqual([true, false, false, false]);
  });

  it("refuses a plain user everything on a colleague's quote, taking it for themselves included", () => {
    expect(answers("user", colleagues)).toEqual([false, false, false, false]);
  });

  it("treats a role it does not know as a plain user", () => {
    expect(answers("guest", colleagues)).toEqual([false, false, false, false]);
    expect(answers("", nobodys)).toEqual([true, false, false, false]);
  });
});

describe("quoteDeletePermission", () => {
  const JOB = "CZ2610001";
  const LINKED = { shipmentId: "5f0c1c5e-3a0d-4d0e-9a39-7c2a4b1d9e10", shipmentJobNumber: JOB };
  const UNLINKED = { shipmentId: null, shipmentJobNumber: null };

  const ROLES = ["superadmin", "admin", "manager", "user"];
  // Every status a quote can be shown with: the seven it is set to, Expired, Replaced, and a
  // text this code does not know.
  const STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost", "expired", "replaced", "on hold"];
  const OWNERS = [ME, COLLEAGUE, null];
  const EVER_SENT = [false, true];
  const LINKS = [UNLINKED, LINKED];
  const REPLACES = [null, "QCZ20261111002"];

  const blockedByShipment = {
    allowed: false,
    reason: `shipment ${JOB} was created from this quote - remove the Sales Reference from the shipment first`,
    blockedBy: "shipment",
  };
  const managersOnly = { allowed: false, reason: "only a manager can delete this quote", blockedBy: "role" };
  const allowed = { allowed: true };
  const sentBefore = { allowed: false, reason: "the quote went to the customer before and stays for the reports; mark it Lost instead", blockedBy: "status" };

  /** A Draft of mine that was never sent and has no shipment; `over` makes it another one. */
  const quote = (over: Partial<Parameters<typeof quoteDeletePermission>[1]> = {}) => ({
    status: "draft",
    ownerUserId: ME as string | null,
    everSent: false,
    ...UNLINKED,
    ...over,
  });

  it("answers the whole matrix: 4 roles x 10 statuses x mine / a colleague's / nobody's x never sent / sent x no shipment / shipment x a revision or not", () => {
    let cases = 0;
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const ownerUserId of OWNERS) {
          for (const everSent of EVER_SENT) {
            for (const link of LINKS) {
              for (const replaces of REPLACES) {
                cases++;
                // The rule, restated: a shipment stops everybody, and so does anything but a Draft
                // that never went out and replaced no quote; such a Draft a manager may delete, a
                // plain user only their own.
                const answer = quoteDeletePermission(actor(role), { status, ownerUserId, everSent, ...link, replaces });
                const label = `${role} / ${status} / owner ${ownerUserId} / sent ${everSent} / linked ${link.shipmentId !== null} / replaces ${replaces}`;
                if (link.shipmentId) expect(answer, label).toEqual(blockedByShipment);
                else if (status !== "draft" || everSent || replaces) expect(answer, label).toMatchObject({ allowed: false, blockedBy: "status" });
                else expect(answer, label).toEqual(role !== "user" || ownerUserId === ME ? allowed : managersOnly);
              }
            }
          }
        }
      }
    }
    expect(cases).toBe(4 * 10 * 3 * 2 * 2 * 2);
  });

  it("lets a plain user delete their own Draft that was never sent, and a manager anybody's", () => {
    expect(quoteDeletePermission(actor("user"), quote())).toEqual(allowed);
    for (const role of ["superadmin", "admin", "manager"]) {
      expect(quoteDeletePermission(actor(role), quote({ ownerUserId: COLLEAGUE })), role).toEqual(allowed);
      expect(quoteDeletePermission(actor(role), quote({ ownerUserId: null })), role).toEqual(allowed);
    }
  });

  it("refuses a plain user a colleague's Draft, and one that belongs to no user - not before taking it", () => {
    expect(quoteDeletePermission(actor("user"), quote({ ownerUserId: COLLEAGUE }))).toEqual(managersOnly);
    expect(quoteDeletePermission(actor("user"), quote({ ownerUserId: null }))).toEqual(managersOnly);
  });

  it("refuses everybody - managers too - a quote from Ready to Send on, and says what to do instead", () => {
    const refusals: Record<string, string> = {
      ready_to_send: "the quote is Ready to Send - only a Draft can be deleted; mark it Lost instead",
      revised: "the quote is Revised - only a Draft can be deleted; mark it Lost instead",
      quoted: "the quote is Quoted - it went to the customer and stays for the reports; mark it Lost instead, or revise it",
      feedback: "the quote is Feedback - it went to the customer and stays for the reports; mark it Lost instead, or revise it",
      expired: "the quote is Expired - it went to the customer and stays for the reports; revise it instead",
      won: "the quote is Won - it stays for the reports; revise it instead",
      lost: "the quote is Lost - it stays for the reports as it is",
      replaced: "the quote is Replaced - it stays for the reports as what the customer was given; work on its revision instead",
    };
    for (const role of ROLES) {
      for (const [status, reason] of Object.entries(refusals)) {
        expect(quoteDeletePermission(actor(role), quote({ status, everSent: status !== "ready_to_send" && status !== "revised" })), `${role} / ${status}`).toEqual({
          allowed: false,
          reason,
          blockedBy: "status",
        });
      }
    }
  });

  it("refuses everybody the original quote a revision replaced, and the revision too - so neither can be deleted after the other", () => {
    // QCZFCL20261111002 was sent and revised: it is Replaced, and its revision -R1 is Revised.
    for (const role of ROLES) {
      expect(quoteDeletePermission(actor(role), quote({ status: "replaced", everSent: true })).allowed, role).toBe(false);
      expect(quoteDeletePermission(actor(role), quote({ status: "revised", replaces: "QCZFCL20261111002" })).allowed, role).toBe(false);
    }
  });

  it("refuses everybody the revision a Replaced quote handed its offer on to, also once it is a Draft again (Revised -> Lost -> Draft), naming that quote once", () => {
    for (const role of ROLES) {
      expect(quoteDeletePermission(actor(role), quote({ replaces: "QCZ20261111002" })), role).toEqual({
        allowed: false,
        reason: "it is the revision that replaced QCZ20261111002 - deleted, it would leave QCZ20261111002 Replaced for good; mark it Lost instead, or keep working on it",
        blockedBy: "status",
      });
    }
  });

  it("refuses everybody the original offer a variant or revision follows on from, even a Draft that never went out, naming the follow-up", () => {
    // QCZFCL20261105003 was copied as -2: the first offer stays as the record of what was offered.
    for (const role of ROLES) {
      for (const ownerUserId of OWNERS) {
        expect(quoteDeletePermission(actor(role), quote({ ownerUserId, followedBy: "QCZFCL20261105003-2" })), `${role} / ${ownerUserId}`).toEqual({
          allowed: false,
          reason: "it is the original offer of QCZFCL20261105003-2 and stays as the record of what was offered; mark it Lost instead",
          blockedBy: "status",
        });
      }
    }
  });

  it("still lets the follow-up itself be deleted while it is a Draft that never went out, and the original once nothing follows on from it", () => {
    expect(quoteDeletePermission(actor("manager"), quote({ followedBy: null }))).toEqual(allowed);
    expect(quoteDeletePermission(actor("user"), quote())).toEqual(allowed);
  });

  it("refuses everybody a Draft that went to the customer before (Lost -> Draft), whether or not a sent date says so", () => {
    for (const role of ROLES) expect(quoteDeletePermission(actor(role), quote({ everSent: true })), role).toEqual(sentBefore);
  });

  it("is judged on the status as written: only 'draft' is a Draft, and a status it does not know is no Draft", () => {
    for (const status of ["Draft", "draft ", "", "drafts", "toString"]) {
      expect(quoteDeletePermission(actor("admin"), quote({ status })), `"${status}"`).toMatchObject({ allowed: false, blockedBy: "status" });
    }
    expect(quoteDeletePermission(actor("admin"), quote({ status: "on hold" }))).toEqual({ allowed: false, reason: 'the quote is "on hold" - only a Draft can be deleted', blockedBy: "status" });
  });

  it("lets nobody delete a quote a shipment is linked to, and names the shipment - also the owner of a never-sent Draft", () => {
    for (const role of ROLES) {
      expect(quoteDeletePermission(actor(role), quote(LINKED)), role).toEqual(blockedByShipment);
      expect(quoteDeletePermission(actor(role), quote({ ...LINKED, status: "won", everSent: true })), role).toEqual(blockedByShipment);
    }
  });

  it("goes by the link itself: a shipment whose job number is not known still stops the delete", () => {
    expect(quoteDeletePermission(actor("admin"), quote({ shipmentId: LINKED.shipmentId, shipmentJobNumber: null }))).toEqual({
      allowed: false,
      reason: "a shipment was created from this quote - remove the Sales Reference from the shipment first",
      blockedBy: "shipment",
    });
    // A job number without a link is a leftover, not a shipment.
    expect(quoteDeletePermission(actor("admin"), quote({ shipmentId: null, shipmentJobNumber: JOB }))).toEqual(allowed);
  });

  it("treats a role it does not know as a plain user", () => {
    for (const role of ["", "Admin", "guest"]) {
      expect(quoteDeletePermission(actor(role), quote()), role).toEqual(allowed);
      expect(quoteDeletePermission(actor(role), quote({ ownerUserId: COLLEAGUE })), role).toEqual(managersOnly);
    }
  });

  it("cannot be walked around through the owner: a plain user can make only an unowned quote their own, never a colleague's", () => {
    const user = actor("user");
    // A colleague's Draft: not deletable, and not takeable either.
    expect(quoteDeletePermission(user, quote({ ownerUserId: COLLEAGUE })).allowed).toBe(false);
    expect(canSetOwner(user, colleagues, ME)).toBe(false);
    // An unowned never-sent Draft: deletable only after "Assign to me", which is allowed.
    expect(quoteDeletePermission(user, quote({ ownerUserId: null })).allowed).toBe(false);
    expect(canSetOwner(user, nobodys, ME)).toBe(true);
    expect(quoteDeletePermission(user, quote({ ownerUserId: ME })).allowed).toBe(true);
  });
});

describe("shipmentFromQuoteBlocked", () => {
  it("says of a waiting customer or supplier that the shipment can be created once it is approved", () => {
    expect(shipmentFromQuoteBlocked("ACME s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved")).toBe(
      "ACME s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the shipment can be created once it is approved",
    );
    expect(shipmentFromQuoteBlocked("The new supplier Trans s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the quote can be sent once it is approved")).toBe(
      "The new supplier Trans s.r.o. waits for a manager's approval (Sales → Managers → Company approval) — the shipment can be created once it is approved",
    );
  });

  it("speaks of the shipment in the other gates' words too, a sentence that starts with them included", () => {
    expect(shipmentFromQuoteBlocked("Pieces of 12.5 t or more are waiting for the warehouse's answer — the quote can be sent once the warehouse approves")).toBe(
      "Pieces of 12.5 t or more are waiting for the warehouse's answer — the shipment can be created once the warehouse approves",
    );
    expect(shipmentFromQuoteBlocked("The margin cannot be worked out: No ČNB rate for EUR on 2026-10-15. The quote can be sent once the rate is available or its lines are in CZK.")).toBe(
      "The margin cannot be worked out: No ČNB rate for EUR on 2026-10-15. The shipment can be created once the rate is available or its lines are in CZK.",
    );
  });

  it("leaves a reason that does not speak of sending as it is", () => {
    expect(shipmentFromQuoteBlocked("Choose a Freight Mode first")).toBe("Choose a Freight Mode first");
  });
});

describe("shipmentLinkRefusal", () => {
  it("lets only a Won quote link", () => {
    expect(shipmentLinkRefusal("won")).toBeNull();
  });

  it("refuses every other status, named as the screens name it", () => {
    expect(shipmentLinkRefusal("draft")).toBe("the quote is Draft - only a Won quote can be linked to a shipment");
    expect(shipmentLinkRefusal("ready_to_send")).toBe("the quote is Ready to Send - only a Won quote can be linked to a shipment");
    expect(shipmentLinkRefusal("expired")).toBe("the quote is Expired - only a Won quote can be linked to a shipment");
    expect(shipmentLinkRefusal("replaced")).toBe("the quote is Replaced - only a Won quote can be linked to a shipment");
    for (const status of ["quoted", "feedback", "revised", "lost"]) expect(shipmentLinkRefusal(status)).toMatch(/^the quote is [A-Z]/);
  });

  it("refuses a status it does not know, a name of Object.prototype too", () => {
    expect(shipmentLinkRefusal("on_hold")).toBe('the quote is "on_hold" - only a Won quote can be linked to a shipment');
    expect(shipmentLinkRefusal("toString")).toBe('the quote is "toString" - only a Won quote can be linked to a shipment');
  });
});

describe("shipmentFromQuoteRefusal", () => {
  it("lets a shipment be created from an open, expired or Won quote", () => {
    for (const status of ["draft", "ready_to_send", "quoted", "feedback", "revised", "expired", "won"]) expect(shipmentFromQuoteRefusal(status)).toBeNull();
  });

  it("refuses a Lost or Replaced quote, named as the screens name it", () => {
    expect(shipmentFromQuoteRefusal("lost")).toBe("the quote is Lost - no shipment can be created from it");
    expect(shipmentFromQuoteRefusal("replaced")).toBe("the quote is Replaced - no shipment can be created from it");
  });
});

describe("quoteCostCopyRefusal", () => {
  it("lets only a Won quote's costs be copied", () => {
    expect(quoteCostCopyRefusal("won")).toBeNull();
    expect(quoteCostCopyRefusal("draft")).toBe("the quote is Draft - only a Won quote's costs can be copied to a shipment");
    expect(quoteCostCopyRefusal("expired")).toBe("the quote is Expired - only a Won quote's costs can be copied to a shipment");
  });
});
