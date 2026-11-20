import { describe, expect, it } from "vitest";
import { customerIssueWarnings } from "../lib/issueWarnings";
import { askedAtText, waitingRequestProblem } from "../lib/waitingRequest";

// User council B6: what the issue dialog warns of about the customer, never a block.
describe("customerIssueWarnings", () => {
  const czech = { dic: "CZ06175953", country: "CZ", status: "Active" };

  it("says nothing for an active customer with a DIČ", () => {
    expect(customerIssueWarnings(czech)).toEqual([]);
  });

  it("warns of a missing DIČ for a Czech or EU customer, or one of a country not known", () => {
    const msg = "The customer has no DIČ in the Customer Database";
    expect(customerIssueWarnings({ ...czech, dic: "" })).toEqual([msg]);
    expect(customerIssueWarnings({ ...czech, dic: "  ", country: "DE" })).toEqual([msg]);
    expect(customerIssueWarnings({ ...czech, dic: "", country: "" })).toEqual([msg]);
  });

  it("does not ask a customer outside the EU for a DIČ: it has none", () => {
    expect(customerIssueWarnings({ ...czech, dic: "", country: "CN" })).toEqual([]);
  });

  it("warns of a missing DIČ and a Prospect at once", () => {
    expect(customerIssueWarnings({ dic: "", country: "CZ", status: "Prospect" })).toEqual([
      "The customer has no DIČ in the Customer Database",
      "The customer is still a Prospect",
    ]);
    expect(customerIssueWarnings({ ...czech, status: "Inactive" })).toEqual([]);
  });

  it("without a customer read, nothing - and never the job's own Credit Check, which every new job starts Red", () => {
    expect(customerIssueWarnings(null)).toEqual([]);
  });
});

// User council B5: one request waits per invoice, and the refusal says which one and since when.
describe("waitingRequestProblem", () => {
  it("writes the moment on Prague's calendar and clock", () => {
    expect(askedAtText(new Date("2026-11-20T08:13:00Z"))).toBe("20.11.2026 09:13");
    // summer time: two hours ahead
    expect(askedAtText(new Date("2026-07-01T22:05:00Z"))).toBe("02.07.2026 00:05");
  });

  it("names the request that waits", () => {
    const at = new Date("2026-11-20T08:13:00Z");
    expect(waitingRequestProblem("credit", at)).toBe("A partial credit note for this invoice is waiting for approval (asked 20.11.2026 09:13): wait for it or take it back");
    expect(waitingRequestProblem("change", at)).toBe("A change of this invoice is waiting for approval (asked 20.11.2026 09:13): wait for it or take it back");
  });
});
