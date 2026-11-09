// Pure rules for the letters of a master job's reference (owner decision, 9 Nov 2026). The number
// is the company's one MCZ sequence; the letters after "MCZ" say what the job is, by its Load Type:
// MCZCONSOL00000007, MCZFULL00000006, MCZPROJECT00000004. Until it has a Load Type a master job is
// plain MCZ00000008. An air Full Load, which reads Single Shipment on screen, is a Full Load here.

/** The letters a master job's reference may carry after "MCZ". */
export const MASTER_JOB_LETTERS = ["PROJECT", "CONSOL", "FULL"] as const;
export type MasterJobLetters = (typeof MASTER_JOB_LETTERS)[number];

/** A Postgres / JS pattern of the optional letters right after "MCZ" (no capture group). */
export const MASTER_JOB_LETTERS_PATTERN = `(?:${MASTER_JOB_LETTERS.join("|")})?`;

const REFERENCE = new RegExp(`^MCZ${MASTER_JOB_LETTERS_PATTERN}([0-9]+)$`);

const same = (a: string | null | undefined, b: string) => (a ?? "").trim().toLowerCase() === b.toLowerCase();

/** The letters of a master job with this Load Type; "" while it has none. */
export function masterJobLetters(loadType: string | null | undefined): MasterJobLetters | "" {
  if (same(loadType, "Consolidation")) return "CONSOL";
  if (same(loadType, "Full Load")) return "FULL";
  if (same(loadType, "Project Shipment")) return "PROJECT";
  return "";
}

/** The digits of an MCZ reference, with or without letters ("00000007"); null for any other text. */
export function masterJobNumberDigits(mczNumber: string): string | null {
  return REFERENCE.exec(mczNumber.trim())?.[1] ?? null;
}

/**
 * The reference with the letters this Load Type gives it, the number kept: MCZ00000007 as a
 * Consolidation → MCZCONSOL00000007. Text that is no MCZ reference stays as it is.
 */
export function masterJobNumberFor(mczNumber: string, loadType: string | null | undefined): string {
  const digits = masterJobNumberDigits(mczNumber);
  return digits === null ? mczNumber : `MCZ${masterJobLetters(loadType)}${digits}`;
}

/**
 * Every form this reference's number can be stored in: a screen or a link can still hold the plain
 * MCZ00000007 of a job that has since become MCZCONSOL00000007, and it means that same job.
 */
export function masterJobNumberForms(mczNumber: string): string[] {
  const digits = masterJobNumberDigits(mczNumber);
  return digits === null ? [mczNumber] : ["", ...MASTER_JOB_LETTERS].map((letters) => `MCZ${letters}${digits}`);
}
