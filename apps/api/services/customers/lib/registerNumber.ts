import { normaliseCountry } from "./postcode";

/**
 * The country a customer's registration number (its IČO, or a foreign register's number such as a
 * German "HRB 12345", which each court issues on its own) is unique in, and matched by: the
 * customer's country code, upper case. A blank one is read as CZ - the column's default, and every
 * customer from before foreign ones could be added came from ARES; migration 0038 stored them so.
 */
export const registerCountry = (country: string): string => normaliseCountry(country) || "CZ";

/** The unique index on (company, country, registration number) of live customers (customer.schema). */
export const CUSTOMER_ICO_UNIQUE = "customer_company_country_ico_unique";

/** What a create answers when the company is in the Customer Database as deleted (same register, same number). */
export function deletedTwinRefusal(deleted: { companyName: string; approvalDecision: string }, viaLink: boolean): string {
  // The company registering itself is not told what the Customer Database holds about it.
  if (viaLink) return "This company can't be registered through this link: please contact whoever sent it to you";
  const restore = `${deleted.companyName} is in the Customer Database as deleted: a superadmin can restore it under Customer Database → Deleted instead of adding it again`;
  // A new supplier a manager declined is deleted so; the decline is taken back where it was given.
  return deleted.approvalDecision === "declined"
    ? `${restore}, or a manager can undo its decline under Sales → Managers → Company approval`
    : restore;
}
