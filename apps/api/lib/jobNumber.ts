// A shipment's Internal Reference as every service reads it: "CZ", the letters of what the job is
// (owner decision, 3 Nov 2026) and the company's number - CZ00000023, CZFCL00000023,
// CZPROJECT00000023. Which letters a job gets is the shipments service's to decide
// (services/shipments/lib/jobNumber); here a reference is only read, sorted and searched.

/** The letters a reference may carry after "CZ", longest first so a pattern tries them in order. */
export const JOB_NUMBER_LETTERS = ["PROJECT", "RAIL", "ROAD", "AIR", "FCL", "LCL", "BB"] as const;
export type JobNumberLetters = (typeof JOB_NUMBER_LETTERS)[number];

/** A Postgres / JS pattern of the optional letters right after "CZ" (no capture group). */
export const LETTERS_PATTERN = `(?:${JOB_NUMBER_LETTERS.join("|")})?`;

/**
 * A whole reference, with or without letters, its digits the one capture group. A JavaScript
 * RegExp and a Postgres substring(... from ...) read it the same way.
 */
export const JOB_NUMBER_PATTERN = `^CZ${LETTERS_PATTERN}([0-9]+)$`;

const REFERENCE = new RegExp(JOB_NUMBER_PATTERN);

/** The digits of a CZ reference, with or without letters ("00000023"); null for any other text. */
export function jobNumberDigits(jobNumber: string): string | null {
  return REFERENCE.exec(jobNumber.trim())?.[1] ?? null;
}

/** Orders references by their number (the order they were made in), whatever their letters; other text after them. */
export function compareJobNumbers(a: string, b: string): number {
  const [x, y] = [jobNumberDigits(a), jobNumberDigits(b)];
  if (x !== null && y !== null && x !== y) return Number(x) - Number(y);
  if ((x === null) !== (y === null)) return x === null ? 1 : -1;
  return a.localeCompare(b);
}

/**
 * The digits of a search word that is written as a reference, in any case and with any letters
 * ("cz00000023", "CZFCL00000023", "CZ0000002" while still typing); null for any other word. A job
 * is found by them whatever its letters are now: its letters follow its Freight Mode and Load
 * Type, and a copy elsewhere (a Trucking consignment) keeps the reference as it was then.
 */
export function referenceSearchDigits(word: string): string | null {
  return jobNumberDigits(word.toUpperCase());
}

/**
 * Whether a search text written as a reference names this reference's number - the digits it
 * starts with - whatever the letters of either (referenceSearchDigits). False for any other text.
 */
export function namesReferenceNumber(jobNumber: string, search: string): boolean {
  const digits = referenceSearchDigits(search.trim());
  return digits !== null && (jobNumberDigits(jobNumber)?.startsWith(digits) ?? false);
}
