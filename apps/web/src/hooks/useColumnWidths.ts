"use client";

import { useCallback, useEffect, useState } from "react";

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

/**
 * The column widths a user set on a grid, kept in this browser under their user id (so another
 * user on the same computer keeps their own). Apart from the column templates: a template gives
 * the columns, the widths stay the user's.
 */
export function useColumnWidths(userId: string | undefined, scope = "shipment") {
  const storageKey = userId ? `${scope}ColumnWidths:${userId}` : null;
  const [widths, setWidths] = useState<ColumnWidths>({});

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

  const setWidth = useCallback((key: string, width: number) => save({ ...widths, [key]: clampColumnWidth(width) }), [save, widths]);

  // Back to the column's own width.
  const resetWidth = useCallback(
    (key: string) => {
      if (key in widths) save(Object.fromEntries(Object.entries(widths).filter(([k]) => k !== key)));
    },
    [save, widths],
  );

  const resetAll = useCallback(() => save({}), [save]);

  return { widths, setWidth, resetWidth, resetAll };
}
