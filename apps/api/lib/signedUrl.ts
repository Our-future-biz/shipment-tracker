import { createHmac, timingSafeEqual } from "node:crypto";

// Short-lived tokens for the raw file endpoints a browser opens directly (<img src>, download
// links) and so can't send the auth header to. The token names the file and the company and
// expires; the endpoint serves the file only when the token is valid and matches it.

export interface ContentClaim {
  /** What kind of file, so a token for one endpoint can't be replayed on another. */
  kind: string;
  id: string;
  companyId: string;
}

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(secret: string, payload: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

/** A token for `claim`, valid for `ttlSeconds` (default 1 hour). */
export function signContentToken(secret: string, claim: ContentClaim, ttlSeconds = 3600): string {
  return signContentTokenUntil(secret, claim, Math.floor(Date.now() / 1000) + ttlSeconds);
}

/**
 * A token for `claim`, valid until `exp` (Unix seconds). The same claim and `exp` give the same
 * token, so a link built with it stays the same and the browser can cache what it serves.
 */
export function signContentTokenUntil(secret: string, claim: ContentClaim, exp: number): string {
  const payload = b64url(Buffer.from(JSON.stringify({ ...claim, exp })));
  return `${payload}.${sign(secret, payload)}`;
}

/** The claim of a valid, unexpired token of this `kind`; null otherwise. */
export function verifyContentToken(secret: string, token: string | null | undefined, kind: string): ContentClaim | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(secret, payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as ContentClaim & { exp: number };
    if (claim.kind !== kind || typeof claim.exp !== "number" || claim.exp < Date.now() / 1000) return null;
    return { kind: claim.kind, id: claim.id, companyId: claim.companyId };
  } catch {
    return null;
  }
}
