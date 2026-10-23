import { secret } from "encore.dev/config";
import { signContentToken, verifyContentToken } from "../../../lib/signedUrl";

// Download links for files sent in a quote's chat: the browser opens them as plain links without
// the auth header, so each link carries a short-lived token naming the file and the company.

const jwtSecret = secret("JWT_SECRET");
const KIND = "quote-chat-file";

/** The API path that serves one chat file, with a token valid for an hour. */
export function chatFileUrl(id: string, companyId: string): string {
  const token = signContentToken(jwtSecret(), { kind: KIND, id, companyId });
  return `/sales-quote-chat-files/${id}/content?t=${encodeURIComponent(token)}`;
}

/** The company a valid token for this file was issued to; null when missing, forged or expired. */
export function companyOfChatFileToken(token: string | null, id: string): string | null {
  const claim = verifyContentToken(jwtSecret(), token, KIND);
  return claim && claim.id === id ? claim.companyId : null;
}
