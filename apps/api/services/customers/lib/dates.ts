import { APIError } from "encore.dev/api";

// Date columns are `date` (null when unknown); the API keeps them as "yyyy-mm-dd" strings with
// "" for none, so clients never meet null for them.

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** A real calendar date as yyyy-mm-dd, or null. Accepts a longer ISO timestamp's date part. */
export function isoDateOrNull(value: string): string | null {
  const v = value.trim().slice(0, 10);
  const m = ISO_DATE.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d ? v : null;
}

/**
 * An API date for a write: undefined stays undefined (field not sent), "" clears it (null),
 * a valid date is kept; anything else is refused naming the field.
 */
export function dateInput(value: string | undefined, field: string): string | null | undefined {
  if (value === undefined) return undefined;
  if (value.trim() === "") return null;
  const iso = isoDateOrNull(value);
  if (!iso) throw APIError.invalidArgument(`${field} must be a date (yyyy-mm-dd)`);
  return iso;
}

/** A date column for the API: "" when null. */
export const dateOutput = (value: string | null): string => value ?? "";
