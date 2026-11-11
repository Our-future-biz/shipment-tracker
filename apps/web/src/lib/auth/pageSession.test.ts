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
  return import("./pageSession");
};

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

  describe("a change another tab makes to the storage", () => {
    it("changes it when the token is another: a sign-out, a sign-in, another user", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      const page = await loadPage();
      expect(page.changesPageSession("auth_token", null)).toBe(true);
      expect(page.changesPageSession("auth_token", "token-of-bob")).toBe(true);
      expect(page.changesPageSession("auth_token", "token-of-ann")).toBe(false);
    });

    it("changes the login page's when another tab signs in", async () => {
      const page = await loadPage();
      expect(page.changesPageSession("auth_token", "token-of-ann")).toBe(true);
      expect(page.changesPageSession("auth_token", null)).toBe(false);
    });

    it("changes it when another company is chosen to work as, or the choice is dropped", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      localStorage.setItem("acting_company", "company-a");
      const page = await loadPage();
      expect(page.changesPageSession("acting_company", "company-b")).toBe(true);
      expect(page.changesPageSession("acting_company", null)).toBe(true);
      expect(page.changesPageSession("acting_company", "company-a")).toBe(false);
    });

    it("changes it when the whole storage is cleared while the page has a session", async () => {
      expect((await loadPage()).changesPageSession(null, null)).toBe(false);
      localStorage.setItem("auth_token", "token-of-ann");
      expect((await loadPage()).changesPageSession(null, null)).toBe(true);
    });

    it("leaves it alone when anything else is stored (column widths, the sidebar)", async () => {
      localStorage.setItem("auth_token", "token-of-ann");
      const page = await loadPage();
      expect(page.changesPageSession("sidebar-collapsed", "true")).toBe(false);
    });
  });
});
