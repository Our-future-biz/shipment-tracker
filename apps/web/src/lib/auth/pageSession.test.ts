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

// A page loaded: the modules come fresh, as they do with every page load.
const loadPage = async () => {
  vi.resetModules();
  const session = await import("./pageSession");
  const acting = await import("@/lib/actingCompany");
  return { ...session, ...acting };
};

const ANN = { token: "token-of-ann", company: "company-a" };

describe("the session a page works in", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("localStorage", fakeStorage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the token it was loaded with when another tab signs out or signs in as someone else", async () => {
    localStorage.setItem("auth_token", "token-of-ann");
    const page = await loadPage();
    expect(page.sessionToken()).toBe("token-of-ann");
    localStorage.removeItem("auth_token");
    expect(page.sessionToken()).toBe("token-of-ann");
    localStorage.setItem("auth_token", "token-of-bob");
    expect(page.sessionToken()).toBe("token-of-ann");
    expect((await loadPage()).sessionToken()).toBe("token-of-bob");
  });

  it("takes the token of a sign-in in the page itself, and stores it for the next pages", async () => {
    const page = await loadPage();
    expect(page.sessionToken()).toBeNull();
    page.startSession("token-of-ann");
    expect(page.sessionToken()).toBe("token-of-ann");
    expect(localStorage.getItem("auth_token")).toBe("token-of-ann");
  });

  it("drops its token when its session ends, but not one another tab signed in with since", async () => {
    localStorage.setItem("auth_token", "token-of-ann");
    const page = await loadPage();
    page.sessionToken();
    page.dropSessionToken();
    expect(page.sessionToken()).toBeNull();
    expect(localStorage.getItem("auth_token")).toBeNull();

    localStorage.setItem("auth_token", "token-of-ann");
    const stale = await loadPage();
    stale.sessionToken();
    localStorage.setItem("auth_token", "token-of-bob");
    stale.dropSessionToken();
    expect(stale.sessionToken()).toBeNull();
    expect(localStorage.getItem("auth_token")).toBe("token-of-bob");
  });

  describe("the check of a stored session", () => {
    it("ends it only when the server refuses the token", async () => {
      const page = await loadPage();
      expect(page.sessionCheckOutcome(401)).toBe("ended");
      expect(page.sessionCheckOutcome(200)).toBe("valid");
    });

    it("keeps it when the server does not answer, or answers with an error of its own (a cold start)", async () => {
      const page = await loadPage();
      expect(page.sessionCheckOutcome(null)).toBe("unreachable");
      for (const status of [500, 502, 503, 504, 404]) expect(page.sessionCheckOutcome(status)).toBe("unreachable");
    });
  });

  describe("whether the storage still holds the page's session (its requests are sent, or held back and the page reloaded)", () => {
    it("holds it while nothing changed", async () => {
      const { sessionStillStored } = await loadPage();
      expect(sessionStillStored(ANN, ANN)).toBe(true);
      expect(sessionStillStored({ token: null, company: null }, { token: null, company: null })).toBe(true);
    });

    it("does not once another tab signed out, or signed in as anyone", async () => {
      const { sessionStillStored } = await loadPage();
      expect(sessionStillStored(ANN, { ...ANN, token: null })).toBe(false);
      expect(sessionStillStored(ANN, { ...ANN, token: "token-of-bob" })).toBe(false);
      // The login page, when another tab signs in.
      expect(sessionStillStored({ token: null, company: null }, { token: "token-of-ann", company: null })).toBe(false);
    });

    it("does not once another tab chose another company, or went back to the own one", async () => {
      const { sessionStillStored } = await loadPage();
      expect(sessionStillStored(ANN, { ...ANN, company: "company-b" })).toBe(false);
      expect(sessionStillStored(ANN, { ...ANN, company: null })).toBe(false);
    });

    it("does while the company stored is the one this page chose itself, before it is loaded again", async () => {
      const { sessionStillStored } = await loadPage();
      expect(sessionStillStored(ANN, { ...ANN, company: "company-b" }, { companyStoredHere: "company-b" })).toBe(true);
      expect(sessionStillStored(ANN, { ...ANN, company: null }, { companyStoredHere: null })).toBe(true);
      // Another tab chose yet another company after it.
      expect(sessionStillStored(ANN, { ...ANN, company: "company-c" }, { companyStoredHere: "company-b" })).toBe(false);
      // The exception is the company only: a sign-out elsewhere still holds the requests back.
      expect(sessionStillStored(ANN, { token: null, company: "company-b" }, { companyStoredHere: "company-b" })).toBe(false);
    });

    it("does when this page's sign-in could not be stored: no other tab ever had its token", async () => {
      const { sessionStillStored } = await loadPage();
      expect(sessionStillStored(ANN, { ...ANN, token: null }, { tokenShared: false })).toBe(true);
    });
  });

  describe("the storage as the page finds it", () => {
    it("holds the page's session while nobody changed it", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      localStorage.setItem("acting_company", "company-a");
      const page = await loadPage();
      expect(page.pageSessionChanged()).toBe(false);
      localStorage.setItem("sidebar-collapsed", "true");
      expect(page.pageSessionChanged()).toBe(false);
    });

    it("holds another session once another tab signed out or chose another company", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      localStorage.setItem("acting_company", "company-a");
      const page = await loadPage();
      localStorage.setItem("acting_company", "company-b");
      expect(page.pageSessionChanged()).toBe(true);
      localStorage.setItem("acting_company", "company-a");
      localStorage.removeItem("auth_token");
      expect(page.pageSessionChanged()).toBe(true);
    });

    it("holds this page's session still after its own switch, a sign-in or a sign-out in it", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      localStorage.setItem("acting_company", "company-a");
      const page = await loadPage();
      page.setActingCompanyId("company-b");
      expect(page.pageSessionChanged()).toBe(false);
      page.clearActingCompany();
      page.startSession("token-of-bob");
      expect(page.pageSessionChanged()).toBe(false);
      page.dropSessionToken();
      expect(page.pageSessionChanged()).toBe(false);
    });

    it("tells whoever listens when a request found the session changed", async () => {
      const page = await loadPage();
      const listener = vi.fn();
      const unsubscribe = page.onPageSessionChange(listener);
      page.reportPageSessionChange();
      unsubscribe();
      page.reportPageSessionChange();
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
