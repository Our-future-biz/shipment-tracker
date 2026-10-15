import { secret } from "encore.dev/config";
import { signContentToken, verifyContentToken } from "../../../lib/signedUrl";

// Download links for shipment files: the raw content endpoint can't receive the auth
// header (the browser opens it as a plain link), so each link carries a short-lived token.

const jwtSecret = secret("JWT_SECRET");
const KIND = "shipment-attachment";

/** The API path that serves one file, with a token valid for an hour. */
export function attachmentContentUrl(shipmentId: string, id: string, companyId: string): string {
  const token = signContentToken(jwtSecret(), { kind: KIND, id, companyId });
  return `/shipments/${shipmentId}/attachments/${id}/content?t=${encodeURIComponent(token)}`;
}

/** The company a valid token for this file was issued to; null when it is missing, forged or expired. */
export function companyOfContentToken(token: string | null, id: string): string | null {
  const claim = verifyContentToken(jwtSecret(), token, KIND);
  return claim && claim.id === id ? claim.companyId : null;
}
