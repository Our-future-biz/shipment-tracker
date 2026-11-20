import { describe, expect, it } from "vitest";
import { accountQuestions, isAccountNumber } from "./importAccount";

describe("who pays the duty and VAT, and the bank (Q16)", () => {
  it("asks the bank only when they are paid from the customer's own account", () => {
    expect(accountQuestions(undefined, undefined, undefined)).toEqual({ asksAccount: false, mustSayWhoPays: true });
    expect(accountQuestions("us", "", "")).toEqual({ asksAccount: false, mustSayWhoPays: true });
    expect(accountQuestions("own_account", "", "")).toEqual({ asksAccount: true, mustSayWhoPays: true });
  });

  it("shows the account of a form sent before the question, which stands as it was with both boxes filled", () => {
    expect(accountQuestions("", "ČSOB", "123/0300")).toEqual({ asksAccount: true, mustSayWhoPays: false });
    expect(accountQuestions("", "ČSOB", " ")).toEqual({ asksAccount: true, mustSayWhoPays: true });
  });
});

describe("the Import Instructions' account number", () => {
  it("is a Czech account, the prefix optional", () => {
    for (const v of ["19-2000145399/0800", "2000145399/0800", " 123456789/0300 "]) expect(isAccountNumber(v)).toBe(true);
  });

  it("is an IBAN whose check digits add up, spaces and case aside", () => {
    expect(isAccountNumber("CZ65 0800 0000 1920 0014 5399")).toBe(true);
    expect(isAccountNumber("de89370400440532013000")).toBe(true);
    expect(isAccountNumber("CZ66 0800 0000 1920 0014 5399")).toBe(false);
  });

  it("is nothing else", () => {
    for (const v of ["", "TEST-0000000000/0000", "2000145399", "2000145399/08", "CZ65"]) expect(isAccountNumber(v)).toBe(false);
  });
});
