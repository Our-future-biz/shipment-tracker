import { matchUser, requireUserEmail, userByEmail, type CompanyUser } from "../../../lib/personPick";

// A person picked in the warehouse (a gate record's Shipment Owner, a position's assignee) is a
// user of the company, stored by their e-mail (owner decision 26 Oct 2026).

/**
 * The person to store from a user's request: "" or a user's e-mail. The record's current value is
 * accepted unchanged (an old name stays until somebody picks a user). The users are loaded only
 * when a new person has to be checked.
 */
export async function pickedUserFromRequest(
  value: string,
  current: string | null,
  label: string,
  loadUsers: () => Promise<CompanyUser[]>,
): Promise<string> {
  if (current !== null && value === current) return current;
  if (!value.trim()) return "";
  return requireUserEmail(value, label, await loadUsers());
}

/**
 * What a stored person becomes in the backfill: the e-mail of the one user an old value names, or
 * null when it stays as it is (empty, already a user's e-mail, or no single user fits).
 */
export function normalizedPerson(value: string, users: CompanyUser[]): string | null {
  if (!value.trim() || userByEmail(value, users)?.email === value) return null;
  const user = matchUser(value, users);
  return user && user.email !== value ? user.email : null;
}
