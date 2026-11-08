import type { KeyboardEvent } from "react";
import { amountTypingAllowed } from "@/lib/money";

// The fields of the cost tables (a shipment's Costs Breakdown, a master job's Buying costs): one
// look and one way of typing an amount in both. Their currency is CurrencyPicker.

/** A field of a cost row: 30px high, a slate frame, indigo when in focus. */
export const FIELD =
  "w-full h-[30px] px-2 text-[13px] text-slate-900 border border-slate-300 rounded-md outline-none " +
  "focus:border-indigo-500 bg-white";

/** A cost row's Category: a borderless Select (variant="borderless") in a 30px slate-200 frame. */
export const CATEGORY_SELECT =
  "w-full [&_.ant-select-selector]:!h-[30px] [&_.ant-select-selector]:!border " +
  "[&_.ant-select-selector]:!border-slate-200 [&_.ant-select-selector]:!rounded-md " +
  "[&_.ant-select-selection-item]:!text-[13px]";
/** Its look on a locked row: no frame, no arrow, no clicks. */
export const CATEGORY_SELECT_LOCKED = "[&_.ant-select-selector]:!border-transparent [&_.ant-select-arrow]:!hidden pointer-events-none";

/**
 * A quantity or amount field: a key that would type anything but a number (a digit, "," or ".", a
 * space, a minus in front) types nothing. Shortcuts (copy, paste, select all) and what is pasted are
 * left alone: pasted text goes in as it is, and the save refuses it when it is no amount (notAnAmount)
 * rather than saving what is left of it once its letters are gone ("2 x 40HC" is not 240).
 */
export function onlyNumbers(e: KeyboardEvent<HTMLInputElement>) {
  // Ctrl / Cmd shortcuts pass; AltGr (Ctrl + Alt on Windows) and Option types a character, judged below
  if (e.key.length !== 1 || e.metaKey || (e.ctrlKey && !e.altKey) || e.nativeEvent.isComposing) return;
  const el = e.currentTarget;
  if (el.readOnly) return;
  const start = el.selectionStart ?? el.value.length;
  if (!amountTypingAllowed(e.key, el.value, start, el.selectionEnd ?? start)) e.preventDefault();
}

/** Why a typed amount is not saved: it follows "Could not save the change: ". */
export const notAnAmount = (text: string) => `"${text}" is not a valid amount (max. 2 decimals)`;

/** An amber warning over a cost table: the icon in WARNING_ICON, the text in WARNING_TEXT with its lead in bold. */
export const WARNING_BANNER = "flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3";
export const WARNING_ICON = "text-amber-600 mt-[2px]";
export const WARNING_TEXT = "text-[13px] text-amber-900";
