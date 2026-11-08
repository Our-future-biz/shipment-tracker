"use client";

import { useEffect, useState } from "react";

// A filled table row is locked, so it is not changed by accident: a double-click on it opens it, and
// a click anywhere else (or Enter in a field) locks it again. One row is open at a time.

/** The attribute the open row carries; a click inside it, or in a dropdown it opened, keeps it open. */
export const OPEN_ROW_ATTR = "data-row-open";

/** A locked row's input: it reads as text and takes no typing (it still takes the double-click that opens the row). */
export const LOCKED_INPUT = "!border-transparent !bg-transparent !shadow-none !cursor-pointer";

/** A locked row's select, checkbox or switch: it reads as it is, and a click on it does nothing (a double-click opens the row). */
export const LOCKED_CONTROL =
  "pointer-events-none [&_.ant-select-selector]:!border-transparent [&_.ant-select-selector]:!bg-transparent [&_.ant-select-selector]:!shadow-none [&_.ant-select-arrow]:!hidden [&_.ant-select-selection-item-remove]:!hidden";

export function useOpenRow() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  useEffect(() => {
    if (!openKey) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element | null;
      // Antd draws dropdowns, menus and tooltips outside the table: picking in them is still editing.
      if (target?.closest?.(`[${OPEN_ROW_ATTR}], .ant-select-dropdown, .ant-dropdown, .ant-tooltip, .ant-popover, .ant-modal-wrap`)) return;
      setOpenKey(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [openKey]);
  return { openKey, open: (key: string) => setOpenKey(key), close: () => setOpenKey(null) };
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
