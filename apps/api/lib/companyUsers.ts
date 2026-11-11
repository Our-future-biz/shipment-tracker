import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { storedEmail, type CompanyUser } from "./personPick";

export { matchUser, normaliseName, requireUserEmail, storedEmail, userByEmail, type CompanyUser } from "./personPick";

/** The live (non-system) users of the caller's company. Throws when they can't be loaded. */
export async function companyUsers(): Promise<CompanyUser[]> {
  const { users } = await auth.usersList();
  return users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName }));
}

/** The same users with their roles, for who may be told something. Throws when they can't be loaded. */
export async function companyUsersWithRoles(): Promise<(CompanyUser & { role: string })[]> {
  const { users } = await auth.usersList();
  return users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName, role: u.role }));
}

export const USER_LOOKUP_UNAVAILABLE = "Who you are could not be read just now — try again in a moment";

/**
 * The e-mail of the user `userId` (the signed-in one, typically: who created or decided something) as it
 * is stored. A user of the company the request works in - or the signed-in user themself, found in their
 * own company when a superadmin works as another one (auth selfInOwnCompany).
 *
 * "" only when there is no such user. When the lookup fails it throws unavailable: a write that records
 * who approved or created something must not record nobody because auth did not answer - it is refused,
 * to be tried again. A caller that only shows something catches.
 */
export async function userEmailOf(userId: string): Promise<string> {
  if (!userId) return "";
  let found: { id: string; email: string }[];
  try {
    ({ users: found } = await auth.userLookup({ ids: [userId], selfInOwnCompany: true }));
  } catch (err) {
    log.warn(err, "user e-mail could not be looked up");
    throw APIError.unavailable(USER_LOOKUP_UNAVAILABLE);
  }
  return storedEmail(found.find((u) => u.id === userId)?.email ?? "");
}
