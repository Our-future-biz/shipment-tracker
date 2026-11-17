/** The server's own words for an empty name, said before a request it would refuse is sent. */
export const EMPTY_COMPANY_NAME = "The company name can't be empty";

/** A typed company name as a rename saves it (trimmed), or null when nothing would be left. */
export function renamedCompany(typed: string): string | null {
  return typed.trim() || null;
}
