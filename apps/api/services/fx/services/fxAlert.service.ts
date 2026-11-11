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
 * Who is written to, one To list per message: the admins of one company each, and the superadmins
 * (who work for every company) in a message of their own. One list over every company would show
 * each tenant's admins the addresses of every other tenant's.
 */
export function recipientGroups(admins: { email: string; companyId: string; role: string }[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const a of admins) {
    const key = a.role === "superadmin" ? "superadmin" : `company:${a.companyId}`;
    const list = groups.get(key) ?? [];
    list.push(a.email);
    groups.set(key, list);
  }
  return [...groups.values()];
}

/**
 * Reports a fixing still missing after the last pull: an alert under the bell for admins
 * and one e-mail to each company's admins (see recipientGroups). Raising it twice for the
 * same day does nothing.
 */
export async function raiseMissingFixing(fixingDate: string, reason: string): Promise<void> {
  const alert = await fxAlertRepository.raise(fixingDate, reason);
  if (!alert) return;
  log.warn("fx: ČNB fixing missing after the last pull", { fixingDate, reason });

  const latest = await cnbRateRepository.latestValidDate();
  let groups: string[][] = [];
  try {
    groups = recipientGroups((await auth.adminContacts()).admins);
  } catch (err) {
    log.error(err, "fx: could not load admin e-mails for the alert");
  }
  const message = {
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
  };
  // No recipients at all still goes through sendEmail, which answers why nothing was sent.
  const results = await Promise.all((groups.length ? groups : [[]]).map((to) => sendEmail({ ...message, to })));
  // E-mailed once any company was reached; the reasons the others were not are kept with the alert.
  const sent = results.some((r) => r.sent);
  const error = [...new Set(results.filter((r) => !r.sent).map((r) => r.error))].join("; ");
  await fxAlertRepository.markEmailed(alert.id, sent, error);
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
