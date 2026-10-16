// "Filter by column" rows shared by the app's grids (AppGrid and the Customer Database list):
// each row keeps the rows whose cell in `key` contains `value`, any case. A row has its own id,
// so removing one in the middle never shifts what the others show.

export interface GridFilter {
  id: string;
  key: string;
  value: string;
}

/** A column a filter can be set on; with `options` its value is picked from them instead of typed. */
export interface GridFilterColumn {
  key: string;
  title: string;
  options?: readonly string[];
}

let lastId = 0;
/** A new id for a filter row (unique within the page). */
export const newFilterId = () => `f${++lastId}`;

/** A filter row from a stored or URL `{ key, value }`. */
export const withFilterId = (f: { key: string; value: string }): GridFilter => ({ id: newFilterId(), key: f.key, value: f.value });

/** The rows that narrow anything: a column chosen and a value typed. */
export const activeGridFilters = <F extends { key: string; value: string }>(filters: readonly F[]): F[] =>
  filters.filter((f) => f.key && f.value.trim());

/** The filters as stored (templates, URL): key and trimmed value, without the row ids. */
export const storedGridFilters = (filters: readonly { key: string; value: string }[]) =>
  activeGridFilters(filters).map((f) => ({ key: f.key, value: f.value.trim() }));

/** Whether a row passes every active filter; `cellText` gives the row's text in a column. */
export function matchesGridFilters<T>(row: T, filters: readonly { key: string; value: string }[], cellText: (row: T, key: string) => string): boolean {
  return activeGridFilters(filters).every((f) => cellText(row, f.key).toLowerCase().includes(f.value.toLowerCase().trim()));
}

/** The grid toolbar's square icon button. */
export const TOOLBAR_BUTTON_CLASS =
  "flex items-center justify-center shrink-0 rounded-lg border border-slate-300 bg-white w-8 h-8 p-0 text-slate-700 hover:bg-slate-50 transition-colors";
