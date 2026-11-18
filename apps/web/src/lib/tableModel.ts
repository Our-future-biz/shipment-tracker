import { matchesGridFilters, storedGridFilters, type GridFilterColumn } from "@/components/gridFilters";
import type { ColumnViewScope } from "@/hooks/useColumnPrefs";
import { fold } from "@/lib/fold";

// A Finance table's Filter and Columns model (Accounts Payable, Accounts Receivable): its columns, the operator's
// checks as a filter column of their own (so a saved filter set keeps them), and the pure rules that match rows,
// drop unknown saved filters and keep the shown columns in table order. Used with @/hooks/useTableControls.

/** The filter column of the operator's checks: one row per check, every one of them must hold. */
export const CHECK_KEY = "check";

/** One of the operator's checks: a chip on the bar and a row of the Filter panel. */
export interface CheckDef<K extends string> {
  key: K;
  /** The words of the chip and of the saved filter */
  label: string;
  tip: string;
}

/** A column the table can show and filter on. */
export type TableColumn = GridFilterColumn & { title: string };

export interface TableModel<R, K extends string> {
  /** The scope of the columns, the column templates and the filter templates */
  scope: string;
  /** Every column the table can show, in table order; the picker offers them and the filters match their text */
  columns: TableColumn[];
  /** Always shown, never unticked */
  first: string;
  /** For useColumnPrefs: one stable object, every column shown at first */
  view: ColumnViewScope;
  checks: CheckDef<K>[];
  /** What the Filter panel offers: the checks first, then the columns */
  filterColumns: GridFilterColumn[];
  cellText: (row: R, key: string) => string;
  passesCheck: (row: R, check: K) => boolean;
}

/** A table's model from its columns and checks: every column shown at first, the checks offered first in the Filter panel. */
export function tableModel<R, K extends string>(m: Omit<TableModel<R, K>, "view" | "filterColumns"> & { checksTitle: string }): TableModel<R, K> {
  const { checksTitle, ...rest } = m;
  return {
    ...rest,
    view: { scope: m.scope, defaults: m.columns.map((c) => c.key) },
    filterColumns: [{ key: CHECK_KEY, title: checksTitle, options: m.checks.map((c) => c.label) }, ...m.columns],
  };
}

/** The check a filter row names (by its words, as saved), or none: a check since renamed narrows nothing. */
export const checkOf = <K extends string>(m: Pick<TableModel<never, K>, "checks">, value: string): CheckDef<K> | undefined =>
  m.checks.find((c) => fold(c.label) === fold(value.trim()));

/** The filters the table knows: on one of its columns, or a check it has. A saved set's other rows are dropped. */
export function knownFilters<K extends string>(m: Pick<TableModel<never, K>, "checks" | "columns">, filters: readonly { key: string; value: string }[]): { key: string; value: string }[] {
  return filters.filter((f) => (f.key === CHECK_KEY ? !!checkOf(m, f.value) : m.columns.some((c) => c.key === f.key)));
}

/** Whether a row passes the Filter panel: every check named, and every column row (contains; a column with options equals). */
export function matchesTableFilters<R, K extends string>(m: TableModel<R, K>, row: R, filters: readonly { key: string; value: string }[]): boolean {
  const active = storedGridFilters(filters);
  for (const f of active) {
    if (f.key !== CHECK_KEY) continue;
    const check = checkOf(m, f.value);
    if (check && !m.passesCheck(row, check.key)) return false;
  }
  const columns = active.filter((f) => f.key !== CHECK_KEY && m.columns.some((c) => c.key === f.key));
  return matchesGridFilters(row, columns, m.cellText, (key) => !!m.columns.find((c) => c.key === key)?.options);
}

/** The columns shown, in table order, the first always among them; anything unknown is dropped. */
export function normalizeColumns(m: Pick<TableModel<never, string>, "columns" | "first">, keys: unknown): string[] {
  const list = new Set(Array.isArray(keys) ? keys.filter((k): k is string => typeof k === "string") : []);
  return m.columns.map((c) => c.key).filter((k) => k === m.first || list.has(k));
}

/** The table's columns (antd's, each with its key) that are shown, in table order. */
export const shownColumns = <C extends { key?: unknown }>(columns: readonly C[], visible: readonly string[]): C[] => columns.filter((c) => visible.includes(String(c.key)));
