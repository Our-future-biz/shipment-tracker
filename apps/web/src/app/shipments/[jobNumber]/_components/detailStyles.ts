// One look for every field card of a shipment (Shipment Details, Customs), matching the
// Container and Cargo Details tabs: a plain white card, a quiet title line, rows of
// small grey label + value.

/** The card shell, as the Container / Cargo Details tables have it. */
export const CARD = "bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col";
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
export const LABEL = `${LABEL_W} shrink-0 text-[11px] leading-[14px] font-bold uppercase text-slate-900`;
/** For a label in a ROW_TOP row, so it lines up with the value's first line. */
export const LABEL_TOP = `${LABEL} pt-[3px]`;
/** The value of a row. */
export const VALUE = "flex-1 min-w-0 text-[13px] text-slate-900";
/** The colour of an empty value's "—". */
export const EMPTY = "text-slate-300";

/** Fields holding a code people read out or type into portals: shown in monospace, so O/0 and I/1 never mix. */
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
export const REF_VALUE = "font-mono text-[12.5px] tracking-wide text-slate-900";

/** A button of the shipment's header row (Invoice, Quote, Actions): all one height and look. */
export const HEADER_BTN =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors whitespace-nowrap";
/** An icon-only button of the header row (Notes, Attachments). */
export const HEADER_ICON_BTN =
  "inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 bg-white text-[14px] text-slate-500 hover:bg-slate-50 hover:text-slate-900 cursor-pointer transition-colors";
