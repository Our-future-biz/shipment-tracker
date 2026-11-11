import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The browser's storage, as the tests' Node has none.
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
  };
}

// A page loaded: the module comes fresh, as it does with every page load.
const loadPage = async () => {
  vi.resetModules();
  return import("./actingCompany");
};

const A = "22222222-2222-4222-8222-222222222222";
const B = "33333333-3333-4333-8333-333333333333";

describe("a superadmin's company choice", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is sent with the requests of the pages loaded after it was chosen, and not after going back to the own company", async () => {
    let page = await loadPage();
    expect(page.withActingCompany(new Headers()).has(page.ACTING_COMPANY_HEADER)).toBe(false);
    page.setActingCompanyId(A);
    page = await loadPage();
    expect(page.actingCompanyId()).toBe(A);
    expect(page.withActingCompany(new Headers()).get(page.ACTING_COMPANY_HEADER)).toBe(A);
    page.setActingCompanyId(null);
    page = await loadPage();
    expect(page.actingCompanyId()).toBeNull();
    expect(page.withActingCompany(new Headers()).has(page.ACTING_COMPANY_HEADER)).toBe(false);
  });

  it("stays the one the page was loaded with when another tab chooses another company", async () => {
    localStorage.setItem("acting_company", A);
    const page = await loadPage();
    expect(page.actingCompanyId()).toBe(A);
    localStorage.setItem("acting_company", B);
    expect(page.withActingCompany(new Headers()).get(page.ACTING_COMPANY_HEADER)).toBe(A);
    localStorage.removeItem("acting_company");
    expect(page.actingCompanyId()).toBe(A);
  });

  it("stays the one the page was loaded with when the switcher stores another before loading the page again", async () => {
    localStorage.setItem("acting_company", A);
    const page = await loadPage();
    page.actingCompanyId();
    // The save a page sends as it is left goes to the company it was typed in.
    page.setActingCompanyId(B);
    expect(page.withActingCompany(new Headers()).get(page.ACTING_COMPANY_HEADER)).toBe(A);
    expect((await loadPage()).actingCompanyId()).toBe(B);
  });

  it("is dropped for the page as well when cleared (a sign-in, a sign-out, a company no longer there)", async () => {
    localStorage.setItem("acting_company", A);
    const page = await loadPage();
    expect(page.actingCompanyId()).toBe(A);
    page.clearActingCompany();
    expect(page.actingCompanyId()).toBeNull();
    expect(localStorage.getItem("acting_company")).toBeNull();
  });

  it("is nothing when the storage is refused", async () => {
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
    const page = await loadPage();
    expect(() => page.setActingCompanyId("x")).not.toThrow();
    expect(page.actingCompanyId()).toBeNull();
  });
});
