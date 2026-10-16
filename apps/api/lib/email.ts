import { randomUUID } from "node:crypto";
import log from "encore.dev/log";

// Outgoing e-mail — the one place that talks to the provider (Resend), used by the ČNB rate
// alerts (sendEmail) and the warehouse's supplier e-mails (sendMail: Cc, reply-to, attachments,
// idempotency key).
//
// DISABLED for now (owner decision, 14 Oct 2026): there is no e-mail provider account yet, and
// Encore refuses to deploy while a declared secret has no value, so no RESEND_API_KEY secret is
// declared. Every message is logged and reported back as not sent — nothing fails; the ČNB alerts
// still show under the bell.
//
// To turn it on: create a Resend account + verified sender domain (EMAIL_FROM), declare
// `secret("RESEND_API_KEY")` from "encore.dev/config" here, set it per environment
// (`encore secret set --type prod,dev RESEND_API_KEY`) and return it from apiKey(). The provider
// call itself (sendWithKey) is ready and tested.

const DEFAULT_FROM = "Shipment Tracker <onboarding@resend.dev>";
const TIMEOUT_MS = 20_000;

export const EMAIL_DISABLED = "E-mail sending is disabled";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export interface EmailResult {
  sent: boolean;
  error: string; // why it was not sent; "" when sent
}

export interface MailAttachment {
  filename: string;
  /** base64 */
  content: string;
}

export interface Mail {
  to: string[];
  cc: string[];
  replyTo?: string;
  subject: string;
  text: string;
  attachments: MailAttachment[];
  /** Same key = the provider sends it once (Resend keeps keys for 24 hours). */
  idempotencyKey: string;
}

export interface MailResult extends EmailResult {
  /** The provider's id of the message; "" when not sent. */
  providerId: string;
  /** No answer in time: the provider may still have sent it (not known). */
  timedOut?: boolean;
}

// No key while sending is off (see above).
const apiKey = (): string => "";

/** The server can e-mail (a provider key is set). */
export const emailConfigured = () => !!apiKey();

const clean = (l: string[]) => [...new Set(l.map((a) => a.trim()).filter(Boolean))];

/** A message with Cc, reply-to and attachments. Never throws. */
export async function sendMail(msg: Mail): Promise<MailResult> {
  const to = clean(msg.to);
  const cc = clean(msg.cc).filter((a) => !to.includes(a));
  if (!to.length) return { sent: false, error: "No recipients", providerId: "" };
  const key = apiKey();
  if (!key) {
    log.info("email not sent: sending is disabled", { subject: msg.subject, to: to.length });
    return { sent: false, error: EMAIL_DISABLED, providerId: "" };
  }
  return sendWithKey(key, { ...msg, to, cc });
}

/** A plain message (alerts). Never throws. */
export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const { sent, error } = await sendMail({ ...msg, cc: [], attachments: [], idempotencyKey: randomUUID() });
  return { sent, error };
}

/** The provider call itself, with a key (used once sending is turned on; tested on its own). */
export async function sendWithKey(key: string, msg: Mail): Promise<MailResult> {
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
      // The provider's answer is logged, never shown to users.
      log.error("e-mail failed", { status: res.status, detail: (await res.text()).slice(0, 300) });
      return { sent: false, error: `The e-mail provider refused the message (${res.status})`, providerId: "" };
    }
    let providerId = "";
    try {
      const body = (await res.json()) as { id?: unknown };
      providerId = typeof body?.id === "string" ? body.id : "";
    } catch (err) {
      log.warn(err, "e-mail sent; the provider's id could not be read");
    }
    return { sent: true, error: "", providerId };
  } catch (err) {
    log.error(err, "e-mail failed");
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return timedOut
      ? { sent: false, error: "The e-mail provider did not answer in time — the e-mail may still have gone out", providerId: "", timedOut: true }
      : { sent: false, error: "The e-mail could not be sent", providerId: "" };
  }
}
