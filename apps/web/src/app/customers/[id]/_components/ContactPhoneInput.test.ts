import { describe, expect, it } from "vitest";
import { joinPhone, phoneCountry, splitPhone } from "./ContactPhoneInput";

describe("contact phone parts", () => {
  it("splits a stored international number into country and national part", () => {
    expect(splitPhone("+420 774 237 000")).toEqual({ country: "CZ", national: "774 237 000" });
  });

  it("keeps an unreadable number whole", () => {
    expect(splitPhone("call reception")).toEqual({ country: "CZ", national: "call reception" });
  });

  it("joins country and number in international format", () => {
    expect(joinPhone({ country: "CZ", national: "774237000" })).toBe("+420 774 237 000");
    expect(joinPhone({ country: "CZ", national: " " })).toBe("");
  });

  it("takes a number typed with its own code as typed, whatever country is picked", () => {
    expect(joinPhone({ country: "CZ", national: "+44 20 7946 0958" })).toBe("+44 20 7946 0958");
    expect(joinPhone({ country: "CZ", national: "+44 1" })).toBe("+44 1");
  });
});

describe("phoneCountry", () => {
  it("starts a new number in the customer's country", () => {
    expect(phoneCountry("JP")).toBe("JP");
    expect(phoneCountry(" sk ")).toBe("SK");
  });

  it("starts in Czechia without a country, or with one that has no calling code", () => {
    expect(phoneCountry(undefined)).toBe("CZ");
    expect(phoneCountry("")).toBe("CZ");
    expect(phoneCountry("XX")).toBe("CZ");
  });
});
