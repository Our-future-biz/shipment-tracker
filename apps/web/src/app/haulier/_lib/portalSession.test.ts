import { describe, expect, it } from "vitest";
import { PORTAL_LOGIN_HINT_KEY, PORTAL_SESSION_KEY, clearPortalSession, readPortalLoginHint, readPortalSession, savePortalLoginHint, savePortalSession } from "./portalSession";

const memoryStore = () => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
};

const brokenStore = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("quota");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

describe("portal session storage", () => {
  it("keeps, reads and forgets the token under its own key", () => {
    const store = memoryStore();
    expect(readPortalSession(store)).toBeNull();
    expect(savePortalSession("tok-1", store)).toBe(true);
    expect(store.data.get(PORTAL_SESSION_KEY)).toBe("tok-1");
    expect(readPortalSession(store)).toBe("tok-1");
    clearPortalSession(store);
    expect(readPortalSession(store)).toBeNull();
  });

  it("reads a blank token as none", () => {
    const store = memoryStore();
    store.setItem(PORTAL_SESSION_KEY, "  ");
    expect(readPortalSession(store)).toBeNull();
  });

  it("treats storage that refuses or is missing as signed out, without throwing", () => {
    expect(readPortalSession(brokenStore)).toBeNull();
    expect(savePortalSession("tok", brokenStore)).toBe(false);
    expect(() => clearPortalSession(brokenStore)).not.toThrow();
    expect(readPortalSession(null)).toBeNull();
    expect(savePortalSession("tok", null)).toBe(false);
  });
});

describe("the sign-in's note of whose account it is (user council E15)", () => {
  it("keeps the forwarder and the account's e-mail for the sign-in of this tab, nothing else", () => {
    const store = memoryStore();
    expect(readPortalLoginHint(store)).toBeNull();
    savePortalLoginHint({ ourCompany: "Austromar", email: "radek@hopi.test", ...{ password: "never" } } as never, store);
    expect(JSON.parse(store.data.get(PORTAL_LOGIN_HINT_KEY)!)).toEqual({ ourCompany: "Austromar", email: "radek@hopi.test" });
    expect(readPortalLoginHint(store)).toEqual({ ourCompany: "Austromar", email: "radek@hopi.test" });
  });

  it("reads nothing from a broken, missing or foreign note", () => {
    const store = memoryStore();
    store.setItem(PORTAL_LOGIN_HINT_KEY, "{not json");
    expect(readPortalLoginHint(store)).toBeNull();
    store.setItem(PORTAL_LOGIN_HINT_KEY, JSON.stringify({ ourCompany: 1, email: "x" }));
    expect(readPortalLoginHint(store)).toBeNull();
    expect(readPortalLoginHint(brokenStore)).toBeNull();
    expect(() => savePortalLoginHint({ ourCompany: "A", email: "b" }, brokenStore)).not.toThrow();
    expect(readPortalLoginHint(null)).toBeNull();
  });
});
