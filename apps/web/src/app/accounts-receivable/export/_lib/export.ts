import { addDays } from "@/lib/date";

// Finance → Accounts Receivable → Export to Pohoda (step 7): the pure rules of the page. The server builds the file
// (Windows-1250 XML) and records the export; the page hands its bytes to the browser exactly as they came.

/** At most a year in one file (the server's MAX_DAYS). */
export const MAX_DAYS = 366;

/** The previous month's first and last issue day: the period the page starts with. */
export function previousMonth(today: string): { from: string; to: string } {
  const to = addDays(`${today.slice(0, 7)}-01`, -1);
  return { from: `${to.slice(0, 7)}-01`, to };
}

const daysFrom = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** Why the period is not exported ("" when it is): the server's words. */
export function periodProblem(from: string, to: string, today: string): string {
  if (!from || !to) return "Choose the first and the last issue day of the export";
  if (from > to) return "The first day is after the last one";
  if (daysFrom(from, to) >= MAX_DAYS) return "At most a year in one file: choose a shorter period";
  if (from > today) return "Nothing is issued after today: choose a period that has begun";
  return "";
}

export interface SkippedDocument {
  number: string;
  kind: "invoice" | "credit_note";
  issueDate: string;
  reason: string;
}

/** The documents left out that a refusal carries ("Nothing to export…" sends them in its details); none otherwise. */
export function skippedOfDetails(details: unknown): SkippedDocument[] {
  const list = details && typeof details === "object" ? (details as { skipped?: unknown }).skipped : undefined;
  if (!Array.isArray(list)) return [];
  return list.flatMap((s): SkippedDocument[] => {
    if (!s || typeof s !== "object") return [];
    const x = s as Record<string, unknown>;
    if (typeof x.number !== "string" || typeof x.reason !== "string") return [];
    return [{ number: x.number, kind: x.kind === "credit_note" ? "credit_note" : "invoice", issueDate: typeof x.issueDate === "string" ? x.issueDate : "", reason: x.reason }];
  });
}

export const kindLabel = (kind: "invoice" | "credit_note"): string => (kind === "credit_note" ? "Credit note" : "Invoice");

// ── An export whose answer was lost (mock test council m1) ──

/** Where the key of an export started and not yet answered is kept, per choice of period and "include exported". */
export const EXPORT_KEY_PREFIX = "ar-pohoda-export-key:";

/** The choices an export key belongs to: the same period and choice again is the same export. */
export const exportChoices = (from: string, to: string, includeExported: boolean): string => JSON.stringify([from, to, includeExported]);

/** The storage the key lives in (the tab's sessionStorage); a stand-in in tests. Never throws: storage may be off. */
export interface KeyStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/**
 * The idempotency key of an export of these choices: the one kept from an earlier try whose answer never came (also
 * after the page was opened again in the tab), else a new one, kept until its answer arrives. The server answers the
 * same key with the same export, so clicking Export again after a lost answer never makes a second one.
 */
export function exportKeyFor(store: KeyStore | null, choices: string, make: () => string): string {
  const name = `${EXPORT_KEY_PREFIX}${choices}`;
  try {
    const kept = store?.getItem(name);
    if (kept) return kept;
  } catch {
    // Storage switched off: a key for this page's life only.
  }
  const key = make();
  try {
    store?.setItem(name, key);
  } catch {
    // As above.
  }
  return key;
}

/** The export of these choices was answered (or plainly refused): its key is done with, the next one is a new export. */
export function forgetExportKey(store: KeyStore | null, choices: string): void {
  try {
    store?.removeItem(`${EXPORT_KEY_PREFIX}${choices}`);
  } catch {
    // Storage switched off: nothing was kept.
  }
}

/** What the page says when the answer was lost: the export may be recorded already. */
export const ANSWER_LOST = "The answer was lost: the export may already be recorded. Click Export again, or download it from the list.";

/**
 * What a failed export says, and whether its key is done with: a refusal the server decided ("Not exported: …", the
 * key may go) or a lost answer (the export may be recorded: the key stays, so Export again answers that export).
 */
export function exportFailureText(refused: boolean, message: string): { text: string; keepKey: boolean } {
  return refused ? { text: `Not exported: ${message}`, keepKey: false } : { text: ANSWER_LOST, keepKey: true };
}

/** The warning while documents exported before are put in again: whether they need removing depends on the earlier import. */
export const INCLUDE_EXPORTED_WARNING =
  "Documents exported before go into the file again. If an earlier file was imported in Pohoda, it refuses a number it already has: remove those there first. If the earlier file never reached Pohoda (it was not imported, or never got to you), there is nothing to remove.";

/**
 * The file's bytes from the server's base64, as they are: the XML is Windows-1250, and turning it into text and back
 * would write it as UTF-8, which Pohoda would read with broken diacritics. Throws on text that is not base64.
 */
export function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const clean = base64.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1) throw new Error("The file did not arrive whole");
  const binary = atob(clean);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
