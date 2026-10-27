import log from "encore.dev/log";
import { companyUsers, type CompanyUser } from "../../../lib/companyUsers";

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
