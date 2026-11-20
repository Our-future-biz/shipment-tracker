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

/** The contact role of a supplier that takes the orders, as the supplier checks ask for it (supplierAttention.ts). */
export const DISPATCH_ROLE = "Dispatch / Operations";

type OrderContact = { email: string; role: string; isMain: boolean };

/**
 * What "To" starts with (T8): the haulier's Dispatch / Operations contacts in the Customer
 * Database, the main one first; with none, its main contact, else its first contact with an
 * e-mail (as the transport order prints it). "" when no contact has an e-mail. The user may change it.
 */
export function orderRecipientsOf(contacts: readonly OrderContact[]): string {
  const withEmail = contacts.filter((c) => c.email.trim());
  const dispatch = withEmail.filter((c) => c.role === DISPATCH_ROLE).sort((a, b) => Number(b.isMain) - Number(a.isMain));
  const picked = dispatch.length ? dispatch : [withEmail.find((c) => c.isMain) ?? withEmail[0]].filter((c): c is OrderContact => !!c);
  return parseRecipients(picked.map((c) => c.email).join(", ")).join(", ");
}

/**
 * Said beside the haulier's link shown after Record as sent (T8/E1): the server keeps only its
 * hash, so this is the one time it can be copied; recording the order as sent again replaces it.
 */
export const LINK_SHOWN_ONCE = "Shown once: copy it now. Record as sent again makes a new link that replaces this one.";

/**
 * Once the server has recorded the send: the haulier's link is shown first - the server keeps only
 * its hash, so a download that fails after it must not lose it - then the PDF downloads. The send
 * stays recorded whatever the download does; false when the download failed.
 */
export function afterRecordedSend(showLink: () => void, download: () => void): boolean {
  showLink();
  try {
    download();
    return true;
  } catch {
    return false;
  }
}

/** What the dialog says when the send is recorded but its PDF did not download. */
export const pdfNotDownloadedText = (hasLink: boolean) =>
  `Recorded as sent; the PDF did not download — ${hasLink ? "copy the link below, or " : ""}Record as sent again for a new PDF`;

/** The haulier's link view: whether the order was e-mailed (with the link in it) or only recorded, and whether the PDF downloaded. */
export function linkViewText(orderNumber: string, recordedOnly: boolean, downloaded: boolean): { message: string; description: string } {
  const pdf = downloaded ? " — the PDF is downloaded" : "";
  if (!recordedOnly) {
    return {
      message: `${orderNumber} is e-mailed to the haulier${pdf}`,
      description: "The e-mail carries this link too. Through the link the haulier confirms the order and uploads the POD.",
    };
  }
  return {
    message: `${orderNumber} is recorded as sent${pdf}`,
    description: `Send ${downloaded ? "the PDF, or this link," : "this link"} to the haulier yourself: it was not e-mailed. Through the link the haulier confirms the order and uploads the POD.`,
  };
}

/**
 * Puts the text on the clipboard; false when there is no clipboard (a page not served over
 * https) or it refuses - the dialog then selects the link for the user to copy by hand.
 */
export async function copyText(text: string, clipboard: Pick<Clipboard, "writeText"> | undefined): Promise<boolean> {
  if (!clipboard) return false;
  try {
    await clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
