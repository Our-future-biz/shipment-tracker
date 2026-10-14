// Postgres errors as drizzle surfaces them: drizzle wraps the driver's error, so the SQLSTATE
// code is on `cause` (and on the error itself when a query runs on the bare driver).

const sqlState = (err: unknown): string | undefined => {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  const code = e?.code ?? e?.cause?.code;
  return typeof code === "string" ? code : undefined;
};

/** A unique constraint or unique index refused the write. */
export const isUniqueViolation = (err: unknown): boolean => sqlState(err) === "23505";
