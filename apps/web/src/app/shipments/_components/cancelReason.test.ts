import { describe, expect, it } from "vitest";
import { CANCELLED_STATUS } from "@/lib/enums";
import { CANCEL_REASON_MAX, asksCancelReason, cancelOffered, cancelReasonOk, cancelUpdate, isCancelled, offeredStatuses } from "./cancelReason";

// Council Outlay 11, D22: cancelling a shipment asks why, and sends the reason with the status.
describe("cancelling a shipment", () => {
  it("asks why when the status is set to Cancelled Shipment on a job that was not cancelled", () => {
    expect(asksCancelReason("status", CANCELLED_STATUS, "Billing [IMP]")).toBe(true);
    expect(asksCancelReason("status", CANCELLED_STATUS, "")).toBe(true);
    expect(asksCancelReason("status", CANCELLED_STATUS, null)).toBe(true);
  });

  it("asks nothing for another status, another field, or a job already cancelled", () => {
    expect(asksCancelReason("status", "Billing [IMP]", CANCELLED_STATUS)).toBe(false);
    expect(asksCancelReason("status", CANCELLED_STATUS, CANCELLED_STATUS)).toBe(false);
    expect(asksCancelReason("freeComments", CANCELLED_STATUS, "Billing [IMP]")).toBe(false);
  });

  it("needs a reason besides spaces, within the server's length", () => {
    expect(cancelReasonOk("  ")).toBe(false);
    expect(cancelReasonOk("Customer cancelled the order")).toBe(true);
    expect(cancelReasonOk("x".repeat(CANCEL_REASON_MAX))).toBe(true);
    expect(cancelReasonOk("x".repeat(CANCEL_REASON_MAX + 1))).toBe(false);
  });

  it("sends the status and the reason, trimmed, in one write", () => {
    expect(cancelUpdate("  Customer cancelled \n")).toEqual({ status: CANCELLED_STATUS, cancelReason: "Customer cancelled" });
  });

  it("knows a cancelled job", () => {
    expect(isCancelled(CANCELLED_STATUS)).toBe(true);
    expect(isCancelled("Billed [EXP]")).toBe(false);
    expect(isCancelled(undefined)).toBe(false);
  });
});

// Mock test council n34: a user is not offered what the server refuses.
describe("Cancelled Shipment on an invoiced job", () => {
  it("is offered to a manager, an admin and a superadmin, and to a user only while the job does not read Invoiced", () => {
    for (const role of ["manager", "admin", "superadmin"]) expect(cancelOffered(role, "Invoiced")).toBe(true);
    expect(cancelOffered("user", "Invoiced")).toBe(false);
    expect(cancelOffered("user", " invoiced ")).toBe(false);
    expect(cancelOffered("user", "Not Invoiced")).toBe(true);
    expect(cancelOffered(undefined, "")).toBe(true);
  });

  it("is left out of the statuses, unless the job already is cancelled", () => {
    const options = ["Booked [EXP]", CANCELLED_STATUS];
    expect(offeredStatuses(options, false, "Booked [EXP]")).toEqual(["Booked [EXP]"]);
    expect(offeredStatuses(options, false, CANCELLED_STATUS)).toEqual(options);
    expect(offeredStatuses(options, true, "Booked [EXP]")).toEqual(options);
  });
});
