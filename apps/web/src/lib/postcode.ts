/** A postcode as written on a letter: a Czech PSČ as "110 00", any other as typed. */
export function formatPostcode(postcode: string, country = "CZ"): string {
  return country === "CZ" && /^\d{5}$/.test(postcode) ? `${postcode.slice(0, 3)} ${postcode.slice(3)}` : postcode;
}
