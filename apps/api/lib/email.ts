import { secret } from "encore.dev/config";
import log from "encore.dev/log";

// Outgoing e-mail through Resend (https://resend.com), the provider chosen in
// REFACTOR_PLAN §8. This file is the only place that talks to it.
//
// Sending is OFF until a key is set: `encore secret set --type local RESEND_API_KEY`
// (or the line RESEND_API_KEY: "re_…" in apps/api/.secrets.local.cue). Without a key
// every message is logged and reported back as not sent — nothing fails.
// The sender must be on a domain verified in Resend; set it with the EMAIL_FROM env var.
const resendApiKey = secret("RESEND_API_KEY");
const DEFAULT_FROM = "Shipment Tracker <onboarding@resend.dev>";

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export interface EmailResult {
  sent: boolean;
  error: string; // why it was not sent; "" when sent
}

function apiKey(): string {
  try {
    return resendApiKey() ?? "";
  } catch {
    return ""; // secret not defined in this environment
  }
}

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const to = [...new Set(msg.to.map((a) => a.trim()).filter(Boolean))];
  if (!to.length) return { sent: false, error: "No recipients" };
  const key = apiKey();
  if (!key) {
    log.warn("email not sent: no RESEND_API_KEY set", { subject: msg.subject, to: to.length });
    return { sent: false, error: "E-mail sending is off (no Resend API key set)" };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || DEFAULT_FROM, to, subject: msg.subject, text: msg.text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      log.error("email send failed", { status: res.status, detail });
      return { sent: false, error: `Resend answered ${res.status}: ${detail}` };
    }
    return { sent: true, error: "" };
  } catch (err) {
    log.error(err, "email send failed");
    return { sent: false, error: err instanceof Error ? err.message : String(err) };
  }
}
