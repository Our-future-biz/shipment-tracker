"use client";

import { useCallback, useEffect, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import type { ColumnsType } from "antd/es/table";
import { FadeText } from "@/components/FadeText";

// The narrowest and widest a column can be dragged to, in pixels.
export const MIN_COLUMN_WIDTH = 50;
export const MAX_COLUMN_WIDTH = 800;

export const clampColumnWidth = (width: number): number =>
  Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, width)));

// Only the columns the user dragged to a width of their own: { columnKey: px }.
export type ColumnWidths = Record<string, number>;

// A stored value as widths: anything that is not a sensible width is left out.
export function parseColumnWidths(raw: string | null): ColumnWidths {
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const widths: ColumnWidths = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "number" && Number.isFinite(value)) widths[key] = clampColumnWidth(value);
    }
    return widths;
  } catch {
    return {};
  }
}

// What a header cell (DraggableHeaderCell) needs for the handle on its right edge.
export interface ResizeHeaderProps {
  onResizeWidth: (width: number, done: boolean) => void;
  onResetWidth: () => void;
}

export interface ColumnSizing {
  /** The width the user gave a column (while dragging, the width so far); none, it keeps its own. */
  widthOf: (key: string) => number | undefined;
  resizeProps: (key: string) => ResizeHeaderProps;
}

/**
 * The column widths a user set on a grid, kept in this browser under their user id (so another
 * user on the same computer keeps their own). Apart from the column templates: a template gives
 * the columns, the widths stay the user's. Each grid keeps its own under `scope`; none, nothing is kept.
 */
export function useColumnWidths(userId: string | undefined, scope: string | undefined) {
  const storageKey = userId && scope ? `${scope}:columnWidths:${userId}` : null;
  const [widths, setWidths] = useState<ColumnWidths>({});
  // The column whose edge is being dragged, at the width it has so far (saved once let go).
  const [dragging, setDragging] = useState<{ key: string; width: number } | null>(null);

  useEffect(() => {
    if (!storageKey) return setWidths({});
    try {
      setWidths(parseColumnWidths(localStorage.getItem(storageKey)));
    } catch {
      setWidths({});
    }
  }, [storageKey]);

  const save = useCallback(
    (next: ColumnWidths) => {
      setWidths(next);
      if (!storageKey) return;
      try {
        if (Object.keys(next).length) localStorage.setItem(storageKey, JSON.stringify(next));
        else localStorage.removeItem(storageKey);
      } catch {
        /* ignore quota / unavailable */
      }
    },
    [storageKey],
  );

  const widthOf = useCallback((key: string) => (dragging?.key === key ? dragging.width : widths[key]), [dragging, widths]);

  const resizeProps = useCallback(
    (key: string): ResizeHeaderProps => ({
      onResizeWidth: (width, done) => {
        if (!done) return setDragging({ key, width: clampColumnWidth(width) });
        setDragging(null);
        save({ ...widths, [key]: clampColumnWidth(width) });
      },
      // Back to the column's own width.
      onResetWidth: () => {
        if (key in widths) save(Object.fromEntries(Object.entries(widths).filter(([k]) => k !== key)));
      },
    }),
    [save, widths],
  );

  const resetAll = useCallback(() => save({}), [save]);

  return { widths, widthOf, resizeProps, resetAll, hasWidths: Object.keys(widths).length > 0 };
}

// A column's key for its width: its `key`, else a plain `dataIndex`.
function columnKeyOf(col: { key?: unknown; dataIndex?: unknown }): string | undefined {
  if (typeof col.key === "string" || typeof col.key === "number") return String(col.key);
  return typeof col.dataIndex === "string" ? col.dataIndex : undefined;
}

/**
 * The columns with a resize handle on each titled header (a column without a title, such as an
 * icon column, keeps its width). For a table as wide as its content (scroll x "max-content"), where
 * a column is never narrower than its text: one the user sized is held at that width on every
 * cell, and a value too long for it fades out at the end (the whole of it shows after a 1 s
 * hover), as the editable cells do. The table's header cell must be DraggableHeaderCell.
 */
export function resizableColumns<T>(columns: ColumnsType<T>, sizing: ColumnSizing): ColumnsType<T> {
  return columns.map((col) => {
    const key = columnKeyOf(col as { key?: unknown; dataIndex?: unknown });
    if (!key || !col.title || "children" in col) return col;
    const width = sizing.widthOf(key);
    const held: CSSProperties | undefined = width === undefined ? undefined : { width, minWidth: width, maxWidth: width };
    const ownHeader = col.onHeaderCell;
    const ownCell = col.onCell;
    const ownRender = col.render;
    const fade = (content: ReactNode) => <FadeText plainFull>{content}</FadeText>;
    return {
      ...col,
      width: width ?? col.width,
      // Only a held column can be narrower than its text.
      ...(held && {
        title: typeof col.title === "function" ? col.title : fade(col.title),
        render: (value: unknown, record: T, index: number) => fade((ownRender ? ownRender(value, record, index) : value) as ReactNode),
      }),
      onHeaderCell: (column) => {
        const own = ownHeader?.(column);
        return { ...own, ...sizing.resizeProps(key), style: { ...own?.style, ...held } } as HTMLAttributes<HTMLTableCellElement>;
      },
      onCell: held
        ? (record, index) => {
            const own = ownCell?.(record, index);
            return { ...own, style: { ...own?.style, ...held } };
          }
        : ownCell,
    };
  });
}
