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
