import log from "encore.dev/log";
import { auth } from "~encore/clients";
import type { CompanyUser } from "./personPick";

export { matchUser, normaliseName, requireUserEmail, userByEmail, type CompanyUser } from "./personPick";

/** The live (non-system) users of the caller's company. Throws when they can't be loaded. */
export async function companyUsers(): Promise<CompanyUser[]> {
  const { users } = await auth.usersList();
  return users.map((u) => ({ id: u.id, email: u.email.trim().toLowerCase(), displayName: u.displayName }));
}

/** The e-mail of the user `userId` (the signed-in one, typically); "" when it can't be looked up. */
export async function userEmailOf(userId: string): Promise<string> {
  if (!userId) return "";
  try {
    const { users } = await auth.userLookup({ ids: [userId] });
    return users.find((u) => u.id === userId)?.email ?? "";
  } catch (err) {
    log.warn(err, "user e-mail could not be looked up");
    return "";
  }
}
