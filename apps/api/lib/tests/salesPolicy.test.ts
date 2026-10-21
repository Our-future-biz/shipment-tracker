import { describe, expect, it } from "vitest";
import { SALES_MANAGE_ROLES, canApproveMargin, canEditSalesSettings, canManageSales, canSetOwner, ownerChangeRight, quoteDeletePermission, shipmentLinkRefusal } from "../salesPolicy";

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
  // Every status a row can store: the seven a quote is set to, an 'expired' the old bulk menu
  // left behind, and a text this code does not know.
  const STATUSES = ["draft", "ready_to_send", "quoted", "feedback", "revised", "won", "lost", "expired", "on hold"];
  const OWNERS = [ME, COLLEAGUE, null];
  const EVER_SENT = [false, true];
  const LINKS = [UNLINKED, LINKED];

  const blockedByShipment = {
    allowed: false,
    reason: `shipment ${JOB} was created from this quote - remove the Sales Reference from the shipment first`,
    blockedBy: "shipment",
  };
  const managersOnly = { allowed: false, reason: "only a manager can delete this quote", blockedBy: "role" };
  const allowed = { allowed: true };

  /** A quote of mine that was never sent and has no shipment; `over` makes it another one. */
  const quote = (over: Partial<Parameters<typeof quoteDeletePermission>[1]> = {}) => ({
    status: "draft",
    ownerUserId: ME as string | null,
    everSent: false,
    ...UNLINKED,
    ...over,
  });

  it("answers the whole matrix: 4 roles x 9 stored statuses x mine / a colleague's / nobody's x never sent / sent x no shipment / shipment", () => {
    let cases = 0;
    for (const role of ROLES) {
      for (const status of STATUSES) {
        for (const ownerUserId of OWNERS) {
          for (const everSent of EVER_SENT) {
            for (const link of LINKS) {
              cases++;
              // The rule, restated: a shipment stops everybody; otherwise a manager may, and a
              // plain user only on their own Draft that was never sent.
              const expected = link.shipmentId
                ? blockedByShipment
                : role !== "user" || (status === "draft" && ownerUserId === ME && !everSent)
                  ? allowed
                  : managersOnly;
              expect(
                quoteDeletePermission(actor(role), { status, ownerUserId, everSent, ...link }),
                `${role} / ${status} / owner ${ownerUserId} / sent ${everSent} / linked ${link.shipmentId !== null}`,
              ).toEqual(expected);
            }
          }
        }
      }
    }
    expect(cases).toBe(4 * 9 * 3 * 2 * 2);
  });

  describe("a plain user", () => {
    it("may delete their own Draft that was never sent", () => {
      expect(quoteDeletePermission(actor("user"), quote())).toEqual(allowed);
    });

    it("may not delete a colleague's Draft", () => {
      expect(quoteDeletePermission(actor("user"), quote({ ownerUserId: COLLEAGUE }))).toEqual(managersOnly);
    });

    it("may not delete a Draft that belongs to no user - not before taking it", () => {
      expect(quoteDeletePermission(actor("user"), quote({ ownerUserId: null }))).toEqual(managersOnly);
    });

    it("may not delete their own Quoted quote", () => {
      expect(quoteDeletePermission(actor("user"), quote({ status: "quoted", everSent: true }))).toEqual(managersOnly);
    });

    it("may not delete their own Draft that was sent once and reopened (Lost -> Draft): the customer holds that quotation", () => {
      expect(quoteDeletePermission(actor("user"), quote({ status: "draft", everSent: true }))).toEqual(managersOnly);
    });

    it("may not delete their own Draft that was Quoted without a sent date and reopened through Lost: no date says it went out, its history does", () => {
      // What the policy is handed for such a quote: its lifecycle facts, the first sent date
      // empty, and the answer of the lifecycle rules (wasEverSent) that it went out all the same.
      const reopened = { ...quote({ status: "draft", everSent: true }), firstSentAt: null };
      expect(quoteDeletePermission(actor("user"), reopened)).toEqual(managersOnly);
      expect(quoteDeletePermission(actor("manager"), reopened)).toEqual(allowed);
    });

    it("may not delete their own quote in any other status, sent or not", () => {
      for (const status of STATUSES.filter((s) => s !== "draft")) {
        expect(quoteDeletePermission(actor("user"), quote({ status })), status).toEqual(managersOnly);
      }
    });

    it("is judged on the stored status as it is written: only 'draft' is a Draft", () => {
      for (const status of ["Draft", "draft ", "", "drafts"]) {
        expect(quoteDeletePermission(actor("user"), quote({ status })), `"${status}"`).toEqual(managersOnly);
      }
    });
  });

  it("lets a manager delete any quote that has no shipment - whoever owns it, whatever its status, sent or not", () => {
    for (const role of ["superadmin", "admin", "manager"]) {
      expect(quoteDeletePermission(actor(role), quote({ status: "won", ownerUserId: COLLEAGUE, everSent: true })), role).toEqual(allowed);
      expect(quoteDeletePermission(actor(role), quote({ status: "quoted", ownerUserId: null, everSent: true })), role).toEqual(allowed);
    }
  });

  it("lets nobody delete a quote a shipment is linked to, and names the shipment - also the owner of a never-sent Draft", () => {
    for (const role of ROLES) {
      expect(quoteDeletePermission(actor(role), quote(LINKED)), role).toEqual(blockedByShipment);
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
      expect(quoteDeletePermission(actor(role), quote({ status: "quoted" })), role).toEqual(managersOnly);
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

describe("shipmentLinkRefusal", () => {
  it("lets only a Won quote link", () => {
    expect(shipmentLinkRefusal("won")).toBeNull();
  });

  it("refuses every other status, named as the screens name it", () => {
    expect(shipmentLinkRefusal("draft")).toBe("the quote is Draft - only a Won quote can be linked to a shipment");
    expect(shipmentLinkRefusal("ready_to_send")).toBe("the quote is Ready to Send - only a Won quote can be linked to a shipment");
    for (const status of ["quoted", "feedback", "revised", "lost", "expired"]) expect(shipmentLinkRefusal(status)).toMatch(/^the quote is [A-Z]/);
  });

  it("refuses a status it does not know, a name of Object.prototype too", () => {
    expect(shipmentLinkRefusal("on_hold")).toBe('the quote is "on_hold" - only a Won quote can be linked to a shipment');
    expect(shipmentLinkRefusal("toString")).toBe('the quote is "toString" - only a Won quote can be linked to a shipment');
  });
});
