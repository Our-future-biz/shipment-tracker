import log from "encore.dev/log";

// Outgoing supplier e-mail of the warehouse (VGM, survey, remeasurement), through Resend — the
// same provider and sender address as apps/api/lib/email.ts. This copy adds what supplier
// e-mails need: Cc, reply-to, attachments and an idempotency key (a retried request is not sent
// twice by the provider).
//
// Sending is OFF, like lib/email.ts (owner decision, 14 Oct 2026): there is no e-mail provider
// account yet, and Encore refuses to deploy while a declared secret has no value, so no
// RESEND_API_KEY secret is declared here either. Nothing is sent and the caller gets a clear
// reason back — nothing throws and nothing is marked as sent.
// To turn it on (together with lib/email.ts): declare `secret("RESEND_API_KEY")` from
// "encore.dev/config", set it per environment (`encore secret set --type prod,dev
// RESEND_API_KEY`) and return it from apiKey(). The sender (EMAIL_FROM env var) must be on a
// domain verified in Resend, otherwise Resend refuses every message (403).
const DEFAULT_FROM = "Shipment Tracker <onboarding@resend.dev>";
const TIMEOUT_MS = 20_000;

export const NO_KEY_TEXT = "E-mail sending is off — no Resend API key is set on this server";

export interface SupplierMailAttachment {
  filename: string;
  /** base64 */
  content: string;
}

export interface SupplierMail {
  to: string[];
  cc: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments: SupplierMailAttachment[];
  /** Same key = the provider sends it once (Resend keeps keys for 24 hours). */
  idempotencyKey: string;
}

export interface SupplierMailResult {
  sent: boolean;
  /** Why it was not sent; "" when sent. */
  error: string;
  /** The provider's id of the message; "" when not sent. */
  providerId: string;
  /** No answer in time: the provider may still have sent it (not known). */
  timedOut?: boolean;
}

// No key while sending is off (see above).
const apiKey = (): string => "";

/** The server can e-mail (a Resend key is set). */
export const emailConfigured = () => !!apiKey();

const clean = (l: string[]) => [...new Set(l.map((a) => a.trim()).filter(Boolean))];

export async function sendSupplierMail(msg: SupplierMail): Promise<SupplierMailResult> {
  const to = clean(msg.to);
  const cc = clean(msg.cc).filter((a) => !to.includes(a));
  if (!to.length) return { sent: false, error: "No recipients", providerId: "" };
  const key = apiKey();
  if (!key) {
    log.warn("warehouse supplier e-mail not sent: sending is off (no RESEND_API_KEY)", { subject: msg.subject, to: to.length });
    return { sent: false, error: NO_KEY_TEXT, providerId: "" };
  }
  return sendWithKey(key, { ...msg, to, cc });
}

/** The Resend call itself, with a key (used once sending is turned on; tested on its own). */
export async function sendWithKey(key: string, msg: SupplierMail): Promise<SupplierMailResult> {
  const to = clean(msg.to);
  const cc = clean(msg.cc).filter((a) => !to.includes(a));
  if (!to.length) return { sent: false, error: "No recipients", providerId: "" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "Idempotency-Key": msg.idempotencyKey },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_FROM,
        to,
        ...(cc.length ? { cc } : {}),
        ...(msg.replyTo ? { reply_to: msg.replyTo } : {}),
        subject: msg.subject,
        text: msg.text,
        ...(msg.attachments.length ? { attachments: msg.attachments } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      log.error("warehouse supplier e-mail failed", { status: res.status, detail });
      return { sent: false, error: `The e-mail provider answered ${res.status}: ${detail}`, providerId: "" };
    }
    let providerId = "";
    try {
      const body = (await res.json()) as { id?: unknown };
      providerId = typeof body?.id === "string" ? body.id : "";
    } catch {
      // sent; the id is only for reference
    }
    return { sent: true, error: "", providerId };
  } catch (err) {
    log.error(err, "warehouse supplier e-mail failed");
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? { sent: false, error: "The e-mail provider did not answer in time — the e-mail may still have gone out", providerId: "", timedOut: true }
      : { sent: false, error: err instanceof Error ? err.message : String(err), providerId: "" };
  }
}
