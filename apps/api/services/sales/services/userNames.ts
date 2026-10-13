import { auth } from "~encore/clients";

/** The name Sales shows for a user: the display name, the e-mail when there is none. */
export function nameOf(user: { displayName: string; email: string }): string {
  return user.displayName || user.email || "";
}

/**
 * Display names of everyone in the caller's company, by user id - the name a task shows for its
 * assignee. Users live in the auth service, which this database cannot join against, so they are
 * resolved in one call and mapped in memory. An unresolvable user must not fail the request:
 * callers get "" for them.
 */
export async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, nameOf(u)]));
  } catch {
    return new Map();
  }
}
