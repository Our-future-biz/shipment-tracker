import { secret } from "encore.dev/config";
import { signContentTokenUntil, verifyContentToken } from "../../../lib/signedUrl";

// Links to customer logos. Lists show a logo as an <img>, which can't send the auth header, so the
// link carries a short-lived token; the logo itself never travels inside the list's JSON.

const jwtSecret = secret("JWT_SECRET");
const KIND = "customer-logo";
const HOUR = 3600;

/**
 * The API path serving the customer's logo. The token is the same for a whole hour (valid one to
 * two hours), so the link is too and the browser keeps the image cached; `version` changes with
 * the logo, so a new one is fetched at once.
 */
export function customerLogoUrl(customerId: string, companyId: string, version: string): string {
  const exp = (Math.floor(Date.now() / 1000 / HOUR) + 2) * HOUR;
  const token = signContentTokenUntil(jwtSecret(), { kind: KIND, id: customerId, companyId }, exp);
  return `/customers/${customerId}/logo/image?t=${encodeURIComponent(token)}&v=${encodeURIComponent(version)}`;
}

/** The company a valid logo token for this customer was issued to; null when it is missing, forged or expired. */
export function companyOfLogoToken(token: string | null, customerId: string): string | null {
  const claim = verifyContentToken(jwtSecret(), token, KIND);
  return claim && claim.id === customerId ? claim.companyId : null;
}
