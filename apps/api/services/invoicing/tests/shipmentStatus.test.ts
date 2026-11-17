import { describe, expect, it } from "vitest";
import { chargesInvoiced, invoicedRefusal, isBillingStatus, statusesAfterCredit, statusesAfterIssue } from "../lib/shipmentStatus";

const ALL = { invoiced: 3, total: 3 };
const SOME = { invoiced: 2, total: 3 };
const NONE = { invoiced: 0, total: 3 };

describe("chargesInvoiced", () => {
  it("is true only when the job has charges and every one is on an open invoice", () => {
    expect(chargesInvoiced(ALL)).toBe(true);
    expect(chargesInvoiced(SOME)).toBe(false);
    expect(chargesInvoiced(NONE)).toBe(false);
    expect(chargesInvoiced({ invoiced: 0, total: 0 })).toBe(false);
  });
});

describe("invoicedRefusal", () => {
  it("lets a fully invoiced job be marked Invoiced", () => {
    expect(invoicedRefusal(ALL)).toBeNull();
  });

  it("says how many charges are invoiced when some are left", () => {
    expect(invoicedRefusal(SOME)).toBe("Not all charges are invoiced: 2 of 3 selling lines are on an invoice. Invoice the rest first");
  });

  it("refuses a job with no charges at all", () => {
    expect(invoicedRefusal({ invoiced: 0, total: 0 })).toMatch(/no charges to invoice/);
  });
});

describe("statusesAfterIssue", () => {
  it("marks the job invoiced and moves Billing to Billed once the last charge is invoiced, keeping the direction", () => {
    expect(statusesAfterIssue({ status: "Billing [IMP]", invoicingStatus: "Not Invoiced" }, ALL)).toEqual({
      invoicingStatus: "Invoiced",
      status: "Billed [IMP]",
    });
    expect(statusesAfterIssue({ status: "Billing [EXP]", invoicingStatus: "" }, ALL).status).toBe("Billed [EXP]");
  });

  it("changes nothing while a charge is left to bill: the job stays Not Invoiced and in Billing", () => {
    expect(statusesAfterIssue({ status: "Billing [IMP]", invoicingStatus: "Not Invoiced" }, SOME)).toEqual({});
  });

  it("leaves any other shipment status alone", () => {
    expect(statusesAfterIssue({ status: "Customs Clearance Pending [IMP]", invoicingStatus: "Not Invoiced" }, ALL)).toEqual({ invoicingStatus: "Invoiced" });
    expect(statusesAfterIssue({ status: "Billed [IMP]", invoicingStatus: "Invoiced" }, ALL)).toEqual({});
  });
});

describe("statusesAfterCredit", () => {
  it("puts the job back to bill when no charge is invoiced any more", () => {
    expect(statusesAfterCredit({ status: "Billed [EXP]", invoicingStatus: "Invoiced" }, NONE)).toEqual({
      invoicingStatus: "Not Invoiced",
      status: "Billing [EXP]",
    });
  });

  it("puts the job back to bill when another invoice is still open but a charge is no longer invoiced", () => {
    expect(statusesAfterCredit({ status: "Billed [EXP]", invoicingStatus: "Invoiced" }, SOME)).toEqual({
      invoicingStatus: "Not Invoiced",
      status: "Billing [EXP]",
    });
  });

  it("changes nothing while all the charges are still on an open invoice", () => {
    expect(statusesAfterCredit({ status: "Billed [EXP]", invoicingStatus: "Invoiced" }, ALL)).toEqual({});
  });

  it("does not touch a status the job has moved on to", () => {
    expect(statusesAfterCredit({ status: "Cancelled Shipment", invoicingStatus: "Invoiced" }, NONE)).toEqual({ invoicingStatus: "Not Invoiced" });
  });
});

describe("isBillingStatus", () => {
  it("recognises Billing in either direction only", () => {
    expect(isBillingStatus("Billing [IMP]")).toBe(true);
    expect(isBillingStatus("Billing [EXP]")).toBe(true);
    expect(isBillingStatus("Billed [IMP]")).toBe(false);
    expect(isBillingStatus("")).toBe(false);
    expect(isBillingStatus(null)).toBe(false);
  });
});

describe("a domestic road job", () => {
  it("moves Billing [DOM] to Billed [DOM] on issue and back on a credit note", () => {
    expect(statusesAfterIssue({ status: "Billing [DOM]", invoicingStatus: "Not Invoiced" }, ALL).status).toBe("Billed [DOM]");
    expect(statusesAfterCredit({ status: "Billed [DOM]", invoicingStatus: "Invoiced" }, NONE).status).toBe("Billing [DOM]");
  });
});
