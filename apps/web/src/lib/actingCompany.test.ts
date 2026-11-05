import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTING_COMPANY_HEADER, actingCompanyId, setActingCompanyId, withActingCompany } from "./actingCompany";

// The browser's storage, as the tests' Node has none.
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

describe("a superadmin's company choice", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is sent with the requests once chosen, and not after going back to the own company", () => {
    expect(withActingCompany(new Headers()).has(ACTING_COMPANY_HEADER)).toBe(false);
    setActingCompanyId("22222222-2222-4222-8222-222222222222");
    expect(actingCompanyId()).toBe("22222222-2222-4222-8222-222222222222");
    expect(withActingCompany(new Headers()).get(ACTING_COMPANY_HEADER)).toBe("22222222-2222-4222-8222-222222222222");
    setActingCompanyId(null);
    expect(actingCompanyId()).toBeNull();
    expect(withActingCompany(new Headers()).has(ACTING_COMPANY_HEADER)).toBe(false);
  });

  it("is nothing when the storage is refused", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    });
    expect(() => setActingCompanyId("x")).not.toThrow();
    expect(actingCompanyId()).toBeNull();
  });
});
