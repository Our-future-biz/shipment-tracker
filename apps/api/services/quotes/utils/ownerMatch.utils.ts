// The owner of an old quote is a typed name (data.salesOwner). These functions find the user it
// means - or nobody: a wrong guess would hand a quote, and the right to delete it, to the wrong
// person.

import { normaliseName } from "../../../lib/personName";

export { normaliseName };

/**
 * The id of the one user a label names: the user whose display name, e-mail or the part of the
 * e-mail before the @ equals it. Null when it fits nobody or more than one user.
 */
export function matchOwnerLabel(
  label: string,
  users: { id: string; displayName: string; email: string }[],
): string | null {
  const wanted = normaliseName(label);
  if (!wanted) return null;
  const matches = users.filter((user) =>
    [user.displayName, user.email, user.email.split("@")[0]].some((name) => normaliseName(name) === wanted),
  );
  return matches.length === 1 ? matches[0].id : null;
}
