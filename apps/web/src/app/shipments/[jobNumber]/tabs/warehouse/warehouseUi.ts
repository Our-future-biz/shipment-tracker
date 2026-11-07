import { BTN, BTN_PRIMARY, BTN_SM, ICON_BTN_GHOST, LABEL_TEXT } from "@/styles/ui";

// The Warehouse tab's look, the same as the shipment's newer tabs (Container Details, Costs
// Breakdown): column titles in small bold caps over a rule, rows parted by a light line, a totals
// row under a thicker one, and framed buttons in a card's title bar.

/** A card title-bar button: white and framed. */
export const BAR_BTN = `${BTN} ${BTN_SM} shadow-sm`;
/** The card's main action in its title bar (Save): purple. */
export const BAR_BTN_PRIMARY = `${BTN_PRIMARY} ${BTN_SM} !text-white hover:!text-white shadow-sm`;
/** A row's delete: a quiet icon that turns red on hover. */
export const ROW_DELETE = `${ICON_BTN_GHOST} hover:!bg-red-50 hover:!text-red-600`;

/** A column title. */
export const TH_CELL = `px-2 pb-2 ${LABEL_TEXT} border-b border-slate-200 whitespace-nowrap`;
/** A body cell. */
export const TD_CELL = "px-2 py-1.5 align-middle";
/** The line under each body row but the last. */
export const rowLine = (i: number, count: number) => (i < count - 1 ? "border-b border-slate-100" : "");
/** A totals-row cell: under a thicker rule, the figures in semibold. */
export const TOTAL_CELL = "px-2 pt-3 pb-1 border-t-2 border-slate-200 text-[13px] font-semibold text-slate-900 tabular-nums";
/** A row's quiet icon action (Duplicate). */
export const ROW_BTN = ICON_BTN_GHOST;
