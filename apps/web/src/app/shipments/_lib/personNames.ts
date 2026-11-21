// People are stored by e-mail (owner decision, 26 Oct 2026) but shown by name wherever the app has
// the name (user council x4, owner's answer): the company's users, as the pickers read them
// (useUsers), give each e-mail its name. An e-mail no user has, or a user with no name, shows as
// it is stored, so nothing is hidden.

import { splitPersonStamp } from "./personFields";

/** Each user's name by their e-mail in lower case; users with no name are left out. */
export type PeopleNames = ReadonlyMap<string, string>;

export const NO_NAMES: PeopleNames = new Map();

export function namesOf(users: readonly { email: string; displayName?: string | null }[]): PeopleNames {
  const names = new Map<string, string>();
  for (const u of users) {
    const name = (u.displayName ?? "").trim();
    const email = u.email.trim().toLowerCase();
    if (name && email) names.set(email, name);
  }
  return names;
}

/** How a stored person reads: the user's name, else the value as it is stored ("" stays ""). */
export const nameOf = (value: string | null | undefined, names: PeopleNames): string => {
  const stored = (value ?? "").trim();
  return names.get(stored.toLowerCase()) ?? stored;
};

/** The e-mail to show beside a name (as a hover), or "" when the name shown already is the stored value. */
export const emailBehind = (value: string | null | undefined, names: PeopleNames): string => {
  const stored = (value ?? "").trim();
  return names.has(stored.toLowerCase()) ? stored : "";
};

/**
 * A person as text for the list's Filters and its CSV export: the name with the stored e-mail in
 * brackets ("Eva Malá (eva@firm.cz)"), so a filter finds the person by either and the export reads as
 * the cell does (mock test S21-061). A value no named user has stays as it is stored.
 */
export const personText = (value: string | null | undefined, names: PeopleNames): string => {
  const email = emailBehind(value, names);
  return email ? `${nameOf(value, names)} (${email})` : (value ?? "").trim();
};

/**
 * A person field or a server stamp as the job page shows it (user council x4): who by name - a stamp's
 * date after it as it is stored ("Eva Malá — 26. 10. 2026 14:03:05") - and the e-mail for the hover.
 * A value no user's e-mail is shows as it is stored, with no e-mail beside it.
 */
export function personShown(value: string | null | undefined, names: PeopleNames): { text: string; email: string } {
  const stored = (value ?? "").trim();
  const { person, when } = splitPersonStamp(stored);
  const email = emailBehind(person, names);
  if (!email) return { text: stored, email: "" };
  const name = nameOf(person, names);
  return { text: when ? `${name} — ${when}` : name, email };
}
