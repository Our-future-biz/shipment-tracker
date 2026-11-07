import { LABEL_TEXT, TD_TOTAL } from "@/styles/ui";

// The Warehouse tab's look, the same as the shipment's newer tabs (Container Details, Costs
// Breakdown): column titles in small bold caps over a rule, rows parted by a light line, a totals
// row under a thicker one, and framed buttons in a card's title bar (BTN_BAR, BTN_BAR_PRIMARY in
// styles/ui).

/** A column title. */
export const TH_CELL = `px-2 pb-2 ${LABEL_TEXT} border-b border-slate-200 whitespace-nowrap`;
/** A body cell. */
export const TD_CELL = "px-2 py-1.5 align-middle";
/** The line under each body row but the last. */
export const rowLine = (i: number, count: number) => (i < count - 1 ? "border-b border-slate-100" : "");
/** A totals-row cell: the app's totals cell, a little more air above it, figures lined up. */
export const TOTAL_CELL = `${TD_TOTAL} !pt-3 !pb-1 tabular-nums`;
