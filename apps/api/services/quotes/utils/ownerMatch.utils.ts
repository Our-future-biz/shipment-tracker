// The owner of an old quote is a typed name (data.salesOwner). These functions find the user it
// means - or nobody: a wrong guess would hand a quote, and the right to delete it, to the wrong
// person.

import { matchUser, type CompanyUser } from "../../../lib/personPick";

/**
 * The id of the one user a label names: the user whose e-mail, display name or the part of the
 * e-mail before the @ equals it (matchUser, the rule every typed person is matched by). Null when
 * it fits nobody or more than one user.
 */
export function matchOwnerLabel(label: string, users: CompanyUser[]): string | null {
  return matchUser(label, users)?.id ?? null;
}
