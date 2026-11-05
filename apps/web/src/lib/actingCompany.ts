// A superadmin's company switcher: superadmins (a few platform users) see and change every company.
// The company they chose is kept in this browser and sent with every request (X-Acting-Company); the
// server then reads and writes that company, as one of its own users would, and ignores the header
// for anyone who is not a superadmin. No choice means the user's own company.

const KEY = "acting_company";

/** The header the API reads the choice from (lib/auth.handler.ts on the server). */
export const ACTING_COMPANY_HEADER = "X-Acting-Company";

/** The company chosen to work as, or null for the user's own. */
export function actingCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

/** Keeps the choice (null: back to the user's own company). The page is loaded again by the caller. */
export function setActingCompanyId(id: string | null): void {
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage refused (private window): the choice lasts until the page is left.
  }
}

/** The request headers with the choice, when there is one. */
export function withActingCompany(headers: Headers): Headers {
  const id = actingCompanyId();
  if (id) headers.set(ACTING_COMPANY_HEADER, id);
  return headers;
}
