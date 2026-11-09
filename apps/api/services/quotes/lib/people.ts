import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { canDecideQuoteInquiry } from "../../../lib/salesPolicy";
import { companyUsers, storedEmail, userEmailOf, type CompanyUser } from "../../../lib/companyUsers";

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

/** The one who acts, as far as who they are matters here. */
export interface Caller {
  userID: string;
  role: string;
}

/**
 * The people with the caller's own e-mail among `emails` when the caller is a superadmin working as
 * another company, who is no user of it: what they do is stamped with it (the history, the owner of a
 * quote they create, an approval, a chat message). Only theirs, found in their own company
 * (lib/companyUsers userEmailOf); never anybody else outside the company. They are not added to
 * `users`, so nobody picks them as an owner or tags them.
 */
export async function withCaller<P extends People>(people: P, caller?: Caller): Promise<P> {
  if (!caller || caller.role !== "superadmin" || people.emails.has(caller.userID)) return people;
  const email = await userEmailOf(caller.userID);
  return email ? { ...people, emails: new Map(people.emails).set(caller.userID, email) } : people;
}

/**
 * The users of the caller's company (and `caller` as withCaller adds them). An unresolvable user must
 * not fail the request: when they cannot be read nobody is known (the failure is logged), as with
 * userNames().
 */
export async function companyPeople(caller?: Caller): Promise<People> {
  let people: People;
  try {
    people = peopleOf(await companyUsers());
  } catch (err) {
    log.warn(err, "users could not be loaded");
    people = peopleOf([]);
  }
  return withCaller(people, caller);
}

/** The people with what a quote inquiry asks of them: who manages Sales now, and whom each reports to. */
export interface Directory extends People {
  /** Live users who answer a margin inquiry now (canDecideQuoteInquiry); empty when the users could not be read. */
  managers: Set<string>;
  /** Whom each live user reports to ("Reports to"), by id. */
  reportsTo: Map<string, string | null>;
  roles: Map<string, string>;
}

/**
 * The users of the caller's company with their roles and managers, read once; nobody known when they
 * cannot be read (logged). `caller` as withCaller adds them: to `emails` only, never a manager here.
 */
export async function companyDirectory(caller?: Caller): Promise<Directory> {
  let directory: Directory;
  try {
    const { users } = await auth.usersList();
    directory = {
      ...peopleOf(users.map((u) => ({ id: u.id, email: storedEmail(u.email), displayName: u.displayName }))),
      managers: new Set(users.filter((u) => canDecideQuoteInquiry(u.role)).map((u) => u.id)),
      reportsTo: new Map(users.map((u) => [u.id, u.reportsToUserId ?? null])),
      roles: new Map(users.map((u) => [u.id, u.role])),
    };
  } catch (err) {
    log.warn(err, "users could not be loaded");
    directory = { ...peopleOf([]), managers: new Set(), reportsTo: new Map(), roles: new Map() };
  }
  return withCaller(directory, caller);
}
