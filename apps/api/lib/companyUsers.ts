import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { storedEmail, type CompanyUser } from "./personPick";

export { matchUser, normaliseName, requireUserEmail, storedEmail, userByEmail, type CompanyUser } from "./personPick";

/** The live (non-system) users of the caller's company. Throws when they can't be loaded. */
export async function companyUsers(): Promise<CompanyUser[]> {
  const { users } = await auth.usersList();
  return users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName }));
}

/** The e-mail of the user `userId` (the signed-in one, typically) as it is stored; "" when it can't be looked up. */
export async function userEmailOf(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const { users } = await auth.userLookup({ ids: [userId] });
    return storedEmail(users.find((u) => u.id === userId)?.email ?? "");
  } catch (err) {
    log.warn(err, "user e-mail could not be looked up");
    return "";
  }
}
