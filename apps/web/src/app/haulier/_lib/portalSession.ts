// The haulier portal's session token, kept in the tab's sessionStorage only: it ends with the tab,
// never sits in localStorage beside the app's own login, and is never shown on screen. Storage can
// be missing or refuse (private mode, blocked site data), so every access is wrapped and a failure
// reads as "not signed in". Tested in portalSession.test.ts.

export const PORTAL_SESSION_KEY = "haulier_portal_session";

/** Where the portal sends whoever is not (or no longer) signed in. */
export const PORTAL_LOGIN_PATH = "/haulier/portal/login";

type SessionStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const browserStore = (): SessionStore | null => {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

/** The stored session token, or null when there is none or storage cannot be read. */
export function readPortalSession(store: SessionStore | null = browserStore()): string | null {
  try {
    const token = store?.getItem(PORTAL_SESSION_KEY) ?? null;
    return token && token.trim() ? token : null;
  } catch {
    return null;
  }
}

/** Keeps the token for this tab; false when storage refused it (the user then cannot stay signed in). */
export function savePortalSession(token: string, store: SessionStore | null = browserStore()): boolean {
  try {
    if (!store) return false;
    store.setItem(PORTAL_SESSION_KEY, token);
    return true;
  } catch {
    return false;
  }
}

/** Forgets the token (logout, any 401). */
export function clearPortalSession(store: SessionStore | null = browserStore()): void {
  try {
    store?.removeItem(PORTAL_SESSION_KEY);
  } catch {
    // Nothing stored that could be read either.
  }
}
