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

/** What the quote needs of the issuer details invoices print (Settings → Organization → Invoicing details). */
export interface InvoiceIssuer {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  email: string;
  phone: string;
  web: string;
}

// The company's invoicing details in the form a quote prints its sender in: the address one line
// of it per line, as typed in Sales Settings.
export function companyDetailsFromIssuer(issuer: InvoiceIssuer): CompanyDetails {
  const town = [issuer.postalCode, issuer.city].map((part) => part.trim()).filter(Boolean).join(" ");
  return asCompanyDetails({
    name: issuer.companyName,
    address: [issuer.street.trim(), town, issuer.country.trim()].filter(Boolean).join("\n"),
    companyId: issuer.ico,
    vatId: issuer.dic,
    phone: issuer.phone,
    email: issuer.email,
    website: issuer.web,
  });
}

/**
 * Who a quote is from: the details stored in Sales Settings, and where none are stored there the
 * company's invoicing details, which name the same company (User Council S24: a company with its
 * invoicing details filled in was told its quotes say nobody). Not known while the invoicing
 * details are still loading; with neither, none - and the preview says so.
 */
export function quoteSender(stored: StoredCompanyDetails, issuer: { profile: InvoiceIssuer | undefined; isLoading: boolean }): StoredCompanyDetails {
  if (stored.status !== "ready" || hasCompanyDetails(stored.details)) return stored;
  if (issuer.isLoading) return { status: "loading", details: stored.details };
  const fromIssuer = issuer.profile ? companyDetailsFromIssuer(issuer.profile) : null;
  return fromIssuer && hasCompanyDetails(fromIssuer) ? { status: "ready", details: fromIssuer } : stored;
}
