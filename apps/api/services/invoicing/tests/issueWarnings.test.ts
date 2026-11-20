import { describe, expect, it } from "vitest";
import { customerIssueWarnings, customerReferenceHint, dutyVatWarning } from "../lib/issueWarnings";
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
// Mock council R2: the invoice's "Your ref." is the Customer Reference only; without one, a hint before issuing.
describe("customerReferenceHint", () => {
  it("hints when the job has no Customer Reference, and says nothing when it has one", () => {
    expect(customerReferenceHint("")).toMatch(/no Customer Reference: the invoice prints no "Your ref."/);
    expect(customerReferenceHint("  ")).toMatch(/Personal Reference stays internal/);
    expect(customerReferenceHint(null)).not.toBeNull();
    expect(customerReferenceHint("PO-4711")).toBeNull();
  });
});

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

// Mock council R3: duty and VAT we pay by the Import Instructions, and an invoice without them.
describe("dutyVatWarning", () => {
  const freight = { category: "ocean_freight", description: "Ocean freight" };

  it("warns when we pay the duty and the invoice has no duty or VAT line", () => {
    expect(dutyVatWarning("us", [freight])).toMatch(/no duty or VAT line/);
  });

  it("says nothing once a duty or VAT line is on it, by code or by its text", () => {
    expect(dutyVatWarning("us", [freight, { category: "duty_advancement", description: "Advance" }])).toBeNull();
    expect(dutyVatWarning("us", [freight, { category: "", description: "Import duty 4.5 %" }])).toBeNull();
    expect(dutyVatWarning("us", [freight, { category: "", description: "Clo a DPH" }])).toBeNull();
    expect(dutyVatWarning("us", [freight, { category: "", description: "Import VAT" }])).toBeNull();
  });

  it("says nothing when the customer pays from its own account or no approved form says", () => {
    expect(dutyVatWarning("own_account", [freight])).toBeNull();
    expect(dutyVatWarning("", [freight])).toBeNull();
  });

  it("knows the import VAT by its name, in Czech too", () => {
    expect(dutyVatWarning("us", [freight, { category: "", description: "DPH z dovozu" }])).toBeNull();
    expect(dutyVatWarning("us", [freight, { category: "", description: "Cla" }])).toBeNull();
    expect(dutyVatWarning("us", [freight, { category: "", description: "Customs duties" }])).toBeNull();
  });

  // System-21 mock council review: VAT is on every invoice - a line naming it alone is no duty or import VAT.
  it("does not take a bare VAT or DPH for a duty line", () => {
    for (const description of ["Ocean freight incl. VAT", "VAT", "DPH 21 %", "Doprava vč. DPH"]) {
      expect(dutyVatWarning("us", [freight, { category: "", description }])).toMatch(/no duty or VAT line/);
    }
  });

  it("does not take a word that only contains duty or clo for a duty line", () => {
    expect(dutyVatWarning("us", [{ category: "", description: "Closing fee" }, { category: "", description: "Dutyfree handling" }])).toMatch(/no duty or VAT line/);
  });
});
