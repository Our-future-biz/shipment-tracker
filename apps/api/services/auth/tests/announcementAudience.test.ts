import { describe, it, expect } from "vitest";
import { audienceCountryCodes, audienceLabel, isAddressedTo, type AddressedPost, type Addressee } from "../lib/announcementAudience";

const nobody: Addressee = { departmentId: null, branchId: null, country: null, countryCode: null };
const pragueAccountant: Addressee = { departmentId: "acc", branchId: "prg", country: "Czechia", countryCode: "CZ" };
const lists = { countryCodes: [], branchIds: [], departmentIds: [] };
const audience = (to: Partial<AddressedPost>): AddressedPost => ({ ...nobody, ...lists, ...to, scope: "audience" });

describe("isAddressedTo — audience", () => {
  it("reaches everyone when country, branch and department are all left open", () => {
    expect(isAddressedTo(audience({}), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({}), nobody)).toBe(true);
  });

  it("needs every filled list to hold the reader's own", () => {
    expect(isAddressedTo(audience({ countryCodes: ["CZ"] }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ countryCodes: ["CZ"], departmentIds: ["acc"] }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ countryCodes: ["DE"] }), pragueAccountant)).toBe(false);
    expect(isAddressedTo(audience({ countryCodes: ["CZ"], branchIds: ["brno"] }), pragueAccountant)).toBe(false);
    expect(isAddressedTo(audience({ departmentIds: ["ops"] }), pragueAccountant)).toBe(false);
  });

  it("reaches the reader through any one of several chosen", () => {
    expect(isAddressedTo(audience({ countryCodes: ["DE", "CZ"] }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ branchIds: ["brno", "prg"], departmentIds: ["ops", "acc"] }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ countryCodes: ["DE", "AT"] }), pragueAccountant)).toBe(false);
    expect(isAddressedTo(audience({ countryCodes: ["DE", "CZ"], departmentIds: ["ops", "fcl"] }), pragueAccountant)).toBe(false);
  });

  it("leaves out readers with no branch or department when that list is filled", () => {
    expect(isAddressedTo(audience({ countryCodes: ["CZ"] }), nobody)).toBe(false);
    expect(isAddressedTo(audience({ departmentIds: ["acc"] }), nobody)).toBe(false);
  });
});

describe("audienceCountryCodes", () => {
  const post = { scope: "audience", country: null, countryCodes: [], branchCountryCode: null };

  it("is the post's own countries, or none for all countries", () => {
    expect(audienceCountryCodes({ ...post, countryCodes: ["CZ", "DE"] })).toEqual(["CZ", "DE"]);
    expect(audienceCountryCodes(post)).toEqual([]);
    expect(audienceCountryCodes({ ...post, scope: "department" })).toEqual([]);
  });

  it("finds the country of older branch and country posts", () => {
    expect(audienceCountryCodes({ ...post, scope: "branch", branchCountryCode: "DE" })).toEqual(["DE"]);
    expect(audienceCountryCodes({ ...post, scope: "country", country: "Germany" })).toEqual(["DE"]);
    expect(audienceCountryCodes({ ...post, scope: "country", country: "Atlantis" })).toEqual([]);
  });
});

describe("audienceLabel", () => {
  it("joins what is filled, or says All", () => {
    expect(audienceLabel(["Czechia", null, "Accounting"])).toBe("Czechia · Accounting");
    expect(audienceLabel([undefined, null])).toBe("All");
  });

  it("names several of one part together", () => {
    expect(audienceLabel([["Czechia", "Germany"], [], ["FCL", "LCL"]])).toBe("Czechia, Germany · FCL, LCL");
  });
});
