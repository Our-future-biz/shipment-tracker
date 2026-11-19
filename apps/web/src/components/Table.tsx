"use client";

import { Table as AntTable } from "antd";
import type { TableProps } from "antd";
import { layoutWithoutSticky } from "@/lib/tableLayout";

// The app's table: antd's, with its column titles kept in view while the rows scroll under them
// (antd's sticky header), so the user always sees which column is which. How far down they stop is
// set in globals.css: under the top bar on a page, at the top of a drawer or a dialog. A scrolling
// box around the table (overflow auto or hidden) stops them: let the table scroll sideways itself
// (`scroll.x`) and clip a card with `overflow-clip`. A table that must not keep them passes
// `sticky={false}`. Use this one instead of antd's own Table.
function StickyTable<T extends object>({ sticky = true, ...props }: TableProps<T>) {
  return <AntTable<T> sticky={sticky} {...props} tableLayout={sticky ? layoutWithoutSticky(props) : props.tableLayout} />;
}

export const Table = Object.assign(StickyTable, {
  Summary: AntTable.Summary,
  Column: AntTable.Column,
  ColumnGroup: AntTable.ColumnGroup,
  SELECTION_COLUMN: AntTable.SELECTION_COLUMN,
  EXPAND_COLUMN: AntTable.EXPAND_COLUMN,
  SELECTION_ALL: AntTable.SELECTION_ALL,
  SELECTION_INVERT: AntTable.SELECTION_INVERT,
  SELECTION_NONE: AntTable.SELECTION_NONE,
});
