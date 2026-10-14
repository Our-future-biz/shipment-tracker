/**
 * Invoice numbers: document prefix + year of the job + job number + 3-digit sequence,
 * e.g. INV2026CZ00000028-001 (invoice) or CN2026CZ00000028-001 (credit note).
 * Each job has its own series per document type.
 */

export type DocumentPrefix = "INV" | "CN";

/** "INV2026CZ00000028-" - everything before the sequence number. */
export function invoiceSeriesPrefix(prefix: DocumentPrefix, jobYear: number, jobNumber: string): string {
  return `${prefix}${jobYear}${jobNumber}-`;
}

export function formatInvoiceNumber(prefix: DocumentPrefix, jobYear: number, jobNumber: string, seq: number): string {
  return `${invoiceSeriesPrefix(prefix, jobYear, jobNumber)}${String(seq).padStart(3, "0")}`;
}

/**
 * Next sequence number in a series: one above the highest existing number with that
 * prefix. Numbers of other series (other prefix or year, or the old "CZ00000028-001"
 * format) are ignored.
 */
export function nextSequence(existingNumbers: string[], seriesPrefix: string): number {
  let max = 0;
  for (const n of existingNumbers) {
    if (!n.startsWith(seriesPrefix)) continue;
    const seq = Number(n.slice(seriesPrefix.length));
    if (Number.isInteger(seq) && seq > max) max = seq;
  }
  return max + 1;
}

/**
 * Year of the job, from the date the job was created (ISO string), in Prague time: a job
 * created at 00:30 on 1 January is that year's job, although it is still 31 December in UTC.
 */
export function jobYear(createdAt: string | Date): number {
  const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid job date: ${String(createdAt)}`);
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric" }).format(d));
}
