// Who quotes are from: one set of details for the whole company, kept as a Sales preference
// (useCompanyDetails), edited in Sales Settings and printed on every quote.

// `address` is kept as typed, one line of the address per line.
export const COMPANY_DETAIL_FIELDS = ["name", "address", "companyId", "vatId", "phone", "email", "website"] as const;

export type CompanyDetails = Record<(typeof COMPANY_DETAIL_FIELDS)[number], string>;

// What a screen knows of the stored details. "error" means they could not be read - which is not
// the same as none being stored, so nothing is printed or saved as if there were none.
export interface StoredCompanyDetails {
  status: "loading" | "ready" | "error";
  details: CompanyDetails;
}

// The details out of what the preference holds, and out of the form on its way there: every field
// is present as trimmed text, and one that is missing or was never filled in is empty.
export function asCompanyDetails(stored: unknown): CompanyDetails {
  const values = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return Object.fromEntries(
    COMPANY_DETAIL_FIELDS.map((field) => {
      const value = values[field];
      return [field, typeof value === "string" ? value.trim() : ""];
    }),
  ) as CompanyDetails;
}

export function hasCompanyDetails(details: CompanyDetails): boolean {
  return COMPANY_DETAIL_FIELDS.some((field) => details[field]);
}
