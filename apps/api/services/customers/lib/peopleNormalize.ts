import { matchUser, type CompanyUser } from "../../../lib/personPick";

// A person picked anywhere is a user of the company, recorded by e-mail (owner decision,
// 26 Oct 2026). These pure plans say what the people normalize run changes in the Customer
// Database: the stored values are read grouped (one row per distinct value, with how many rows
// hold it) and each group is either rewritten to a user's e-mail or left as it is.

/** The sales owners of a company's live customers: owner user (null = none), the stored text, how many customers. */
export interface OwnerGroup {
  userId: string | null;
  label: string;
  count: number;
}

/** A distinct stored text (a note's author) and how many rows hold it. */
export interface ValueGroup {
  value: string;
  count: number;
}

export interface Unmatched {
  value: string;
  count: number;
}

export interface OwnerChange {
  /** The group as stored: only rows that still hold it are rewritten. */
  from: { userId: string | null; label: string };
  to: CompanyUser;
  count: number;
}

export interface ValueChange {
  from: string;
  /** The user's e-mail. */
  to: string;
  count: number;
}

/**
 * A customer linked to a user gets that user's e-mail as its owner text; a user who is no longer
 * in the company is left as stored. A customer with only a typed name is linked to the one user
 * the name means (matchUser) - or, naming nobody or several, left as it is and listed.
 */
export function planOwners(groups: OwnerGroup[], users: CompanyUser[]): { changes: OwnerChange[]; unmatched: Unmatched[] } {
  const changes: OwnerChange[] = [];
  const unmatched: Unmatched[] = [];
  for (const group of groups) {
    const from = { userId: group.userId, label: group.label };
    if (group.userId) {
      const user = users.find((u) => u.id === group.userId);
      if (user && group.label !== user.email) changes.push({ from, to: user, count: group.count });
      continue;
    }
    if (!group.label.trim()) continue;
    const user = matchUser(group.label, users);
    if (user) changes.push({ from, to: user, count: group.count });
    else unmatched.push({ value: group.label, count: group.count });
  }
  return { changes, unmatched };
}

/** A stored person text (a note's author) becomes the e-mail of the one user it means; any other stays and is listed. */
export function planValues(groups: ValueGroup[], users: CompanyUser[]): { changes: ValueChange[]; unmatched: Unmatched[] } {
  const changes: ValueChange[] = [];
  const unmatched: Unmatched[] = [];
  for (const group of groups) {
    if (!group.value.trim()) continue;
    const user = matchUser(group.value, users);
    if (!user) unmatched.push({ value: group.value, count: group.count });
    else if (group.value !== user.email) changes.push({ from: group.value, to: user.email, count: group.count });
  }
  return { changes, unmatched };
}
