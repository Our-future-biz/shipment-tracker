// Pure rules for the letters of a shipment's Internal Reference (owner decision, 3 Nov 2026).
// The number is the company's CZ sequence; letters after "CZ" say what the job is, by its Freight
// Mode and Load Type: CZAIR00000023, CZFCL…, CZLCL…, CZBB…, CZPROJECT…, CZRAIL…, CZROAD….
// A Project Shipment is CZPROJECT by any freight mode. While the letters can't be told yet (Sea
// Freight without a Load Type, no Freight Mode) the reference is plain CZ00000023.

/** The letters a reference may carry after "CZ", longest first so a pattern tries them in order. */
export const JOB_NUMBER_LETTERS = ["PROJECT", "RAIL", "ROAD", "AIR", "FCL", "LCL", "BB"] as const;
export type JobNumberLetters = (typeof JOB_NUMBER_LETTERS)[number];

const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.toLowerCase();

/** The letters of a job with this Freight Mode and Load Type; "" while they can't be told. */
export function jobNumberLetters(freightMode: string | null | undefined, loadType: string | null | undefined): JobNumberLetters | "" {
  if (same(loadType, "Project Shipment")) return "PROJECT";
  if (same(freightMode, "Air Freight")) return "AIR";
  if (same(freightMode, "Sea Break Bulk")) return "BB";
  if (same(freightMode, "Rail Freight")) return "RAIL";
  if (same(freightMode, "Road Freight")) return "ROAD";
  if (same(freightMode, "Sea Freight")) {
    if (same(loadType, "Full Load")) return "FCL";
    if (same(loadType, "Consolidation")) return "LCL";
  }
  return "";
}

/** A Postgres / JS pattern of the optional letters right after "CZ" (no capture group). */
export const LETTERS_PATTERN = `(?:${JOB_NUMBER_LETTERS.join("|")})?`;

const REFERENCE = new RegExp(`^CZ${LETTERS_PATTERN}([0-9]+)$`);

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
 * The reference with the letters this Freight Mode and Load Type give it, the number kept:
 * CZ00000023 by Air → CZAIR00000023. Text that is no CZ reference stays as it is.
 */
export function jobNumberFor(jobNumber: string, freightMode: string | null | undefined, loadType: string | null | undefined): string {
  const digits = jobNumberDigits(jobNumber);
  return digits === null ? jobNumber : `CZ${jobNumberLetters(freightMode, loadType)}${digits}`;
}
