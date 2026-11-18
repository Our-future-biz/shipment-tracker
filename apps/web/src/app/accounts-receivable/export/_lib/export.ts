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
