// The shipment fields that name a person. Each holds one of the company's users, stored and shown
// by e-mail (owner decision, 26 Oct 2026), and is edited only with the UserPicker - never as free
// text. Created By and House BoL Release are stamps the server writes, so they are not here.
export const PERSON_FIELDS: ReadonlySet<string> = new Set([
  "personInCharge",
  "holidayCover",
  "salesPerson",
  "approvedBy",
  "switchBolApprovedBy",
]);

export const isPersonField = (key: string): boolean => PERSON_FIELDS.has(key);

// The server's stamp reads "<who> — <date and time>" (cs-CZ, e.g. "26. 10. 2026 14:03:05"); one
// with nobody in it is the date alone.
const STAMP_SEPARATOR = /\s+—\s+/;
const STAMP_DATE = /^\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/;

/**
 * A person field's value as who and when. Approved By may hold the stamp the server writes when
 * the credit check turns Green: the picker gets who, and the date is shown beside it. Anything
 * else is all who.
 */
export function splitPersonStamp(value: string | null | undefined): { person: string; when: string } {
  const text = (value ?? "").trim();
  const match = STAMP_SEPARATOR.exec(text);
  if (match) {
    const when = text.slice(match.index + match[0].length).trim();
    if (STAMP_DATE.test(when)) return { person: text.slice(0, match.index).trim(), when };
  }
  return STAMP_DATE.test(text) ? { person: "", when: text } : { person: text, when: "" };
}

/**
 * What to save when `picked` (a user's e-mail, "" for nobody) is chosen for a field holding
 * `stored`, or null when nothing changes: picking the same user again keeps a stamp's date.
 */
export function personChange(stored: string | null | undefined, picked: string): string | null {
  const next = picked.trim().toLowerCase();
  const same = next ? next === splitPersonStamp(stored).person.toLowerCase() : !(stored ?? "").trim();
  return same ? null : next;
}
