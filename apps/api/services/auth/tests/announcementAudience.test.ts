import { describe, it, expect } from "vitest";
import { audienceCountryCode, audienceLabel, isAddressedTo, type Addressee } from "../announcementAudience";

const nobody: Addressee = { departmentId: null, branchId: null, country: null, countryCode: null };
const pragueAccountant: Addressee = { departmentId: "acc", branchId: "prg", country: "Czechia", countryCode: "CZ" };
const audience = (to: Partial<Addressee>) => ({ ...nobody, ...to, scope: "audience" });

describe("isAddressedTo — audience", () => {
  it("reaches everyone when country, branch and department are all left open", () => {
    expect(isAddressedTo(audience({}), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({}), nobody)).toBe(true);
  });

  it("needs every filled part to be the reader's own", () => {
    expect(isAddressedTo(audience({ countryCode: "CZ" }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ countryCode: "CZ", departmentId: "acc" }), pragueAccountant)).toBe(true);
    expect(isAddressedTo(audience({ countryCode: "DE" }), pragueAccountant)).toBe(false);
    expect(isAddressedTo(audience({ countryCode: "CZ", branchId: "brno" }), pragueAccountant)).toBe(false);
    expect(isAddressedTo(audience({ departmentId: "ops" }), pragueAccountant)).toBe(false);
  });

  it("leaves out readers with no branch or department when that part is filled", () => {
    expect(isAddressedTo(audience({ countryCode: "CZ" }), nobody)).toBe(false);
    expect(isAddressedTo(audience({ departmentId: "acc" }), nobody)).toBe(false);
  });
});

describe("audienceCountryCode", () => {
  const post = { scope: "audience", country: null, countryCode: null, branchCountryCode: null };

  it("is the post's own country code, or null for all countries", () => {
    expect(audienceCountryCode({ ...post, countryCode: "CZ", country: "Czechia" })).toBe("CZ");
    expect(audienceCountryCode(post)).toBeNull();
    expect(audienceCountryCode({ ...post, scope: "department" })).toBeNull();
  });

  it("finds the country of older branch and country posts", () => {
    expect(audienceCountryCode({ ...post, scope: "branch", branchCountryCode: "DE" })).toBe("DE");
    expect(audienceCountryCode({ ...post, scope: "country", country: "Germany" })).toBe("DE");
    expect(audienceCountryCode({ ...post, scope: "country", country: "Atlantis" })).toBeNull();
  });
});

describe("audienceLabel", () => {
  it("joins what is filled, or says All", () => {
    expect(audienceLabel(["Czechia", null, "Accounting"])).toBe("Czechia · Accounting");
    expect(audienceLabel([undefined, null])).toBe("All");
  });
});
