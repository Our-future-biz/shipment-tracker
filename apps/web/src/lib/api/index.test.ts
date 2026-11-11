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
  return import("./index");
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

  it("goes out as the user and to the company the page was loaded with, whatever another tab stored since", async () => {
    const { authFetcher } = await loadPage();
    // Another tab signs in as Bob and chooses company B.
    localStorage.setItem("auth_token", "token-of-bob");
    localStorage.setItem("acting_company", "company-b");
    await authFetcher("http://api/quotes", { method: "PATCH" });
    const headers = sentHeaders(fetchMock);
    expect(headers.get("Authorization")).toBe("Bearer token-of-ann");
    expect(headers.get("X-Acting-Company")).toBe("company-a");
  });

  it("ends the page's session on a 401 even when another tab dropped the token meanwhile", async () => {
    const { authFetcher } = await loadPage();
    localStorage.removeItem("auth_token");
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await authFetcher("http://api/quotes");
    expect(sentHeaders(fetchMock).get("Authorization")).toBe("Bearer token-of-ann");
    expect(window.location.href).toBe("/login");
  });

  it("keeps a token another tab signed in with when the page's own is refused", async () => {
    const { authFetcher } = await loadPage();
    localStorage.setItem("auth_token", "token-of-bob");
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    await authFetcher("http://api/quotes");
    expect(localStorage.getItem("auth_token")).toBe("token-of-bob");
  });
});
