import type { TransportOrderLanguage } from "@/hooks/useTruckingConsignments";

// Pure helpers of the transport-order dialogs (Print… / Record as sent…): the pick-up PIN typed by
// the user, the language, the recipients and the words of each entry point. Tested in
// transportOrder.test.ts.

/**
 * E-mail is off in this app: the order is never sent from here, only recorded as sent while its PDF
 * downloads. Every entry point (consignment, trip page, planning card) says so the same way.
 */
export const recordAsSentLabel = (alreadySent: boolean) => (alreadySent ? "Record as sent again…" : "Record as sent…");

/** The column of the Trips list and the line of the trip page that show when the order was recorded as sent. */
export const RECORDED_AS_SENT = "Recorded as sent";

/** Why Print / Record as sent are not offered on a trip that is on the road, done or cancelled. */
export const ORDER_LOCKED_TEXT = "The trip is on the road, done or cancelled — its transport order no longer changes";

/**
 * The pick-up PIN is made in Shipments (Warehouse → Pick-up) and shown there once; Shipments keeps
 * only its hash. So the user types it here to have it printed on the order; it is sent with the
 * print request only and never stored or logged (the log says "PIN printed").
 */
export const PIN_EXPLANATION = "Shown once in Shipments — type it to print it; it is not stored.";

/** The PIN as typed, without spaces; "" = no PIN on the order. */
export const pinDigits = (typed: string) => typed.replace(/\s/g, "");

/** Why the typed PIN cannot be printed, or null (an empty field prints no PIN). Same digits the warehouse gate checks. */
export function pinProblem(typed: string): string | null {
  const pin = pinDigits(typed);
  if (!pin) return null;
  if (!/^\d+$/.test(pin)) return "The PIN has digits only";
  if (pin.length < 4 || pin.length > 6) return "The PIN has 4 to 6 digits";
  return null;
}

/** What the request carries: the PIN, or null for none. Call only when pinProblem is null. */
export const pinValue = (typed: string): string | null => pinDigits(typed) || null;

export const LANGUAGE_OPTIONS: { value: TransportOrderLanguage; label: string }[] = [
  { value: "cs", label: "Czech" },
  { value: "en", label: "English" },
  { value: "both", label: "Czech and English" },
];

const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Recipients typed as a list ("a@x.cz, b@y.cz" or one per line), trimmed, without repeats. */
export function parseRecipients(text: string): string[] {
  const out: string[] = [];
  for (const part of text.split(/[\s,;]+/)) {
    const e = part.trim();
    if (e && !out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
  }
  return out;
}

/** The addresses that are not e-mail addresses, for the error under the field. */
export const invalidRecipients = (list: readonly string[]) => list.filter((e) => !EMAIL.test(e));

/** The file name a downloaded order is saved under when the server gives none. */
export const orderFileName = (orderNumber: string) => `${orderNumber || "transport-order"}.pdf`;
