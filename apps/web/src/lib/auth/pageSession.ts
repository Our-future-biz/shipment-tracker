// The session this page works in: the signed-in user's token and the company a superadmin chose to
// work as (lib/actingCompany). Both are kept in the browser's storage, which every tab shares, but
// each page reads them once, when it loads, and keeps its own copy: its screens, its cache and the
// saves it still has to send are of that user and that company. A sign-out and sign-in, or another
// company chosen, in another tab changes the storage only. This page then sends nothing more - every
// request first checks the storage still holds its session, as a page asleep or restored from the
// browser's cache may have missed the change - and is loaded again (components/SessionChangedNotice).

import { ACTING_COMPANY_KEY, actingCompanyId, actingCompanyStoredHere } from "@/lib/actingCompany";

const KEY = "auth_token";

// What the storage holds under a key; undefined when it cannot be read at all (storage refused).
function readStorage(key: string): string | null | undefined {
  try {
    return localStorage.getItem(key) || null;
  } catch {
    return undefined;
  }
}

// This page's copy of the token: read from the storage when the page loads, then changed only by a
// sign-in or a sign-out in this page.
let pageToken: string | null | undefined = typeof window === "undefined" ? undefined : (readStorage(KEY) ?? null);

// False when this page's sign-in could not be stored (storage full or refused): no other tab ever
// had that token, so what the storage holds says nothing about it.
let tokenShared = true;

/** The token this page signs its requests with: the one stored when it loaded, or the one it signed in with since. */
export function sessionToken(): string | null {
  if (typeof window === "undefined") return null;
  if (pageToken === undefined) pageToken = readStorage(KEY) ?? null;
  return pageToken;
}

/** A sign-in in this page: the token is this page's, and the next pages' too. */
export function startSession(token: string): void {
  pageToken = token;
  try {
    localStorage.setItem(KEY, token);
    tokenShared = true;
  } catch {
    // Storage full or refused (private window): the session lasts while this page does.
    tokenShared = false;
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

/** What the check of a stored session (/auth/me) found out. */
export type SessionCheck = "valid" | "ended" | "unreachable";

/**
 * What the check's answer says, by its HTTP status (null: no answer came - no connection, or it took
 * too long). Only a 401 ends the session; a server that does not answer, or answers with an error
 * of its own (starting up, down, a gateway's error page), says nothing about it.
 */
export function sessionCheckOutcome(status: number | null): SessionCheck {
  if (status === 401) return "ended";
  return status !== null && status >= 200 && status < 300 ? "valid" : "unreachable";
}

/** A session: the token and the company to work as (null: the user's own). */
export interface SessionCopy {
  token: string | null;
  company: string | null;
}

/** What this page itself did to the storage, which may then differ from what the page sends. */
export interface StoredHere {
  /** The company choice this page stored itself (the switcher, just before the page is loaded again); undefined for none. */
  companyStoredHere?: string | null;
  /** False when this page's sign-in could not be stored. */
  tokenShared?: boolean;
}

/**
 * Whether the storage still holds the session the page works in, so its requests may go out: the
 * same token - none stored is a sign-out elsewhere, another one a sign-in elsewhere - and the same
 * company to work as. The one exception is a company this page stored itself: the switcher stores
 * the choice and then loads the page again, and what the page sends as it goes (a quote's last
 * change) still goes out as the company it was typed in.
 */
export function sessionStillStored(page: SessionCopy, stored: SessionCopy, here: StoredHere = {}): boolean {
  const sameToken = here.tokenShared === false || stored.token === page.token;
  const sameCompany = stored.company === page.company || (here.companyStoredHere !== undefined && stored.company === here.companyStoredHere);
  return sameToken && sameCompany;
}

/**
 * Whether the storage now holds another session than the one this page works in: another tab
 * signed out, signed in or chose another company. False when the storage cannot be read: nothing
 * is shared with other tabs then.
 */
/** Why a request of a page whose session changed in another tab was not sent (lib/api's authFetcher). */
export const SESSION_CHANGED_MESSAGE = "your session changed in another tab - the page is loaded again";

export function pageSessionChanged(): boolean {
  if (typeof window === "undefined") return false;
  const token = readStorage(KEY);
  const company = readStorage(ACTING_COMPANY_KEY);
  if (token === undefined || company === undefined) return false;
  return !sessionStillStored(
    { token: sessionToken(), company: actingCompanyId() },
    { token, company },
    { companyStoredHere: actingCompanyStoredHere(), tokenShared },
  );
}

// Whoever shows that the session changed and loads the page again (components/SessionChangedNotice).
const changeListeners = new Set<() => void>();

/** Calls `listener` when a request finds the page's session changed; returns the unsubscribe. */
export function onPageSessionChange(listener: () => void): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

/** Tells the listeners the page's session changed (a request found it so, and was not sent). */
export function reportPageSessionChange(): void {
  changeListeners.forEach((listener) => listener());
}
