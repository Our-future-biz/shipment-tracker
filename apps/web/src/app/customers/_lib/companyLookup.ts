// "Look up" by IČO or by name: the same in Add Customer / Supplier and on a company's registration link.
// Pure, so it is unit-tested.

export const ICO_LENGTH = 8;
// The Czech register is searched by name from this many characters, once typing has paused.
export const MIN_NAME_LENGTH = 3;

export const NO_COMPANY_FOUND = "No company found under that name";
export const STILL_SEARCHING = "Searching the register…";
export const TOO_MANY_COMPANIES = "Too many companies match. Type more of the name.";

export type LookupStep =
  /** Read the company by its IČO. */
  | { kind: "ico" }
  /** Show the matches for the name under the box. */
  | { kind: "names" }
  | { kind: "refuse"; message: string };

/** What "Look up" does with what is typed: an IČO is read, a name shows its matches (User Council E3 / T11). */
export function lookupStepOf(query: string): LookupStep {
  if (/^\d+$/.test(query)) return query.length === ICO_LENGTH ? { kind: "ico" } : { kind: "refuse", message: `IČO must be exactly ${ICO_LENGTH} digits` };
  if (query.trim().length < MIN_NAME_LENGTH) return { kind: "refuse", message: `Type at least ${MIN_NAME_LENGTH} characters of the company name, or the IČO` };
  return { kind: "names" };
}

interface NameSearch {
  /** "Look up" was pressed for the name as it stands. */
  asked: boolean;
  /** The name as typed, trimmed. */
  name: string;
  /** The name the search last ran for (it waits for typing to pause). */
  searchedName: string;
  fetching: boolean;
  /** The matches for `name`; undefined while there are none for it yet. */
  results: { tooMany: boolean; companies: readonly unknown[] } | undefined;
}

/**
 * The line under the box for a name. A person who pressed Look up while the search still runs is told so:
 * the button alone used to spin and then show nothing.
 */
export function nameSearchHelpOf(s: NameSearch): string | undefined {
  if (s.name.length < MIN_NAME_LENGTH) return undefined;
  if (s.searchedName !== s.name || s.fetching) return s.asked ? STILL_SEARCHING : undefined;
  if (s.results?.tooMany) return TOO_MANY_COMPANIES;
  if (s.results && s.results.companies.length === 0) return NO_COMPANY_FOUND;
  return undefined;
}
