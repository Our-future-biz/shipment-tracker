import { describe, expect, it } from "vitest";
import { canWithdrawApproval, canWithdrawOwnRequest, releaseClosedNote, releaseRequestsWaitingFor, type ClosableRequest } from "./releaseRequestQueue";

describe("the release requests waiting for a manager's bell (K21)", () => {
  const requests = [
    { status: "pending", requestedById: "u-eva" },
    { status: "pending", requestedById: "u-jan" },
    { status: "pending", requestedById: "U-JAN" },
    { status: "approved", requestedById: "u-petr" },
    { status: "closed", requestedById: "u-petr" },
  ];

  it("leaves out the manager's own requests: another manager answers them", () => {
    expect(releaseRequestsWaitingFor(requests, "u-jan")).toBe(1);
    // Another manager sees them.
    expect(releaseRequestsWaitingFor(requests, "u-eva")).toBe(2);
  });

  it("counts every one waiting when who is signed in is not known, and none of a list not read", () => {
    expect(releaseRequestsWaitingFor(requests, null)).toBe(3);
    expect(releaseRequestsWaitingFor(undefined, "u-jan")).toBe(0);
  });
});

const request = (over: Partial<ClosableRequest> = {}): ClosableRequest => ({
  status: "pending",
  requestedById: "u-jan",
  usedAt: null,
  decidedAt: null,
  comment: "",
  closedAt: null,
  closedWhy: null,
  closedByName: "",
  closeReason: "",
  ...over,
});

describe("who may withdraw (K20)", () => {
  it("a manager: an approval nobody used - not a used one, not a request still waiting", () => {
    expect(canWithdrawApproval(request({ status: "approved" }))).toBe(true);
    expect(canWithdrawApproval(request({ status: "approved", usedAt: "2026-11-18T10:00:00Z" }))).toBe(false);
    expect(canWithdrawApproval(request())).toBe(false);
    expect(canWithdrawApproval(request({ status: "closed" }))).toBe(false);
  });

  it("whoever asked: their request while it waits", () => {
    expect(canWithdrawOwnRequest(request(), "u-jan")).toBe(true);
    expect(canWithdrawOwnRequest(request(), "U-Jan")).toBe(true);
    expect(canWithdrawOwnRequest(request(), "u-eva")).toBe(false);
    expect(canWithdrawOwnRequest(request(), null)).toBe(false);
    expect(canWithdrawOwnRequest(request({ status: "approved" }), "u-jan")).toBe(false);
  });
});

describe("what a closed request says (m19)", () => {
  it("withdrawn: by whom, when and why - an approval with the manager's own reason kept", () => {
    expect(releaseClosedNote(request({ status: "closed", closedWhy: "withdrawn", closedByName: "Jan Novák", closedAt: "2026-11-19T09:00:00Z", closeReason: "Paid meanwhile" }))).toBe(
      "Withdrawn by Jan Novák 19.11. 10:00: Paid meanwhile",
    );
    expect(
      releaseClosedNote(
        request({ status: "closed", decidedAt: "2026-11-18T09:00:00Z", comment: "Agreed with the owner", closedWhy: "withdrawn", closedByName: "Eva Malá", closedAt: "2026-11-19T09:00:00Z", closeReason: "Customer cancelled" }),
      ),
    ).toBe("Approved: Agreed with the owner. Approval withdrawn by Eva Malá 19.11. 10:00: Customer cancelled");
  });

  it("closed by a release made without it - the approval's reason kept, not written over", () => {
    expect(releaseClosedNote(request({ status: "closed", closedWhy: "released" }))).toBe("Closed: released without it");
    expect(releaseClosedNote(request({ status: "closed", closedWhy: "released", decidedAt: "2026-11-18T09:00:00Z", comment: "Agreed with the owner" }))).toBe(
      "Approved: Agreed with the owner. Closed: released without it",
    );
    // An older answer, without the closing's own fields.
    expect(releaseClosedNote(request({ status: "closed", closedWhy: undefined }))).toBe("Closed: released without it");
  });

  it("is nothing for a request that is not closed", () => {
    expect(releaseClosedNote(request({ status: "approved" }))).toBeNull();
  });
});
