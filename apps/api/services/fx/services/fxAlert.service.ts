import log from "encore.dev/log";
import { auth } from "~encore/clients";
import { sendEmail } from "../../../lib/email";
import { fxAlertRepository } from "../repositories/fxAlert.repository";
import { cnbRateRepository } from "../repositories/cnbRate.repository";
import type { FxAlertItem } from "../interfaces/interfaces";

const APP_URL = process.env.APP_URL || "http://localhost:3001";

function czDate(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Reports a fixing still missing after the last pull: an alert under the bell for admins
 * and one e-mail to every admin. Raising it twice for the same day does nothing.
 */
export async function raiseMissingFixing(fixingDate: string, reason: string): Promise<void> {
  const alert = await fxAlertRepository.raise(fixingDate, reason);
  if (!alert) return;
  log.warn("fx: ČNB fixing missing after the last pull", { fixingDate, reason });

  const latest = await cnbRateRepository.latestValidDate();
  let recipients: string[] = [];
  try {
    recipients = (await auth.adminContacts()).admins.map((a) => a.email);
  } catch (err) {
    log.error(err, "fx: could not load admin e-mails for the alert");
  }
  const result = await sendEmail({
    to: recipients,
    subject: `ČNB exchange rates missing for ${czDate(fixingDate)}`,
    text: [
      `The ČNB exchange rates for ${czDate(fixingDate)} could not be imported by 16:00 (pulls at 15:00, 15:30 and 16:00).`,
      ``,
      `Reason: ${reason}`,
      `Rates in use until then: the fixing of ${czDate(latest)}.`,
      ``,
      `Check the Exchange page and use "Sync now" once ČNB has published: ${APP_URL}/exchange`,
      `The alert closes by itself when the rates arrive.`,
    ].join("\n"),
  });
  await fxAlertRepository.markEmailed(alert.id, result.sent, result.error);
}

export async function resolveAlertsUpTo(latestFixing: string | null): Promise<void> {
  if (latestFixing) await fxAlertRepository.resolveUpTo(latestFixing);
}

export async function openAlerts(): Promise<FxAlertItem[]> {
  const rows = await fxAlertRepository.open();
  return rows.map((a) => ({
    id: a.id,
    fixingDate: a.fixingDate,
    reason: a.reason,
    raisedAt: a.raisedAt.toISOString(),
    emailedAt: a.emailedAt ? a.emailedAt.toISOString() : null,
    emailError: a.emailError,
  }));
}
