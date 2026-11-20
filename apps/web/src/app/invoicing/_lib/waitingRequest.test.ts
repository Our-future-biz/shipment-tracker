import { describe, expect, it } from "vitest";
import { blockingChangeOn, waitingOn, waitingRequestReason } from "./waitingRequest";

describe("waitingRequestReason", () => {
  it("names the request that waits and when it was asked, on Prague's clock, as the server does", () => {
    expect(waitingRequestReason("credit", "2026-11-20T08:13:00Z")).toBe(
      "A partial credit note for this invoice is waiting for approval (asked 20.11.2026 09:13): wait for it or take it back",
    );
    expect(waitingRequestReason("change", "2026-11-20T08:13:00Z")).toBe(
      "A change of this invoice is waiting for approval (asked 20.11.2026 09:13): wait for it or take it back",
    );
  });
});

describe("waitingOn", () => {
  const rows = [
    { id: "a", invoiceId: "inv1", status: "rejected" },
    { id: "b", invoiceId: "inv1", status: "pending" },
    { id: "c", invoiceId: "inv2", status: "pending" },
  ];

  it("finds the request still waiting on that invoice only", () => {
    expect(waitingOn(rows, "inv1")?.id).toBe("b");
    expect(waitingOn(rows, "inv3")).toBeNull();
    expect(waitingOn(undefined, "inv1")).toBeNull();
  });
});

// Review 4, Minor 5: the credit-note dialog greys out only for what the server refuses.
describe("blockingChangeOn", () => {
  const rows = [
    { id: "today", invoiceId: "inv1", status: "pending", issueDate: "2026-11-20" },
    { id: "yesterday", invoiceId: "inv2", status: "pending", issueDate: "2026-11-19" },
    { id: "answered", invoiceId: "inv3", status: "rejected", issueDate: "2026-11-20" },
  ];

  it("is a change waiting on that invoice of today's issue day only - one of an earlier day has expired", () => {
    expect(blockingChangeOn(rows, "inv1", "2026-11-20")?.id).toBe("today");
    expect(blockingChangeOn(rows, "inv2", "2026-11-20")).toBeNull();
    expect(blockingChangeOn(rows, "inv3", "2026-11-20")).toBeNull();
    expect(blockingChangeOn(undefined, "inv1", "2026-11-20")).toBeNull();
  });
});
