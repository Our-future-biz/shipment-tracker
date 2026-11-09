import { describe, expect, it } from "vitest";
import { ownCompanyToLookIn } from "../lib/selfLookup";

const ROOT = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const PLATFORM = "a0000000-0000-4000-8000-000000000001";
const TENANT = "b0000000-0000-4000-8000-000000000002";
// A superadmin of the platform company working as a tenant.
const acting = { userID: ROOT, companyID: TENANT, homeCompanyID: PLATFORM };

describe("where the caller themself is looked up for a stamp", () => {
  it("is their own company when a superadmin works as another one and was not found in it", () => {
    expect(ownCompanyToLookIn(acting, [ROOT], [])).toBe(PLATFORM);
    expect(ownCompanyToLookIn(acting, [OTHER, ROOT], [{ id: OTHER }])).toBe(PLATFORM);
  });

  it("is nowhere else for anybody but the caller: other users stay in the acting company", () => {
    expect(ownCompanyToLookIn(acting, [OTHER], [])).toBeNull();
    expect(ownCompanyToLookIn(acting, [], [])).toBeNull();
  });

  it("is not needed when the caller works in their own company, was found already, or is the app itself", () => {
    expect(ownCompanyToLookIn({ userID: ROOT, companyID: PLATFORM, homeCompanyID: PLATFORM }, [ROOT], [])).toBeNull();
    expect(ownCompanyToLookIn(acting, [ROOT], [{ id: ROOT }])).toBeNull();
    // A service call carries no home company.
    expect(ownCompanyToLookIn({ userID: ROOT, companyID: TENANT }, [ROOT], [])).toBeNull();
    expect(ownCompanyToLookIn({ userID: "", companyID: TENANT, homeCompanyID: PLATFORM }, [""], [])).toBeNull();
  });
});
