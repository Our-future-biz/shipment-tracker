import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { companyUsers, storedEmail, type CompanyUser } from "../../../lib/companyUsers";

/**
 * The company's users as Sales records and shows them: by e-mail, by user id - who did what in a
 * quote's history, its owner, who approved or asked. A person is recorded by e-mail everywhere.
 */
export interface People {
  users: CompanyUser[];
  emails: Map<string, string>;
}

export function peopleOf(users: CompanyUser[]): People {
  return { users, emails: new Map(users.map((u) => [u.id, u.email])) };
}

/**
 * The users of the caller's company. An unresolvable user must not fail the request: when they
 * cannot be read nobody is known (the failure is logged), as with userNames().
 */
export async function companyPeople(): Promise<People> {
  try {
    return peopleOf(await companyUsers());
  } catch (err) {
    log.warn(err, "users could not be loaded");
    return peopleOf([]);
  }
}

/** The people with what a quote inquiry asks of them: who manages Sales now, and whom each reports to. */
export interface Directory extends People {
  /** Live users who answer a margin inquiry now (canDecideQuoteInquiry); empty when the users could not be read. */
  managers: Set<string>;
  /** Whom each live user reports to ("Reports to"), by id. */
  reportsTo: Map<string, string | null>;
  roles: Map<string, string>;
}

/** The users of the caller's company with their roles and managers, read once; nobody known when they cannot be read (logged). */
export async function companyDirectory(): Promise<Directory> {
  try {
    const { users } = await auth.usersList();
    return {
      ...peopleOf(users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName }))),
      managers: new Set(users.filter((u) => canDecideQuoteInquiry(u.role)).map((u) => u.id)),
      reportsTo: new Map(users.map((u) => [u.id, u.reportsToUserId ?? null])),
      roles: new Map(users.map((u) => [u.id, u.role])),
    };
  } catch (err) {
    log.warn(err, "users could not be loaded");
    return { ...peopleOf([]), managers: new Set(), reportsTo: new Map(), roles: new Map() };
  }
}
