import { describe, expect, it } from "vitest";
import {
  dicError,
  ibanError,
  icoError,
  missingForIssue,
  normaliseProfile,
  swiftError,
  validateProfile,
  type InvoiceProfileInput,
} from "../lib/invoiceProfile";

const base: InvoiceProfileInput = {
  companyName: "Test Logistics s.r.o.",
  street: "Na Příkopě 1",
  city: "Praha 1",
  postalCode: "110 00",
  country: "CZ",
  ico: "27082440",
  dic: "CZ27082440",
  vatPayer: true,
  registerEntry: "",
  email: "",
  phone: "",
  web: "",
  logoData: "",
  bankAccounts: [{ currency: "CZK", bankName: "Test banka", accountNumber: "", iban: "CZ6508000000192000145399", swift: "GIBACZPX" }],
  defaultDueDays: 14,
  footerNote: "",
};

describe("icoError", () => {
  it("accepts IČO with a valid check digit", () => {
    expect(icoError("27082440")).toBeNull();
    expect(icoError("25596641")).toBeNull();
  });

  it("rejects wrong length or check digit", () => {
    expect(icoError("2708244")).toMatch(/8 digits/);
    expect(icoError("27082441")).toMatch(/check digit/);
  });
});

describe("dicError", () => {
  it("accepts Czech and foreign DIČ", () => {
    expect(dicError("CZ27082440")).toBeNull();
    expect(dicError("CZ7001011234")).toBeNull();
    expect(dicError("SK2020317068")).toBeNull();
    expect(dicError("DE123456789")).toBeNull();
  });

  it("rejects malformed DIČ", () => {
    expect(dicError("CZ123")).not.toBeNull();
    expect(dicError("27082440")).not.toBeNull();
  });
});

describe("ibanError / swiftError", () => {
  it("accepts valid IBANs and SWIFT codes", () => {
    expect(ibanError("CZ65 0800 0000 1920 0014 5399")).toBeNull();
    expect(ibanError("DE89370400440532013000")).toBeNull();
    expect(swiftError("GIBACZPX")).toBeNull();
    expect(swiftError("KOMBCZPPXXX")).toBeNull();
  });

  it("rejects a wrong check digit or format", () => {
    expect(ibanError("CZ6608000000192000145399")).toMatch(/check digits/);
    expect(ibanError("12345")).toMatch(/format/);
    expect(swiftError("GIBA")).not.toBeNull();
  });
});

describe("normaliseProfile", () => {
  it("trims and normalises codes", () => {
    const p = normaliseProfile({
      ...base,
      ico: " 270 824 40 ",
      dic: " cz27082440",
      country: "cz",
      bankAccounts: [{ currency: "eur", bankName: " B ", accountNumber: "", iban: "de89 3704 0044 0532 0130 00", swift: "cobadeffxxx" }],
    });
    expect(p.ico).toBe("27082440");
    expect(p.dic).toBe("CZ27082440");
    expect(p.country).toBe("CZ");
    expect(p.bankAccounts[0]).toEqual({ currency: "EUR", bankName: "B", accountNumber: "", iban: "DE89370400440532013000", swift: "COBADEFFXXX" });
  });
});

describe("validateProfile", () => {
  it("passes a complete profile", () => {
    expect(validateProfile(base)).toEqual([]);
  });

  it("allows saving an empty profile", () => {
    expect(validateProfile(normaliseProfile({ ...base, companyName: "", ico: "", dic: "", bankAccounts: [] }))).toEqual([]);
  });

  it("reports every problem", () => {
    const errors = validateProfile({
      ...base,
      ico: "11111111",
      dic: "",
      defaultDueDays: 400,
      logoData: "data:image/gif;base64,AAAA",
      bankAccounts: [
        { currency: "CZK", bankName: "", accountNumber: "", iban: "", swift: "" },
        { currency: "CZK", bankName: "", accountNumber: "1/0800", iban: "", swift: "X" },
      ],
    });
    expect(errors).toEqual([
      "IČO check digit does not match",
      "A VAT payer needs a DIČ",
      "Default due days must be a whole number between 0 and 365",
      "Logo must be a PNG or JPEG image",
      "Bank account 1: fill in the IBAN or the account number",
      "Bank account 2: there is already an account for CZK",
      "Bank account 2: SWIFT/BIC must have 8 or 11 characters",
    ]);
  });
});

describe("missingForIssue", () => {
  it("lists what an invoice still needs", () => {
    expect(missingForIssue(base)).toEqual([]);
    expect(missingForIssue({ ...base, companyName: "", city: "", dic: "", bankAccounts: [] })).toEqual([
      "company name",
      "address",
      "DIČ",
      "bank account",
    ]);
  });

  it("does not need DIČ from a non-payer", () => {
    expect(missingForIssue({ ...base, vatPayer: false, dic: "" })).toEqual([]);
  });
});
