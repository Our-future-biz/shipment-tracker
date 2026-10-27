import { userByEmail, type PickableUser } from "@/lib/people";

/**
 * The quote's owner as the customer reads them - "Prepared by" and the signature on the quotation,
 * {sender} in the e-mail: by name. Inside the app a person is recorded and shown by e-mail
 * (data.salesOwner holds the owner's e-mail), but these are written for the customer, so the
 * user's display name takes its place. An old typed name is a name and is given as it is. An
 * e-mail of nobody among `users` - somebody who left, or the users not loaded - is never handed to
 * the customer in place of a name: "" (no "Prepared by"; the e-mail signs as "Sales").
 */
export function ownerNameForCustomer(salesOwner: string | null | undefined, users: readonly PickableUser[]): string {
  const owner = (salesOwner ?? "").trim();
  const user = userByEmail(owner, users);
  if (user) return user.displayName.trim() || user.email;
  return isEmail(owner) ? "" : owner;
}

/**
 * Whether the quotation has to wait for the company's users before it names its owner: the owner
 * is recorded by an e-mail, and the users that give the name are still loading.
 */
export function ownerNameLoading(salesOwner: string | null | undefined, usersLoading: boolean): boolean {
  return usersLoading && isEmail((salesOwner ?? "").trim());
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+$/.test(value);
