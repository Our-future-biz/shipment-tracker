const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whether a text has the form of a record's id. An address is typed by hand or bookmarked: what
// it holds in place of an id is checked before the server is asked, which would answer anything
// else with an error of its own.
export function isUuid(value: string): boolean {
  return UUID.test(value);
}
