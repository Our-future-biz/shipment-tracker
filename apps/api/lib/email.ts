import log from "encore.dev/log";

// Outgoing e-mail. DISABLED for now (owner decision, 14 Oct 2026): there is no e-mail
// provider account yet, and Encore refuses to deploy while a declared secret has no value,
// so no RESEND_API_KEY secret is declared. Every message is logged and reported back as not
// sent — nothing fails; the ČNB alerts still show under the bell.
//
// To turn it on: create a Resend account + verified sender domain, declare
// `secret("RESEND_API_KEY")` here again, set it per environment
// (`encore secret set --type prod,dev RESEND_API_KEY`) and post the message to
// https://api.resend.com/emails (the previous version is in git history, commit db39590).

export interface EmailMessage {
  to: string[];
  subject: string;
  text: string;
}

export interface EmailResult {
  sent: boolean;
  error: string; // why it was not sent; "" when sent
}

export const EMAIL_DISABLED = "E-mail sending is disabled";

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  const to = [...new Set(msg.to.map((a) => a.trim()).filter(Boolean))];
  if (!to.length) return { sent: false, error: "No recipients" };
  log.info("email not sent: sending is disabled", { subject: msg.subject, to: to.length });
  return { sent: false, error: EMAIL_DISABLED };
}
