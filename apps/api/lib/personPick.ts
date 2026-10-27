import { APIError } from "encore.dev/api";
import { normaliseName } from "./personName";

export { normaliseName };

// A person picked anywhere in the app (person in charge, holiday cover, sales owner, …) is a user
// of the company, recorded by their e-mail. These pure helpers turn what a request or an old record
// holds into that e-mail, or refuse it. lib/companyUsers.ts loads the users.

export interface CompanyUser {
  id: string;
  email: string;
  displayName: string;
}

/** A user's e-mail as a picked person is stored: trimmed, lower case. */
export const storedEmail = (email: string): string => email.trim().toLowerCase();

/** The user `value` names by e-mail (any case); null when it is not a user's e-mail. */
export function userByEmail(value: string, users: CompanyUser[]): CompanyUser | null {
  const wanted = storedEmail(value);
  return (wanted && users.find((u) => u.email === wanted)) || null;
}

/**
 * The one user an old free-typed value means: their e-mail, display name or the part of the e-mail
 * before the @ (without regard to case or accents). Null when it fits nobody or more than one user:
 * a wrong guess would put somebody else's name on the record.
 */
export function matchUser(value: string, users: CompanyUser[]): CompanyUser | null {
  const byEmail = userByEmail(value, users);
  if (byEmail) return byEmail;
  const wanted = normaliseName(value);
  if (!wanted) return null;
  const matches = users.filter((u) => [u.displayName, u.email, u.email.split("@")[0]!].some((n) => normaliseName(n) === wanted));
  return matches.length === 1 ? matches[0]! : null;
}

/**
 * The e-mail to store for a picked person: "" for nobody, else the e-mail of a user of the company
 * (lower-cased). Anything else is refused, naming the field.
 */
export function requireUserEmail(value: string | null | undefined, label: string, users: CompanyUser[]): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  const user = userByEmail(raw, users);
  if (!user) throw APIError.invalidArgument(`${label}: pick a user of the company (by e-mail)`);
  return user.email;
}
