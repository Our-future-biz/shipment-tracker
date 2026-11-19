import type { TableProps } from "antd";

type Columns<T> = NonNullable<TableProps<T>["columns"]>;

function someColumn<T>(columns: Columns<T> | undefined, test: (c: Columns<T>[number]) => boolean): boolean {
  return (columns ?? []).some((c) => test(c) || ("children" in c && someColumn(c.children as Columns<T>, test)));
}

/**
 * The layout antd gives a table without its titles kept in view (components/Table.tsx). With them
 * antd sets every table whose columns are not fixed to `fixed` - columns of equal share instead of as
 * wide as what they hold - so such a table keeps `auto`, as before. Where antd chose `fixed` anyway
 * (rows scrolled inside a set height, a column cut short with "…", fixed columns in a table of a set
 * width) it still does: undefined leaves the choice to antd.
 */
export function layoutWithoutSticky<T>({ tableLayout, scroll, columns }: Pick<TableProps<T>, "tableLayout" | "scroll" | "columns">): TableProps<T>["tableLayout"] {
  if (tableLayout) return tableLayout;
  if (scroll?.y) return undefined;
  if (someColumn(columns, (c) => !!c.ellipsis)) return undefined;
  if (scroll?.x && scroll.x !== "max-content" && someColumn(columns, (c) => !!c.fixed)) return undefined;
  return "auto";
}
