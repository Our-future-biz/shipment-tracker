import { describe, expect, it } from "vitest";
import { ACCOUNT_FORMAT_PROBLEM, answerText, approvedDutyPaidBy, answersProblem, changedAnswers, needsClassification, otherProcedureLabel, fieldsToFill, importInstructionsUrl, isAccountNumber, mayAskImportInstructions, normalizeAnswers, shipmentProcedureOf } from "../lib/importInstructions";
import { importInstructionsPdf } from "../lib/importInstructionsPdf";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";

const answers = (over: Partial<ImportInstructionAnswers> = {}): ImportInstructionAnswers =>
  normalizeAnswers({ procedure: "free_circulation", dutyPaidBy: "own_account", bank: "ČSOB", accountNumber: "19-2000145399/0800", description: "Machine parts", tariffCode: "8431", billingAddress: "Ulice 1, Praha", name: "Jan Novák", telephone: "+420 123", ...over });
const empty = { customsProcedure: "", customsOffice: "", hsCode: "", deliveryAddress: "", consigneeContact: "", deliveryPhone: "", deliveryNotes: "" };
const listed = (office: string) => office === "CZ590201 Praha";

describe("which shipments are asked", () => {
  it("are imports, and those without a Trade Direction yet", () => {
    for (const d of ["Import", "IMP", "import", "", " ", null]) expect(mayAskImportInstructions(d)).toBe(true);
    for (const d of ["Export", "EXP", "Cross Trade"]) expect(mayAskImportInstructions(d)).toBe(false);
  });
});

describe("the form", () => {
  it("is complete as filled in", () => expect(answersProblem(answers(), listed)).toBeNull());

  it("needs what each procedure asks for", () => {
    expect(answersProblem(answers({ procedure: "" }), listed)).toMatch(/procedure/);
    expect(answersProblem(answers({ bank: "" }), listed)).toMatch(/bank/);
    expect(answersProblem(answers({ procedure: "t1", t1Office: "" }), listed)).toMatch(/customs office/);
    expect(answersProblem(answers({ procedure: "t1", t1Office: "CZ590201 Praha", bank: "", accountNumber: "" }), listed)).toBeNull();
    expect(answersProblem(answers({ procedure: "t1", t1Office: "Praha", bank: "", accountNumber: "" }), listed)).toMatch(/from the list/);
    expect(answersProblem(answers({ procedure: "other", bank: "", accountNumber: "" }), listed)).toBeNull();
  });

  it("asks the bank under a) only when the duty and VAT are paid from the customer's own account (Q16)", () => {
    expect(answersProblem(answers({ dutyPaidBy: "", bank: "", accountNumber: "" }), listed)).toBe("Say who pays the duty and VAT");
    expect(answersProblem(answers({ dutyPaidBy: "us", bank: "", accountNumber: "" }), listed)).toBeNull();
    expect(answersProblem(answers({ dutyPaidBy: "own_account", accountNumber: "" }), listed)).toBe("Fill in the bank and the account number");
    expect(answersProblem(answers({ dutyPaidBy: "own_account", accountNumber: "TEST-0000000000/0000" }), listed)).toBe(ACCOUNT_FORMAT_PROBLEM);
    expect(answersProblem(answers({ dutyPaidBy: "own_account", accountNumber: "CZ65 0800 0000 1920 0014 5399" }), listed)).toBeNull();
    expect(normalizeAnswers({ dutyPaidBy: "hack" as never }).dutyPaidBy).toBe("");
  });

  it("lets a form sent before the question stand as it was: the account given, in any form", () => {
    expect(answersProblem(answers({ dutyPaidBy: "", accountNumber: "123/0300 old" }), listed)).toBeNull();
  });

  it("takes the answer without the question from a page opened before it, but checks its account when the customer sends it", () => {
    const fromCustomer = { fromCustomer: true };
    expect(answersProblem(answers({ dutyPaidBy: "", accountNumber: "123/0300 old" }), listed, fromCustomer)).toBe(ACCOUNT_FORMAT_PROBLEM);
    expect(answersProblem(answers({ dutyPaidBy: "", accountNumber: "19-2000145399/0800" }), listed, fromCustomer)).toBeNull();
    expect(answersProblem(answers({ dutyPaidBy: "", bank: "", accountNumber: "" }), listed, fromCustomer)).toBe("Say who pays the duty and VAT");
    expect(answersProblem(answers({ dutyPaidBy: "us", bank: "", accountNumber: "" }), listed, fromCustomer)).toBeNull();
    expect(answersProblem(answers({ procedure: "other", dutyPaidBy: "", accountNumber: "anything" }), listed, fromCustomer)).toBeNull();
  });

  it("keeps no bank or account when the duty and VAT are paid by us", () => {
    const fc = { procedure: "free_circulation" as const };
    expect(normalizeAnswers({ ...fc, dutyPaidBy: "us", bank: "ČSOB", accountNumber: "19-2000145399/0800" })).toMatchObject({ bank: "", accountNumber: "" });
    expect(normalizeAnswers({ ...fc, dutyPaidBy: "own_account", bank: "ČSOB", accountNumber: "19-2000145399/0800" })).toMatchObject({ bank: "ČSOB", accountNumber: "19-2000145399/0800" });
    expect(normalizeAnswers({ ...fc, dutyPaidBy: "", bank: "ČSOB", accountNumber: "1/0300" })).toMatchObject({ bank: "ČSOB", accountNumber: "1/0300" });
  });

  it("keeps who pays the duty, the bank and the account only under a) free circulation (mock council S3-7)", () => {
    for (const procedure of ["t1", "own_broker", "other", ""] as const) {
      expect(normalizeAnswers({ procedure, dutyPaidBy: "own_account", bank: "ČSOB", accountNumber: "19-2000145399/0800" })).toMatchObject({ dutyPaidBy: "", bank: "", accountNumber: "" });
    }
  });
});

describe("an account number", () => {
  it("is a Czech account, the prefix optional", () => {
    for (const v of ["19-2000145399/0800", "2000145399/0800", " 123456789/0300 ", "000019-2000145399/0800"]) expect(isAccountNumber(v)).toBe(true);
  });

  it("is an IBAN whose check digits add up, spaces and case aside", () => {
    expect(isAccountNumber("CZ65 0800 0000 1920 0014 5399")).toBe(true);
    expect(isAccountNumber("de89370400440532013000")).toBe(true);
    expect(isAccountNumber("CZ66 0800 0000 1920 0014 5399")).toBe(false);
  });

  it("is nothing else", () => {
    for (const v of ["", "TEST-0000000000/0000", "2000145399", "2000145399/08", "1234567-2000145399/0800", "CZ65"]) expect(isAccountNumber(v)).toBe(false);
  });

  it("needs the three questions only without a tariff code", () => {
    expect(answersProblem(answers({ tariffCode: "" }), listed)).toMatch(/what the goods are/);
    expect(answersProblem(answers({ tariffCode: "", whatIsIt: "a", madeOf: "b", usedFor: "c" }), listed)).toBeNull();
  });

  it("lets a customer clear the goods itself or through its own broker, without the classification questions (user council E11)", () => {
    const own = answers({ procedure: "own_broker", dutyPaidBy: "", bank: "", accountNumber: "", tariffCode: "", otherProcedure: "Broker s.r.o." });
    expect(own.procedure).toBe("own_broker");
    expect(answersProblem(own, listed)).toBeNull();
    expect(answersProblem({ ...own, description: "" }, listed)).toMatch(/Describe/);
    expect(needsClassification(own)).toBe(false);
    expect(needsClassification({ procedure: "t1", tariffCode: "" })).toBe(true);
    expect(answerText("procedure", own)).toMatch(/^d\) We clear the goods through customs ourselves/);
    expect(otherProcedureLabel("own_broker")).toBe("Customs broker");
    expect(otherProcedureLabel("other")).toBe("Procedure");
    // The job has no Customs Procedure value for it: nothing is written there.
    expect(shipmentProcedureOf("own_broker")).toBe("");
  });

  it("makes the PDF of a form cleared by the customer's own broker", async () => {
    const bytes = await importInstructionsPdf(answers({ procedure: "own_broker", tariffCode: "", otherProcedure: "Broker s.r.o." }), { reference: "CZ00000041", confirmedAt: "2026-11-09 10:00", approvedBy: "", changes: [] });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("needs a description, a billing address, a name and a telephone; delivery is optional", () => {
    expect(answersProblem(answers({ description: " " }), listed)).toMatch(/Describe/);
    expect(answersProblem(answers({ billingAddress: "" }), listed)).toMatch(/billing/);
    expect(answersProblem(answers({ name: "" }), listed)).toMatch(/name/);
    expect(answersProblem(answers({ telephone: "" }), listed)).toMatch(/telephone/);
    expect(answers().deliveryAddress).toBe("");
  });

  it("is kept trimmed, within limits, and takes only known procedures", () => {
    expect(normalizeAnswers({ name: "  Jan  " }).name).toBe("Jan");
    expect(normalizeAnswers({ tariffCode: "1".repeat(99) }).tariffCode).toHaveLength(50);
    expect(normalizeAnswers({ procedure: "hack" as never }).procedure).toBe("");
  });
});

describe("what an approved form writes to the shipment", () => {
  it("means the shipment's own procedures", () => {
    expect(shipmentProcedureOf("free_circulation")).toBe("JSD");
    expect(shipmentProcedureOf("t1")).toBe("T1");
    expect(shipmentProcedureOf("other")).toBe("");
  });

  it("fills the empty fields", () => {
    expect(fieldsToFill(empty, answers({ deliveryAddress: "Dock 1" }))).toEqual({ customsProcedure: "JSD", hsCode: "8431", deliveryAddress: "Dock 1" });
  });

  it("never replaces what is already filled in", () => {
    const filled = { customsProcedure: "SCP", customsOffice: "", hsCode: "1111", deliveryAddress: "Old", consigneeContact: "Eva", deliveryPhone: "+420 1", deliveryNotes: "Ramp 2" };
    expect(fieldsToFill(filled, answers({ deliveryAddress: "Dock 1", deliveryContact: "Petr", deliveryPhone: "+420 602", deliveryNotes: "Mon-Fri 8-14" }))).toEqual({});
  });

  it("gives the delivery contact, telephone and notes to the job, beside the Delivery Address (E5)", () => {
    expect(fieldsToFill(empty, answers({ deliveryContact: "Petr Skladník", deliveryPhone: "+420 602 345 678", deliveryNotes: "Mon-Fri 08:00-14:00, ramp 3" }))).toMatchObject({
      consigneeContact: "Petr Skladník",
      deliveryPhone: "+420 602 345 678",
      deliveryNotes: "Mon-Fri 08:00-14:00, ramp 3",
    });
  });

  it("writes the form's contact with its phone, over a different Contact the consignee brought (mock council M5)", () => {
    const picked = { ...empty, consigneeContact: "Jana (CS)" };
    expect(fieldsToFill(picked, answers({ deliveryContact: "Petr Skladník", deliveryPhone: "+420 602" }))).toMatchObject({ consigneeContact: "Petr Skladník", deliveryPhone: "+420 602" });
    // The same person: nothing to write.
    expect(fieldsToFill({ ...empty, consigneeContact: "Petr Skladník" }, answers({ deliveryContact: "Petr Skladník", deliveryPhone: "+420 602" })).consigneeContact).toBeUndefined();
    // The job already has a phone, so none is written and the Contact stays as it is.
    expect(fieldsToFill({ ...picked, deliveryPhone: "+420 1" }, answers({ deliveryContact: "Petr Skladník", deliveryPhone: "+420 602" }))).not.toHaveProperty("consigneeContact");
    // No phone on the form: the Contact is filled only when empty.
    expect(fieldsToFill(picked, answers({ deliveryContact: "Petr Skladník" })).consigneeContact).toBeUndefined();
    expect(fieldsToFill(empty, answers({ deliveryContact: "Petr Skladník" })).consigneeContact).toBe("Petr Skladník");
  });

  // System-21 mock council review: half a pair is still a pair - the form's phone with no contact named clears the
  // Contact the consignee brought, so customer service's name never stands beside the warehouse man's phone.
  it("clears the consignee's Contact when the form's phone is written with no contact (mock council M5)", () => {
    const picked = { ...empty, consigneeContact: "Jana (CS)" };
    expect(fieldsToFill(picked, answers({ deliveryContact: "", deliveryPhone: "+420 602" }))).toMatchObject({ consigneeContact: "", deliveryPhone: "+420 602" });
    expect(fieldsToFill(picked, answers({ deliveryContact: "  ", deliveryPhone: "+420 602" })).consigneeContact).toBe("");
    // No Contact to clear: none is written.
    expect(fieldsToFill(empty, answers({ deliveryContact: "", deliveryPhone: "+420 602" }))).not.toHaveProperty("consigneeContact");
    // No phone written (the job has one already): the Contact stays.
    expect(fieldsToFill({ ...picked, deliveryPhone: "+420 1" }, answers({ deliveryContact: "", deliveryPhone: "+420 602" }))).not.toHaveProperty("consigneeContact");
  });

  it("writes a T1 office only under a T1", () => {
    expect(fieldsToFill(empty, answers({ procedure: "t1", t1Office: "CZ590201 Praha" }))).toMatchObject({ customsProcedure: "T1", customsOffice: "CZ590201 Praha" });
    expect(fieldsToFill({ ...empty, customsProcedure: "SCP" }, answers({ procedure: "t1", t1Office: "CZ590201 Praha" })).customsOffice).toBeUndefined();
  });

  it("leaves out what the customer left empty", () => {
    expect(fieldsToFill(empty, answers({ tariffCode: "", procedure: "other", whatIsIt: "a", madeOf: "b", usedFor: "c" }))).toEqual({});
  });
});

describe("the link and the PDF", () => {
  it("opens the form's own page", () => expect(importInstructionsUrl("https://a.cz/", "t")).toBe("https://a.cz/import-instructions/t"));

  it("makes a PDF, with Czech letters", async () => {
    const bytes = await importInstructionsPdf(answers({ description: "Žluťoučký kůň ".repeat(40), deliveryAddress: "Dock 1", deliveryNotes: "Po-Pá 8-14, rampa" }), { reference: "CZ00000041", confirmedAt: "2026-11-09 10:00", approvedBy: "boss@firm.cz", changes: [] });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });

  it("makes a PDF with the answers changed on approval", async () => {
    const changes = changedAnswers(answers(), answers({ tariffCode: "8432", billingAddress: "Náměstí 2, Brno" }));
    const bytes = await importInstructionsPdf(answers(), { reference: "CZ00000041", confirmedAt: "2026-11-09 10:00", approvedBy: "boss@firm.cz", changes });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});

describe("what the reviewer changed", () => {
  it("is nothing when approved as sent", () => expect(changedAnswers(answers(), answers())).toEqual([]));

  it("is each changed answer in the form's order, the procedure in words", () => {
    expect(changedAnswers(answers(), answers({ procedure: "t1", t1Office: "CZ590201 Praha", tariffCode: "" }))).toEqual([
      { field: "procedure", label: "Customs procedure", sent: "a) Release for free circulation (SAD)", approved: "b) T1 transit" },
      // Under a T1 nobody pays duty here, and no bank is kept (mock council S3-7).
      { field: "dutyPaidBy", label: "Duty and VAT paid by", sent: "From your own account", approved: "" },
      { field: "bank", label: "Bank", sent: "ČSOB", approved: "" },
      { field: "accountNumber", label: "Account number", sent: "19-2000145399/0800", approved: "" },
      { field: "t1Office", label: "Customs office of destination", sent: "", approved: "CZ590201 Praha" },
      { field: "tariffCode", label: "Customs tariff code", sent: "8431", approved: "" },
    ]);
  });

  it("names who pays the duty in words, and the bank and account no longer kept once it is us", () => {
    expect(changedAnswers(answers(), answers({ dutyPaidBy: "us" }))).toEqual([
      { field: "dutyPaidBy", label: "Duty and VAT paid by", sent: "From your own account", approved: "Us, invoiced to you" },
      { field: "bank", label: "Bank", sent: "ČSOB", approved: "" },
      { field: "accountNumber", label: "Account number", sent: "19-2000145399/0800", approved: "" },
    ]);
  });
});

describe("who pays the duty and VAT, for Billing (mock council R3)", () => {
  it("is what the approved form says, under free circulation only", () => {
    expect(approvedDutyPaidBy({ status: "approved", approvedAnswers: answers({ dutyPaidBy: "us" }) })).toBe("us");
    expect(approvedDutyPaidBy({ status: "approved", approvedAnswers: answers() })).toBe("own_account");
    // A T1 form keeps no answer, even one sent anyway (S3-7).
    expect(approvedDutyPaidBy({ status: "approved", approvedAnswers: { procedure: "t1", dutyPaidBy: "us" } })).toBe("");
  });

  it("is nothing while the form is not approved, or when there is none", () => {
    expect(approvedDutyPaidBy({ status: "submitted", approvedAnswers: null })).toBe("");
    expect(approvedDutyPaidBy({ status: "rejected", approvedAnswers: answers({ dutyPaidBy: "us" }) })).toBe("");
    expect(approvedDutyPaidBy(null)).toBe("");
  });
});
