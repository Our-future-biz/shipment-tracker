import { showPostcode } from "./rateEngine";
import type { DocParty } from "./documentTypes";

// The parties printed on the transport order: our company (from the invoicing issuer details,
// Settings → Organization, with the Sales company details printed on quotations filling what is
// missing) and the haulier (from the Customer Database). Pure.

/** The issuer details printed on invoices (invoicing profile). */
export interface IssuerProfile {
  companyName: string;
  street: string;
  city: string;
  postalCode: string;
  country: string;
  ico: string;
  dic: string;
  email: string;
  phone: string;
}

/** The company details printed on quotations (Sales preference "company_details"); `address` one line per line. */
export interface QuoteCompanyDetails {
  name: string;
  address: string;
  companyId: string;
  vatId: string;
  phone: string;
  email: string;
  website: string;
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const joinNonEmpty = (parts: string[], sep = ", ") => parts.map((p) => p.trim()).filter(Boolean).join(sep);

/** The Sales preference as stored (an open object from browsers): every field as trimmed text. */
export function asQuoteCompanyDetails(stored: unknown): QuoteCompanyDetails {
  const v = stored && typeof stored === "object" ? (stored as Record<string, unknown>) : {};
  return {
    name: str(v.name),
    address: typeof v.address === "string" ? v.address : "",
    companyId: str(v.companyId),
    vatId: str(v.vatId),
    phone: str(v.phone),
    email: str(v.email),
    website: str(v.website),
  };
}

/** A CZ postcode as printed ("11000" → "110 00"). */
const printed = (postcode: string, country: string) => (country === "CZ" ? showPostcode(postcode.replace(/\s+/g, "")) : postcode);

/**
 * Our company as the forwarder on the transport order: the invoicing issuer details where they
 * are filled in, else the quotation details (their first address line as the street, the rest
 * as the city line).
 */
export function ourCompanyParty(profile: IssuerProfile | null, quote: QuoteCompanyDetails | null): DocParty {
  const lines = (quote?.address ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const country = profile?.country || "CZ";
  const useProfile = !!profile?.companyName;
  return {
    name: profile?.companyName || quote?.name || "",
    street: useProfile ? profile!.street : (lines[0] ?? ""),
    postcode: useProfile ? printed(profile!.postalCode, country) : "",
    city: useProfile ? profile!.city : lines.slice(1).join(", "),
    country,
    ico: profile?.ico || quote?.companyId || "",
    dic: profile?.dic || quote?.vatId || "",
    contact: joinNonEmpty([profile?.phone || quote?.phone || "", profile?.email || quote?.email || ""]),
  };
}

/** The haulier as printed: its Customer Database record and its main contact. */
export function haulierParty(
  company: { companyName: string; ico: string; dic: string; city: string },
  customer: { registeredAddress: string; country: string } | null,
  contact: { name: string; phone: string; email: string } | null,
): DocParty {
  return {
    name: company.companyName,
    // The registry address is one text ("Street 1, Praha, 11000"); it is printed as it is.
    street: customer?.registeredAddress ?? "",
    postcode: "",
    city: company.city,
    country: customer?.country || "CZ",
    ico: company.ico,
    dic: company.dic,
    contact: contact ? joinNonEmpty([contact.name, contact.phone, contact.email]) : "",
  };
}
