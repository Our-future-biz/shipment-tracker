import { CARD_TITLE } from "@/styles/ui";

// The Tracking tab's look, the same as the shipment's newer tabs (Documents, Costs Breakdown,
// Warehouse): framed buttons (BTN_BAR, BTN_BAR_PRIMARY in styles/ui), and tables built like the Documents table - inside the card's 16px
// padding, fixed columns, the app's TH / TD cells, a row lit on hover, no line under the last row,
// and groups under an indigo band in the card title's type.

/** The box a card's table sits in: the card's padding, scrolling sideways on a narrow screen. */
export const TABLE_BOX = "p-4 overflow-x-auto";
/** A card's table: fixed columns (each head gives its width), cells parted by their own lines. */
export const TABLE = "w-full table-fixed border-separate border-spacing-0";
/** A table body: no line under its last row (the card's edge closes it). */
export const TBODY = "[&>tr:last-child>td]:border-b-0";
/** A body row, lit while the mouse is over it. */
export const TROW = "hover:bg-slate-50 transition-colors";
/** A row's main text (a milestone, an event, a change's field). */
export const MAIN_TEXT = "text-[13px] font-medium text-slate-900";
/** A date or a time: even figures, kept on one line. */
export const DATE_TEXT = "tabular-nums whitespace-nowrap";

/** A group's band in a table (a leg of the Timeline): the Documents groups' indigo band. */
export const GROUP_BAND = `text-left px-2 py-2.5 bg-indigo-50 shadow-[inset_3px_0_0_var(--color-indigo-500)] ${CARD_TITLE}`;
/** The air above a group's band (none above the first, which sits under the column heads). */
export const GROUP_GAP = "h-4 p-0";

/** A cell's value on its own (Recorded, a status in words): the grid's 13px text, as TD has it. */
export const CELL_TEXT = "text-[13px] text-slate-700";
/** The same kept on one line: cut with "…" where the column ends (the whole of it in its title). */
export const CELL_LINE = `${CELL_TEXT} block truncate`;
