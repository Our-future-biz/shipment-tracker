const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Whether a text has the form of a record's id. An id out of a request is checked before it
 * reaches SQL: Postgres answers anything else in a uuid column with an error of its own.
 */
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
