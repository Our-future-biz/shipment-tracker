"use client";

import { useEffect, useState } from "react";

// The row lock of an editable table (a shipment's Cargo Details, a quote's cargo lines): a line
// reads as text, a double-click opens it for editing, and focus leaving it, Enter or a click
// outside closes it again.

// Where a click does not end the editing of a row: an open row of the same table and the popups
// (pickers, the "⋯" menu, the delete confirmation, tooltips), which render outside the row. Two
// tables on one page each have their own name, so a click into the other table's open row ends it.
export const editRowAreas = (table: string) =>
  `[data-edit-row="${table}"], .ant-select-dropdown, .ant-dropdown, .ant-modal-root, .ant-tooltip, .ant-picker-dropdown`;

/**
 * Which rows of a table are open for editing, by index. An open row carries
 * `data-edit-row={table}` and the handlers onRowBlur / onRowKeyDown. A row closes when focus
 * leaves it or on Enter; saving is left to each field's own onBlur, so leaving a row saves exactly once.
 */
export function useOpenRows(table: string) {
  const [rows, setRows] = useState<Set<number>>(() => new Set());
  // A click outside every row being edited ends the editing. Focus leaving a row closes it
  // too, but a row opened by double-click may never have had focus, so the click itself is
  // watched.
  const anyOpen = rows.size > 0;
  useEffect(() => {
    if (!anyOpen) return;
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (!target?.closest || target.closest(editRowAreas(table))) return;
      // The field being typed in is left first, so its own onBlur saves it: closing the row
      // removes the field before the click would move the focus, and its last value was lost.
      const typing = document.activeElement as HTMLElement | null;
      if (typing?.closest?.(`[data-edit-row="${table}"]`)) typing.blur();
      setRows(new Set());
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [anyOpen, table]);
  const open = (idx: number) => setRows((o) => (o.has(idx) ? o : new Set(o).add(idx)));
  const close = (idx: number) =>
    setRows((o) => {
      if (!o.has(idx)) return o;
      const next = new Set(o);
      next.delete(idx);
      return next;
    });
  return {
    isOpen: (idx: number) => rows.has(idx),
    indexes: rows,
    open,
    reset: () => setRows(new Set()),
    set: (idxs: number[]) => setRows(new Set(idxs)),
    // Clicking plain background gives no relatedTarget, so check where focus really went.
    onRowBlur: (idx: number) => (e: React.FocusEvent<HTMLElement>) => {
      if (e.relatedTarget && e.currentTarget.contains(e.relatedTarget as Node)) return;
      const row = e.currentTarget;
      setTimeout(() => {
        if (!row.contains(document.activeElement)) close(idx);
      }, 0);
    },
    onRowKeyDown: (idx: number) => (e: React.KeyboardEvent) => {
      if (e.key !== "Enter") return;
      // Blurring the field fires its own onBlur, which saves it.
      (e.target as HTMLElement).blur?.();
      close(idx);
    },
  };
}
