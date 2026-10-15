import { describe, expect, it } from "vitest";
import { bankAccountProblem, formatBankAccount, isPublishedAccount, normaliseBankAccount } from "./bankAccounts";

describe("bank accounts", () => {
  it("normalises spaces, leading zeros and capitals", () => {
    expect(normaliseBankAccount(" 000019-2000145399 / 0800 ")).toBe("19-2000145399/0800");
    expect(normaliseBankAccount("000000-0000123457/0100")).toBe("123457/0100");
    expect(normaliseBankAccount("cz65 0800 0000 1920 0014 5399")).toBe("CZ6508000000192000145399");
  });

  it("checks the Czech prefix-number/bank form with its check digits", () => {
    expect(bankAccountProblem("19-2000145399/0800")).toBeNull();
    expect(bankAccountProblem("2000145399/0800")).toBeNull();
    expect(bankAccountProblem("19-2000145398/0800")).toMatch(/account number/);
    expect(bankAccountProblem("18-2000145399/0800")).toMatch(/prefix/);
    expect(bankAccountProblem("2000145399/080")).toMatch(/prefix-number\/bank/);
    expect(bankAccountProblem("")).toBe("Enter the bank account");
  });

  it("checks an IBAN", () => {
    expect(bankAccountProblem("CZ65 0800 0000 1920 0014 5399")).toBeNull();
    expect(bankAccountProblem("DE89 3704 0044 0532 0130 00")).toBeNull();
    expect(bankAccountProblem("CZ66 0800 0000 1920 0014 5399")).toMatch(/check digits/);
    expect(bankAccountProblem("CZ65 0800 0000 1920 0014 539")).toMatch(/24 characters/);
  });

  it("formats an IBAN in groups of four", () => {
    expect(formatBankAccount("CZ6508000000192000145399")).toBe("CZ65 0800 0000 1920 0014 5399");
    expect(formatBankAccount("19-2000145399/0800")).toBe("19-2000145399/0800");
  });

  it("finds an account among the published ones however it is spelled", () => {
    const published = ["19-2000145399/0800"];
    expect(isPublishedAccount("000019-2000145399/0800", published)).toBe(true);
    expect(isPublishedAccount("CZ65 0800 0000 1920 0014 5399", published)).toBe(true);
    expect(isPublishedAccount("2000145399/0800", published)).toBe(false);
    expect(isPublishedAccount("", published)).toBe(false);
  });
});
