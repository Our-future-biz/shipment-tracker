// A person picked anywhere in the app is one of the company's users, recorded and shown by their
// e-mail (owner decision, 26 Oct 2026). Typing a name finds them; the e-mail is what is stored.
// The API refuses anything else (api/lib/personPick.ts).

import { fold } from "./fold";

export interface PickableUser {
  id: string;
  email: string;
  displayName: string;
}

/** The user `value` names by e-mail (any case); null for "" or anything that is not a user's e-mail. */
export function userByEmail<U extends PickableUser>(value: string | null | undefined, users: readonly U[]): U | null {
  const wanted = (value ?? "").trim().toLowerCase();
  return (wanted && users.find((u) => u.email.toLowerCase() === wanted)) || null;
}

/** A stored value that is not empty and is no user's e-mail: an old name or free text to be picked again. */
export function isUnlinkedPerson(value: string | null | undefined, users: readonly PickableUser[]): boolean {
  return !!(value ?? "").trim() && !userByEmail(value, users);
}

/** Whether the user fits what was typed: every word in their name or e-mail, ignoring case and accents. */
export function userMatches(user: PickableUser, typed: string): boolean {
  const haystack = fold(`${user.displayName} ${user.email}`);
  return fold(typed)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** The users in the order a picker lists them: by name, then e-mail (Czech order). */
export function sortedUsers<U extends PickableUser>(users: readonly U[]): U[] {
  return [...users].sort(
    (a, b) =>
      (a.displayName || a.email).localeCompare(b.displayName || b.email, "cs", { sensitivity: "base" }) ||
      a.email.localeCompare(b.email),
  );
}
