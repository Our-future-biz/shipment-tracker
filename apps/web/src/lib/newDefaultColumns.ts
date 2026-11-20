// New default columns reach only a user who never saved a column set of their own (mock council
// S9-2): a set once saved is kept as it is. Such a user is told once that the list has new defaults
// and how to take them; the notice stays away once they took them or dismissed it, until the
// defaults change again (a new `version`).

/** Where a user's "seen" mark for a list's notice is kept, in this browser. */
export const newDefaultsSeenKey = (scope: string, userId: string) => `${scope}:newDefaultsSeen:${userId}`;

const sameColumns = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((key, i) => key === b[i]);

/**
 * Whether to tell the user about the new defaults: they keep a set of their own (`own`, null for
 * none) that is not the defaults, and have not seen the notice for this `version` of them (`seen`,
 * the version they last saw it for).
 */
export function tellsNewDefaults(own: readonly string[] | null, defaults: readonly string[], seen: string | null, version: string): boolean {
  return !!own && own.length > 0 && !sameColumns(own, defaults) && seen !== version;
}
