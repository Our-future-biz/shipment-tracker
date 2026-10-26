import log from "encore.dev/log";
import { auth } from "~encore/clients";

/** The name recorded for a user: the display name, the e-mail when there is none. */
export function nameOf(user: { displayName: string; email: string }): string {
  return user.displayName || user.email || "";
}

/**
 * Display names of everyone in the caller's company, by user id. Users live in the auth
 * service, which no other database can join against, so they are resolved in one call and
 * mapped in memory. An unresolvable user must not fail the request: callers get "" (or their
 * own placeholder) for them, and the failure is logged.
 */
export async function userNames(): Promise<Map<string, string>> {
  try {
    const { users } = await auth.usersList();
    return new Map(users.map((u) => [u.id, nameOf(u)]));
  } catch (err) {
    log.warn(err, "user names could not be loaded");
    return new Map();
  }
}

/**
 * Live users of the caller's company among `ids`, with their current role, by id. One small
 * call (not the whole company). Unknown or deactivated users are missing from the map; a
 * failed call is logged and gives an empty map.
 */
export async function userRefs(ids: string[]): Promise<Map<string, { name: string; email: string; role: string }>> {
  const wanted = [...new Set(ids.filter(Boolean))];
  if (!wanted.length) return new Map();
  try {
    const { users } = await auth.userLookup({ ids: wanted });
    return new Map(users.map((u) => [u.id, { name: u.name, email: u.email, role: u.role }]));
  } catch (err) {
    log.warn(err, "users could not be looked up");
    return new Map();
  }
}
