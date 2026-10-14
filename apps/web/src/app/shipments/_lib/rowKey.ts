// Stable React keys for editable rows that have no id of their own (cargo lines, dimension
// lines, unsaved containers). The key lives on the row object under a Symbol: object spread
// (`{ ...row, ...patch }`) carries it over to the edited copy, and JSON.stringify drops it,
// so it never reaches the API. Keying by index would hand one row's DOM and focus to the next
// one when a row is removed.

const ROW_KEY = Symbol("rowKey");
let counter = 0;

type Keyed = { [ROW_KEY]?: string };

/** The row's key, created the first time it is asked for. */
export function rowKey(row: object): string {
  const keyed = row as Keyed;
  keyed[ROW_KEY] ??= `row-${++counter}`;
  return keyed[ROW_KEY];
}
