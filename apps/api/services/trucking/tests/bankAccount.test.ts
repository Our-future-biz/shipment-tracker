import { describe, expect, it, vi } from "vitest";

// Bank accounts as the VAT register and invoices write them: one spelling per account, so the
// invoice's account can be found among the haulier's published accounts.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));

import { accountListed, normaliseBankAccount } from "../lib/bankAccount";
import { cleanBankAccounts } from "../lib/haulierRules";

describe("bank account normalisation", () => {
  it("writes a Czech account as prefix-number/bank without spaces or leading zeros", () => {
    expect(normaliseBankAccount("19-2000145399/0800")).toBe("19-2000145399/0800");
    expect(normaliseBankAccount(" 000019 - 2000145399 / 0800 ")).toBe("19-2000145399/0800");
    expect(normaliseBankAccount("2000145399/0800")).toBe("2000145399/0800");
    expect(normaliseBankAccount("000000-2000145399/0800")).toBe("2000145399/0800");
  });

  it("takes a Czech IBAN as the same account in the domestic form", () => {
    expect(normaliseBankAccount("CZ65 0800 0000 1920 0014 5399")).toBe("19-2000145399/0800");
    expect(normaliseBankAccount("cz6508000000192000145399")).toBe("19-2000145399/0800");
  });

  it("keeps a foreign IBAN in capitals without spaces", () => {
    expect(normaliseBankAccount("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });

  it("refuses wrong check digits and anything that is not an account", () => {
    expect(normaliseBankAccount("19-2000145398/0800")).toBeNull(); // number fails mod 11
    expect(normaliseBankAccount("18-2000145399/0800")).toBeNull(); // prefix fails mod 11
    expect(normaliseBankAccount("CZ66 0800 0000 1920 0014 5399")).toBeNull(); // IBAN fails mod 97
    expect(normaliseBankAccount("DE88 3704 0044 0532 0130 00")).toBeNull();
    expect(normaliseBankAccount("2000145399/080")).toBeNull();
    expect(normaliseBankAccount("")).toBeNull();
    expect(normaliseBankAccount(42)).toBeNull();
  });

  it("finds an account in a list whatever the spelling on either side", () => {
    const list = ["CZ65 0800 0000 1920 0014 5399", "DE89370400440532013000"];
    expect(accountListed("19-2000145399/0800", list)).toBe(true);
    expect(accountListed("de89 3704 0044 0532 0130 00", list)).toBe(true);
    expect(accountListed("2000145399/0800", list)).toBe(false);
    expect(accountListed("rubbish", list)).toBe(false);
  });

  it("saves the profile's published accounts normalised, once each, skipping empty rows", () => {
    expect(cleanBankAccounts(["CZ65 0800 0000 1920 0014 5399", "19-2000145399/0800", " ", "DE89 3704 0044 0532 0130 00"])).toEqual([
      "19-2000145399/0800",
      "DE89370400440532013000",
    ]);
    expect(cleanBankAccounts(undefined)).toEqual([]);
    expect(() => cleanBankAccounts(["19-2000145398/0800"])).toThrow(/Bank account 1/);
    const valid: string[] = [];
    for (let k = 10; valid.length < 21; k++) if (normaliseBankAccount(`${k}/0100`)) valid.push(`${k}/0100`);
    expect(cleanBankAccounts(valid.slice(0, 20))).toHaveLength(20);
    expect(() => cleanBankAccounts(valid)).toThrow(/At most 20/);
  });
});
