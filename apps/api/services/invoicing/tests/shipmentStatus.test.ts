import { describe, expect, it } from "vitest";
import { chargeChangeOf, chargesInvoiced, isBillingStatus, statusesAfterCredit, statusesAfterIssue } from "../lib/shipmentStatus";

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

describe("chargeChangeOf (a selling line written after invoicing)", () => {
  const v = (amount: string | null, qty: string | null = "1") => ({ amount, qty });

  it("is 'added' when the line asks the customer for more: a new charge, a value given, or raised", () => {
    expect(chargeChangeOf(null, v("300"))).toBe("added");
    expect(chargeChangeOf(v("0"), v("300"))).toBe("added");
    expect(chargeChangeOf(v(null), v("300"))).toBe("added");
    expect(chargeChangeOf(v("300"), v("320"))).toBe("added");
    expect(chargeChangeOf(v("150", "2"), v("150", "3"))).toBe("added");
    expect(chargeChangeOf(v("-50"), v("20"))).toBe("added");
  });

  it("is null for a line below nothing or a value lowered above nothing: a credit owed sends no job back (Y1 / P1)", () => {
    expect(chargeChangeOf(null, v("-50"))).toBeNull();
    expect(chargeChangeOf(v("-50"), v("-80"))).toBeNull();
    expect(chargeChangeOf(v("-50"), null)).toBeNull();
    expect(chargeChangeOf(v("320"), v("300"))).toBeNull();
  });

  it("is 'removed' when a charge is deleted or set to nothing: the rest may now all be invoiced", () => {
    expect(chargeChangeOf(v("300"), null)).toBe("removed");
    expect(chargeChangeOf(v("300"), v("0"))).toBe("removed");
    expect(chargeChangeOf(v("300", "2"), v("300", "0"))).toBe("removed");
    expect(chargeChangeOf(v("300"), v("-10"))).toBe("removed");
  });

  it("is null when the job's charges are as they were", () => {
    expect(chargeChangeOf(v("300"), v("300"))).toBeNull();
    // A blank quantity is one, as on the invoice.
    expect(chargeChangeOf(v("300", null), v("300", "1"))).toBeNull();
    expect(chargeChangeOf(null, v("0"))).toBeNull();
    expect(chargeChangeOf(v(null), null)).toBeNull();
    expect(chargeChangeOf(null, null)).toBeNull();
  });
});
