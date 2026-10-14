import { APIError } from "encore.dev/api";

// Amounts arrive as decimal strings and go into numeric columns. Postgres rejects "" and
// anything that isn't a number, so they are checked here instead of failing as a 500.

/**
 * `value` as stored in a numeric(…, scale) column: undefined stays undefined (not sent),
 * blank becomes null (cleared), a decimal with at most `scale` places is kept as given.
 */
export function toDecimal(value: string | undefined, field: string, scale = 2): string | null | undefined {
  if (value === undefined) return undefined;
  const t = value.trim();
  if (t === "") return null;
  if (!new RegExp(`^-?\\d{1,12}(\\.\\d{1,${scale}})?$`).test(t)) {
    throw APIError.invalidArgument(`${field} must be a number with at most ${scale} decimal places`);
  }
  return t;
}

/** `data` without its undefined fields, so they don't overwrite defaults or stored values. */
export function definedOnly<T extends object>(data: T): Partial<T> {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)) as Partial<T>;
}
