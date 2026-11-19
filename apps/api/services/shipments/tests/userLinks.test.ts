import { describe, expect, it, vi } from "vitest";

vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { CANCEL_REASON_REFUSAL, cancelReasonRefusal } from "../lib/fieldDefaults";
import { USER_ID_COLUMNS, backfilledId, linkedUser, mayNameUser, planUserLinks } from "../lib/userLinks";

// Step 6 (Council Outlay 11): Handled By and Holiday Cover linked to their users by id, and the
// reason a cancelled job must give (D22). The writes are tests/services/shipment.service.test.ts.

const JAN = { id: "u-jan", email: "jan@firma.cz", displayName: "Jan Novák" };
const EVA = { id: "u-eva", email: "eva@firma.cz", displayName: "Eva Malá" };
const USERS = [JAN, EVA];

describe("the user a person field names", () => {
  it("is the active user of its e-mail, an old value with a name after it too, in any case", () => {
    expect(linkedUser("jan@firma.cz", USERS)).toBe(JAN);
    expect(linkedUser(" JAN@Firma.cz ", USERS)).toBe(JAN);
    expect(linkedUser("eva@firma.cz — Eva Malá", USERS)).toBe(EVA);
  });

  it("is nobody for an empty field, an old free-typed name, or an e-mail of nobody active", () => {
    for (const value of ["", "  ", "Jan Novák", "left@firma.cz", null, undefined]) expect(linkedUser(value, USERS)).toBeNull();
  });

  it("could be somebody only for an e-mail", () => {
    expect(mayNameUser("left@firma.cz")).toBe(true);
    expect(mayNameUser("eva@firma.cz — Eva Malá")).toBe(true);
    expect(mayNameUser("Lukáš")).toBe(false);
    expect(mayNameUser("")).toBe(false);
  });

  it("keeps its id in a column only the server writes", () => {
    expect([...USER_ID_COLUMNS].sort()).toEqual(["holidayCoverUserId", "personInChargeUserId"]);
  });
});

describe("the backfill of the ids", () => {
  it("gives a user's id, none for an empty field, and leaves the id alone for a value that names nobody active", () => {
    expect(backfilledId("JAN@firma.cz", USERS)).toBe("u-jan");
    expect(backfilledId("", USERS)).toBeNull();
    expect(backfilledId("  ", USERS)).toBeNull();
    // Somebody who has left keeps the id a write set while they were a user; an old name has none to keep.
    expect(backfilledId("left@firma.cz", USERS)).toBeUndefined();
    expect(backfilledId("Jan Novák", USERS)).toBeUndefined();
  });

  it("plans one write per stored value that has an id to give, the value exactly as stored", () => {
    expect(
      planUserLinks(
        [
          { field: "personInCharge", value: "jan@firma.cz" },
          { field: "personInCharge", value: "left@firma.cz" },
          { field: "personInCharge", value: "" },
          { field: "holidayCover", value: "Eva@Firma.cz" },
          { field: "holidayCover", value: "Petr" },
        ],
        USERS,
      ),
    ).toEqual([
      { field: "personInCharge", value: "jan@firma.cz", userId: "u-jan" },
      { field: "personInCharge", value: "", userId: null },
      { field: "holidayCover", value: "Eva@Firma.cz", userId: "u-eva" },
    ]);
    expect(planUserLinks([], USERS)).toEqual([]);
  });
});

describe("the reason of a cancellation (D22)", () => {
  it("is asked of the write that cancels a job that was not cancelled", () => {
    expect(cancelReasonRefusal("Booking Confirmation Pending [IMP]", "Cancelled Shipment", undefined)).toBe(CANCEL_REASON_REFUSAL);
    expect(cancelReasonRefusal("", " Cancelled Shipment ", "   ")).toBe("Say why the shipment is cancelled");
    expect(cancelReasonRefusal(null, "Cancelled Shipment", 42)).toBe(CANCEL_REASON_REFUSAL);
    expect(cancelReasonRefusal("Billing [IMP]", "Cancelled Shipment", "Customer cancelled")).toBeNull();
  });

  it("is not asked of a job already cancelled, of one un-cancelled, or of any other status", () => {
    expect(cancelReasonRefusal("Cancelled Shipment", "Cancelled Shipment", undefined)).toBeNull();
    expect(cancelReasonRefusal("Cancelled Shipment", "Booking Confirmation Pending [IMP]", undefined)).toBeNull();
    expect(cancelReasonRefusal("Booking Confirmation Pending [IMP]", "Billing [IMP]", undefined)).toBeNull();
  });
});
