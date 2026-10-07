import { auth } from "~encore/clients";

/**
 * Display names of everyone in the caller's company, by user id (e-mail when a user has
 * no display name). Users live in the auth service, which this database cannot join
 * against, so they are resolved in one call and mapped in memory. An unresolvable user
 * must not fail the read — callers fall back to their own placeholder.
 */
export async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, u.displayName || u.email || ""]));
  } catch {
    return new Map();
  }
}
