import { describe, expect, it } from "vitest";
import { answersProblem, fieldsToFill, importInstructionsUrl, mayAskImportInstructions, normalizeAnswers, shipmentProcedureOf } from "../lib/importInstructions";
import { importInstructionsPdf } from "../lib/importInstructionsPdf";
import type { ImportInstructionAnswers } from "../interfaces/importInstructions";

const answers = (over: Partial<ImportInstructionAnswers> = {}): ImportInstructionAnswers =>
  normalizeAnswers({ procedure: "free_circulation", bank: "ČSOB", accountNumber: "123/0300", description: "Machine parts", tariffCode: "8431", billingAddress: "Ulice 1, Praha", name: "Jan Novák", telephone: "+420 123", ...over });
const empty = { customsProcedure: "", customsOffice: "", hsCode: "", deliveryAddress: "" };
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

  it("needs the three questions only without a tariff code", () => {
    expect(answersProblem(answers({ tariffCode: "" }), listed)).toMatch(/what the goods are/);
    expect(answersProblem(answers({ tariffCode: "", whatIsIt: "a", madeOf: "b", usedFor: "c" }), listed)).toBeNull();
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
    expect(fieldsToFill({ customsProcedure: "SCP", customsOffice: "", hsCode: "1111", deliveryAddress: "Old" }, answers({ deliveryAddress: "Dock 1" }))).toEqual({});
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
    const bytes = await importInstructionsPdf(answers({ description: "Žluťoučký kůň ".repeat(40), deliveryAddress: "Dock 1" }), { reference: "CZ00000041", confirmedAt: "2026-11-09 10:00", approvedBy: "boss@firm.cz" });
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-");
  });
});
