"use client";

import { ColumnPickerPopover, type ColumnPickerPopoverProps } from "@/components/ColumnPickerPopover";
import { CUSTOMER_LIST_COLUMNS, NAME_COLUMN_KEY } from "../_lib/customerListColumns";

export type { ColumnTemplate } from "@/components/ColumnPickerPopover";

const ALL_KEYS = CUSTOMER_LIST_COLUMNS.map((c) => c.key);
const FIXED_KEYS = [NAME_COLUMN_KEY];

// The Customer Database list's "Columns" button: the shared picker with the list's columns.
export function CustomerColumnPicker(props: Omit<ColumnPickerPopoverProps, "columns" | "fixedKeys" | "allKeys">) {
  return <ColumnPickerPopover {...props} columns={CUSTOMER_LIST_COLUMNS} fixedKeys={FIXED_KEYS} allKeys={ALL_KEYS} />;
}
