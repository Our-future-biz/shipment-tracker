import { describe, expect, it } from "vitest";
import { dutyVatLine } from "./dutyVat";

const answers = (over: Record<string, string>) => ({ procedure: "free_circulation", dutyPaidBy: "us", ...over }) as never;

describe("the Customs tab's Duty and VAT line (R3)", () => {
  it("says we pay them and invoice the customer, from the approved Import Instructions", () => {
    expect(dutyVatLine({ status: "approved", approvedAnswers: answers({}) })).toBe("Paid by us - invoice them to the customer (Import Instructions)");
    expect(dutyVatLine({ status: "approved", approvedAnswers: answers({ dutyPaidBy: "own_account" }) })).toBe("From the customer's own account (Import Instructions)");
  });

  it("is not shown before the form is approved, under another procedure, or for a form sent before the question", () => {
    expect(dutyVatLine({ status: "submitted", approvedAnswers: null })).toBeNull();
    expect(dutyVatLine({ status: "approved", approvedAnswers: answers({ procedure: "t1" }) })).toBeNull();
    expect(dutyVatLine({ status: "approved", approvedAnswers: answers({ dutyPaidBy: "" }) })).toBeNull();
    expect(dutyVatLine(null)).toBeNull();
  });
});
