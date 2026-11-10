import { BTN, CARD as APP_CARD, EMPTY as APP_EMPTY, LABEL_TEXT, REF } from "@/styles/ui";

// One look for every field card of a shipment (Shipment Details, Customs), built on the app's
// own (styles/ui.ts): a white card, its indigo title bar, rows of small bold caps label + value.

/** The card shell, as the Container / Cargo Details tables have it. */
export const CARD = `${APP_CARD} overflow-hidden flex flex-col`;
/** The card's body under its title line. Rows carry their own padding. */
export const CARD_BODY = "px-4 py-1.5 flex-1";
/** Two columns inside a card; the gap keeps label columns aligned across cards. */
export const COLS2 = "grid grid-cols-1 md:grid-cols-2 gap-x-8 2xl:gap-x-10";

/** One label + value row. The outer element of every row is a div with this class. */
export const ROW =
  "flex items-center gap-3 min-h-[34px] py-1 -mx-2 px-2 border-b border-slate-100 last:border-b-0 text-[13px] leading-5 hover:bg-slate-50 focus-within:bg-indigo-50/40 transition-colors";
/** A row whose value may run onto several lines: the label stays at the top. */
export const ROW_TOP = ROW.replace("items-center", "items-start");

/** The label width: 132px, 150px on a wide screen, or what a wrapper sets in --lw (the sidebar uses less). */
export const LABEL_W = "w-[var(--lw,132px)] xl:w-[var(--lw,142px)] 2xl:w-[var(--lw,150px)]";
/** The row label: small bold caps in black, the same on an empty row. */
export const LABEL = `${LABEL_W} shrink-0 ${LABEL_TEXT}`;
/** For a label in a ROW_TOP row, so it lines up with the value's first line. */
export const LABEL_TOP = `${LABEL} pt-[3px]`;
/** The value of a row. */
export const VALUE = "flex-1 min-w-0 text-[13px] text-slate-900";
/** The colour of an empty value's "—". */
export const EMPTY = APP_EMPTY;

/** Fields holding a code people read out or type into portals: even figures and a slashed zero, so O and 0 never mix. */
export const REF_KEYS = new Set([
  "bookingNumber",
  "houseBolNumber",
  "masterBolNumber",
  "containerNumber",
  "sealNumber",
  "voyage",
  "customerReference",
  "releaseReference",
  "redeliveryReference",
  "jobNumber",
]);
export const REF_VALUE = `${REF} text-[13px] text-slate-900`;

/** A button of the shipment's header row (Invoice, Quote, Actions): all one height and look. */
export const HEADER_BTN = BTN;
