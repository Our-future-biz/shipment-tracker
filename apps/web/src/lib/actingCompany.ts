// A superadmin's company switcher: superadmins (a few platform users) see and change every company.
// The company they chose is kept in this browser and sent with every request (X-Acting-Company); the
// server then reads and writes that company, as one of its own users would, and ignores the header
// for anyone who is not a superadmin. No choice means the user's own company.

const KEY = "acting_company";

/** Where the choice is kept in the browser's storage (another tab changing it is watched for: lib/auth/pageSession). */
export const ACTING_COMPANY_KEY = KEY;

/** The header the API reads the choice from (lib/auth.handler.ts on the server). */
export const ACTING_COMPANY_HEADER = "X-Acting-Company";

function storedChoice(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

// This page's copy of the choice, read from the storage once, when the page loads. Every request of
// the page sends it: what the page shows, holds in its cache and still has to save is that
// company's. A choice made in another tab therefore never reaches this page's writes (they are held
// back and the page is loaded again, lib/auth/pageSession), and neither does one made here just
// before the page is loaded again - the save a quote sends as it is left still goes to the company
// it was typed in.
let pageChoice: string | null | undefined = typeof window === "undefined" ? undefined : storedChoice();

// The choice this page stored itself, if it did (the switcher, right before the page is loaded
// again): the storage then differs from what the page sends, and its requests still go out.
let choiceStoredHere: string | null | undefined;

function storeChoice(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused (private window): nothing can be kept, and the next page works as the user's own company.
  }
}

/** The company this page works as, as chosen when it loaded; null for the user's own. */
export function actingCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  if (pageChoice === undefined) pageChoice = storedChoice();
  return pageChoice;
}

/**
 * Keeps the choice for the pages loaded from now on (null: back to the user's own company). This
 * page goes on working as the company it was loaded with, so the caller loads the page again.
 */
export function setActingCompanyId(id: string | null): void {
  storeChoice(id);
  choiceStoredHere = id;
}

/** The choice this page stored itself with setActingCompanyId; undefined when it stored none. */
export function actingCompanyStoredHere(): string | null | undefined {
  return choiceStoredHere;
}

/** Back to the user's own company, for this page as well: a new sign-in, a sign-out, a choice the server no longer knows. */
export function clearActingCompany(): void {
  pageChoice = null;
  choiceStoredHere = undefined;
  storeChoice(null);
}

/** The request headers with this page's choice, when there is one. */
export function withActingCompany(headers: Headers): Headers {
  const id = actingCompanyId();
  if (id) headers.set(ACTING_COMPANY_HEADER, id);
  return headers;
}
