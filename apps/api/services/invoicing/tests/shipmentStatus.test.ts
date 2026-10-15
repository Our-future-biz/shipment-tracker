import { describe, expect, it } from "vitest";
import { isBillingStatus, statusesAfterCredit, statusesAfterIssue } from "../lib/shipmentStatus";

describe("statusesAfterIssue", () => {
  it("marks the job invoiced and moves Billing to Billed, keeping the direction", () => {
    expect(statusesAfterIssue({ status: "Billing [IMP]", invoicingStatus: "Not Invoiced" })).toEqual({
      invoicingStatus: "Invoiced",
      status: "Billed [IMP]",
    });
    expect(statusesAfterIssue({ status: "Billing [EXP]", invoicingStatus: "" }).status).toBe("Billed [EXP]");
  });

  it("leaves any other shipment status alone", () => {
    expect(statusesAfterIssue({ status: "Customs Clearance Pending [IMP]", invoicingStatus: "Not Invoiced" })).toEqual({ invoicingStatus: "Invoiced" });
    expect(statusesAfterIssue({ status: "Billed [IMP]", invoicingStatus: "Invoiced" })).toEqual({});
  });
});

describe("statusesAfterCredit", () => {
  it("puts the job back to bill when no open invoice is left", () => {
    expect(statusesAfterCredit({ status: "Billed [EXP]", invoicingStatus: "Invoiced" }, 0)).toEqual({
      invoicingStatus: "Not Invoiced",
      status: "Billing [EXP]",
    });
  });

  it("changes nothing while another invoice of the job is still open", () => {
    expect(statusesAfterCredit({ status: "Billed [EXP]", invoicingStatus: "Invoiced" }, 1)).toEqual({});
  });

  it("does not touch a status the job has moved on to", () => {
    expect(statusesAfterCredit({ status: "Cancelled Shipment", invoicingStatus: "Invoiced" }, 0)).toEqual({ invoicingStatus: "Not Invoiced" });
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
    expect(statusesAfterIssue({ status: "Billing [DOM]", invoicingStatus: "Not Invoiced" }).status).toBe("Billed [DOM]");
    expect(statusesAfterCredit({ status: "Billed [DOM]", invoicingStatus: "Invoiced" }, 0).status).toBe("Billing [DOM]");
  });
});
