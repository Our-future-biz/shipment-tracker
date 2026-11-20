import { describe, expect, it } from "vitest";
import { completeAnswers } from "@/components/ImportInstructionsFields";
import { answerSummary, usedLinkText } from "./summary";

describe("what the customer sent, to read or print (user council E12)", () => {
  it("lists every answer given, labelled, in the form's order, the procedure in words", () => {
    const rows = answerSummary(completeAnswers({ procedure: "free_circulation", dutyPaidBy: "us", description: "Machine parts", billingAddress: "Ulice 1, Praha", name: "Jan Novák", telephone: "+420 123" }));
    expect(rows.map((r) => [r.label, r.value])).toEqual([
      ["Customs procedure", "a) Release for free circulation (SAD)"],
      ["Duty and VAT paid by", "Us, invoiced to you"],
      ["Description of the goods", "Machine parts"],
      ["Billing address", "Ulice 1, Praha"],
      ["Confirmed by", "Jan Novák"],
      ["Telephone", "+420 123"],
    ]);
  });

  it("names the customer's own broker as such (user council E11)", () => {
    const rows = answerSummary(completeAnswers({ procedure: "own_broker", otherProcedure: "Broker s.r.o.", description: "Parts" }));
    expect(rows.slice(0, 2).map((r) => [r.label, r.value])).toEqual([
      ["Customs procedure", "d) We clear the goods through customs ourselves or through our own broker"],
      ["Customs broker", "Broker s.r.o."],
    ]);
  });
});

describe("a link that no longer opens", () => {
  it("names the company to ask when the server gives it", () => {
    expect(usedLinkText("Austromar s.r.o.")).toBe("It was already used, it has expired or it was cancelled. Please ask Austromar s.r.o. for a new one.");
    expect(usedLinkText(null)).toMatch(/ask your contact/);
    expect(usedLinkText("  ")).toMatch(/ask your contact/);
  });
});
