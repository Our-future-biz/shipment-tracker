import type { ColumnType } from "antd/es/table";

/**
 * How an AppGrid column draws its cells: its own render, or antd's value at its dataIndex - and a
 * column with neither shows its text (antd would leave every cell of it empty).
 */
export function cellRender<T>(col: Pick<ColumnType<T>, "render" | "dataIndex">, text: (row: T) => string): ColumnType<T>["render"] {
  if (col.render || col.dataIndex !== undefined) return col.render;
  return (_value, row) => text(row);
}
