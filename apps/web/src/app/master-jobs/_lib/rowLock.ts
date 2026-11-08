"use client";

import { useEffect, useState } from "react";

// A filled table row is locked, so it is not changed by accident: a double-click on it opens it, and
// a click anywhere else, the focus leaving it (Tab) or Enter in a field locks it again. One row is open at a time.

/** The attribute the open row carries; a click inside it, or in a dropdown it opened, keeps it open. */
export const OPEN_ROW_ATTR = "data-row-open";

/** A locked row's input: it reads as text and takes no typing (it still takes the double-click that opens the row). */
export const LOCKED_INPUT = "!border-transparent !bg-transparent !shadow-none !cursor-pointer";

/** A locked row's select, checkbox or switch: it reads as it is, and a click on it does nothing (a double-click opens the row). */
export const LOCKED_CONTROL =
  "pointer-events-none [&_.ant-select-selector]:!border-transparent [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!shadow-none [&_.ant-select-arrow]:!hidden [&_.ant-select-selection-item-remove]:!hidden";

/** A locked row itself, as Container Details' rows in read mode: the pointer, the hover tint, and no text picked up by the double-click. */
export const LOCKED_ROW = "cursor-pointer select-none hover:bg-slate-50";

// Antd draws dropdowns, menus, tooltips and dialogs outside the table: a click or the focus there is still editing.
const INSIDE_ROW = `[${OPEN_ROW_ATTR}], .ant-select-dropdown, .ant-dropdown, .ant-tooltip, .ant-popover, .ant-modal-wrap`;

// What takes the cursor in a row opened by a double-click.
const FIELD = "input:not([type=hidden]), textarea";

export function useOpenRow() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    if (!openKey) return;
    const outside = (e: Event) => !(e.target as Element | null)?.closest?.(INSIDE_ROW);
    const onDown = (e: MouseEvent) => {
      if (outside(e)) setOpenKey(null);
    };
    // Only this row locks: a row opened in the same moment, its field focused at once, stays open.
    const onFocusIn = (e: FocusEvent) => {
      if (outside(e)) setOpenKey((key) => (key === openKey ? null : key));
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, [openKey]);

  /**
   * Opens a row. Given the double-click that opened it, the field clicked (its [data-field] or td, else
   * the row's first field) takes the cursor at its end, so the word the double-click selected is not typed over.
   */
  const open = (key: string, e?: React.MouseEvent<HTMLElement>) => {
    setOpenKey(key);
    if (!e) return;
    const row = e.currentTarget;
    const hit = (e.target as Element).closest?.("[data-field], td");
    const cell = hit && row.contains(hit) ? hit : row;
    // Once the row shows open: its fields are editable then.
    setTimeout(() => {
      window.getSelection()?.removeAllRanges();
      const field = cell.querySelector<HTMLInputElement | HTMLTextAreaElement>(FIELD) ?? row.querySelector<HTMLInputElement | HTMLTextAreaElement>(FIELD);
      if (!field) return;
      field.focus();
      try {
        field.setSelectionRange(field.value.length, field.value.length);
      } catch {
        // A checkbox or radio has no cursor: the focus is enough.
      }
    }, 0);
  };
  return { openKey, open, close: () => setOpenKey(null) };
}

/** Enter in a field of the open row locks it (the field's own blur saves it, where it saves on blur). */
export function lockOnEnter(close: () => void) {
  return (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    const field = e.target as HTMLElement;
    // Enter in a select picks an option; it does not lock the row.
    if (field.closest(".ant-select")) return;
    field.blur?.();
    close();
  };
}
