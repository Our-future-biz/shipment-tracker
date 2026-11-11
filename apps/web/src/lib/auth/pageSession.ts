// The session this page works in: the signed-in user's token and the company a superadmin chose to
// work as (lib/actingCompany). Both are kept in the browser's storage, which every tab shares, but
// each page reads them once, when it loads, and keeps its own copy: its screens, its cache and the
// saves it still has to send are of that user and that company. A sign-out and sign-in, or another
// company chosen, in another tab changes the storage only; this page is loaded again then
// (components/SessionChangedNotice) and, until it is, its requests still go out as what it shows.

import { ACTING_COMPANY_KEY, actingCompanyId } from "@/lib/actingCompany";

const KEY = "auth_token";

function storedToken(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

// This page's copy of the token: read from the storage when the page loads, then changed only by a
// sign-in or a sign-out in this page.
let pageToken: string | null | undefined = typeof window === "undefined" ? undefined : storedToken();

/** The token this page signs its requests with: the one stored when it loaded, or the one it signed in with since. */
export function sessionToken(): string | null {
  if (typeof window === "undefined") return null;
  if (pageToken === undefined) pageToken = storedToken();
  return pageToken;
}

/** A sign-in in this page: the token is this page's, and the next pages' too. */
export function startSession(token: string): void {
  pageToken = token;
  try {
    localStorage.setItem(KEY, token);
  } catch {
    // Storage refused (private window): the session lasts while this page does.
  }
}

/**
 * This page's session is over: signed out, or refused by the server. The stored token goes with it
 * only while it is still this page's - one another tab signed in with since is that tab's session.
 */
export function dropSessionToken(): void {
  const mine = sessionToken();
  pageToken = null;
  try {
    if (localStorage.getItem(KEY) === mine) localStorage.removeItem(KEY);
  } catch {
    // Storage refused: there is nothing stored to drop.
  }
}

/**
 * Whether a change another tab made to the storage (a `storage` event's key and new value) changes
 * the session this page works in: another token - a sign-out, a sign-in, another user - or another
 * company to work as. A key of null is the whole storage cleared.
 */
export function changesPageSession(key: string | null, newValue: string | null): boolean {
  const value = newValue || null;
  if (key === null) return sessionToken() !== null || actingCompanyId() !== null;
  if (key === KEY) return value !== sessionToken();
  if (key === ACTING_COMPANY_KEY) return value !== actingCompanyId();
  return false;
}
