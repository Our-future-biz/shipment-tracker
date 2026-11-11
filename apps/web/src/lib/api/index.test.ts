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

// A page loaded with Ann signed in, working as company A.
const loadPage = async () => {
  vi.resetModules();
  localStorage.setItem("auth_token", "token-of-ann");
  localStorage.setItem("acting_company", "company-a");
  const api = await import("./index");
  const session = await import("@/lib/auth/pageSession");
  const acting = await import("@/lib/actingCompany");
  return { ...api, ...session, ...acting };
};

const sentHeaders = (fetchMock: ReturnType<typeof vi.fn>) => new Headers((fetchMock.mock.calls[0]![1] as RequestInit).headers);

describe("a request of the page", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.stubGlobal("window", { location: { pathname: "/sales/quote/QCZ1", href: "/sales/quote/QCZ1" } });
    vi.stubGlobal("localStorage", fakeStorage());
    fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("goes out as the user and to the company the page was loaded with", async () => {
    const { authFetcher } = await loadPage();
    await authFetcher("http://api/quotes", { method: "PATCH" });
    const headers = sentHeaders(fetchMock);
    expect(headers.get("Authorization")).toBe("Bearer token-of-ann");
    expect(headers.get("X-Acting-Company")).toBe("company-a");
  });

  it.each([
    ["signs out", () => localStorage.removeItem("auth_token")],
    ["signs in as someone else", () => localStorage.setItem("auth_token", "token-of-bob")],
    ["chooses another company", () => localStorage.setItem("acting_company", "company-b")],
  ])("is not sent once another tab %s, and the page is told to load again", async (_, changeElsewhere) => {
    const page = await loadPage();
    const reload = vi.fn();
    page.onPageSessionChange(reload);
    changeElsewhere();
    await expect(page.authFetcher("http://api/quotes", { method: "PATCH" })).rejects.toMatchObject({ message: page.SESSION_CHANGED_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();
  });

  it("still goes out as the company before after the page's own switch, until the page is loaded again", async () => {
    const { authFetcher, setActingCompanyId } = await loadPage();
    setActingCompanyId("company-b");
    await authFetcher("http://api/quotes", { method: "PATCH", keepalive: true });
    expect(sentHeaders(fetchMock).get("X-Acting-Company")).toBe("company-a");
  });

  it("ends the page's session on a 401 to its token", async () => {
    const { authFetcher } = await loadPage();
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await authFetcher("http://api/quotes");
    expect(window.location.href).toBe("/login");
    expect(localStorage.getItem("auth_token")).toBeNull();
  });
});
