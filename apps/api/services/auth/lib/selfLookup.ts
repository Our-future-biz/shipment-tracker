// Who did something is stamped with the signed-in user's e-mail, looked up among the users of the company
// the request works in. A superadmin working as another company (X-Acting-Company) is no user of it: their
// own record is in their own company (AuthData.homeCompanyID). Pure, so the tenant rule is unit-tested.

/** The caller, as the auth handler hands it on. */
export interface LookupCaller {
  userID: string;
  /** The company the request works in. */
  companyID: string;
  /** The user's own company; unset on the app's own service calls. */
  homeCompanyID?: string;
}

/**
 * The company to look the caller themself up in besides the one the request works in: their own, only when
 * a superadmin works as another company, the caller is among `ids` and was not found already. Null
 * otherwise. Never any company but the caller's own, and never for anybody but the caller.
 */
export function ownCompanyToLookIn(caller: LookupCaller, ids: readonly string[], found: readonly { id: string }[]): string | null {
  const own = caller.homeCompanyID;
  if (!own || own === caller.companyID) return null;
  if (!caller.userID || !ids.includes(caller.userID)) return null;
  if (found.some((u) => u.id === caller.userID)) return null;
  return own;
}
