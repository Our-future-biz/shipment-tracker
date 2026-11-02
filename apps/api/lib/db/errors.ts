// Postgres errors as drizzle surfaces them: drizzle wraps the driver's error, so the SQLSTATE
// code is on `cause` (and on the error itself when a query runs on the bare driver).

const sqlState = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
};

/** A unique constraint or unique index refused the write. */
export const isUniqueViolation = (err: unknown): boolean => sqlState(err) === "23505";

/** The constraint or index a refused write broke, by its name in the schema; undefined when Postgres names none. */
export const constraintOf = (err: unknown): string | undefined => {
  const e = err as { constraint?: unknown; cause?: { constraint?: unknown } } | null;
  const name = e?.constraint ?? e?.cause?.constraint;
  return typeof name === "string" ? name : undefined;
};

/** An EXCLUDE constraint refused the write (e.g. two bookings of one dock at once). */
export const isExclusionViolation = (err: unknown): boolean => sqlState(err) === "23P01";
