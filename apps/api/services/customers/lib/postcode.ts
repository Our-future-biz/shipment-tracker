// Postcodes of customer sites. Czech ones (PSČ) are what zone pricing keys on, so they are stored in
// one shape - 5 digits, no space ("11000") - however they were typed ("110 00", " 11000 ").
// Other countries' postcodes are kept as typed (trimmed): their formats differ too much to check.

/** The postcode as it is stored, or null when it is not valid for the country. */
export const normalisePostcode = (country: string, postcode: string): string | null => {
  if (country === "CZ") {
    const digits = postcode.replace(/\s+/g, "");
    return /^\d{5}$/.test(digits) ? digits : null;
  }
  const trimmed = postcode.trim();
  return trimmed ? trimmed : null;
};

/** ISO 3166-1 alpha-2 in upper case; "cz " → "CZ". */
export const normaliseCountry = (country: string): string => country.trim().toUpperCase();
