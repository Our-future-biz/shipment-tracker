/**
 * The app's one look. Pages, cards, tables and buttons take their classes from here, or from a
 * shared component built on them (PageHeader, SectionCard, DataTable, Pill, RecordTabs,
 * PillTabs, AppModal, ConfirmModal), so a title, a table or a button looks the same wherever it is.
 * antd components get the same look from lib/theme/themeConfig.ts.
 *
 * Font: Inter, for every letter (app/layout.tsx; `font-mono` is Inter too). Figures that line up
 * in a column use `tabular-nums`; codes people read out or type into portals (container, booking,
 * job numbers) use REF, so O and 0 never mix - never another typeface.
 *
 * Type scale, in px, nothing in between:
 *   10  tiny marks (a unit under a total, a counter on an icon)
 *   11  labels, table heads, pills, chips (LABEL_TEXT)
 *   12  secondary lines, hints, captions (HINT)
 *   13  body: values, cells, buttons, inputs (antd fontSize)
 *   14  emphasis inside body (a list item's name, a card's lead line)
 *   16  modal titles, sub-page titles (MODAL_TITLE)
 *   20  KPI figures (KPI_VALUE, KpiTile)
 *   22  page titles (PAGE_TITLE)
 * Icons may take other sizes; text may not.
 *
 * Colours:
 *   text   slate-900 titles, labels, values · slate-700 cells, body · slate-500 meta, hints ·
 *          slate-400 placeholders · slate-300 the "—" of an empty value (EMPTY)
 *   lines  slate-200 frames and heads · slate-100 between rows
 *   accent indigo-600 primary buttons, links, active tabs (hover indigo-700) · indigo-50 / -100
 *          its soft bars and borders
 *   status emerald done/ok · amber warning · red error/danger · sky on its way (a shipment in
 *          transit) · indigo in progress · slate neutral (Pill / Badge tones)
 *
 * Composing: `${TH} w-[120px]` adds to a constant. To change something the constant already sets
 * (its alignment, colour, weight, size), the new class needs "!": Tailwind orders classes by its
 * own sort, not by their order in className, so `${TH} text-center` stays left - write
 * `${TH} !text-center`.
 */

/** The title of a page (its h1): one size, weight and colour on every page. */
export const PAGE_TITLE = "m-0 text-[22px] leading-7 font-bold text-slate-900";
/** The line under or beside a page title (a breadcrumb, a count, a hint). */
export const PAGE_SUBTITLE = "text-[13px] text-slate-500";
/** The title of a modal, a drawer or a sub-page. */
export const MODAL_TITLE = "m-0 text-[16px] leading-6 font-semibold text-slate-900";

/** A white card. Header bar (CARD_BAR + CARD_TITLE) or none; SectionCard draws both. */
export const CARD = "bg-white border border-slate-200 rounded-xl shadow-sm";
/** A card's header bar: light indigo, the title on the left, its extras on the right. */
export const CARD_BAR = "flex items-center gap-2.5 min-h-[42px] px-4 py-2 bg-indigo-50 border-b border-indigo-100";
/** A card's title, in its header bar. */
export const CARD_TITLE = "m-0 text-[13px] leading-5 font-bold uppercase tracking-wider text-slate-900";
/** The icon before a card's title. */
export const CARD_ICON = "text-indigo-500 text-[14px] leading-none";

/** Small bold caps: a field label, a table head, a heading inside a card. */
export const LABEL_TEXT = "text-[11px] leading-[14px] font-bold uppercase tracking-wide text-slate-900";
/** A hint, a caption, a secondary line. */
export const HINT = "text-[12px] text-slate-500";
/** The "—" of an empty value. */
export const EMPTY = "text-slate-300";
/** A code people read out or type into portals (container, booking, job number). */
export const REF = "tabular-nums slashed-zero tracking-wide";
/** A KPI figure. */
export const KPI_VALUE = "text-[20px] leading-7 font-bold text-slate-900 tabular-nums";

/** A plain table's head cell: on white over a slate-200 line, no band (antd tables get the same from globals.css). */
export const TH = `text-left align-bottom px-2 py-2 ${LABEL_TEXT} border-b border-slate-200 whitespace-nowrap`;
/** A plain table's body cell. */
export const TD = "px-2 py-2 align-middle text-[13px] text-slate-700 border-b border-slate-100";
/** A cell of a table's totals row. */
export const TD_TOTAL = "px-2 py-2 text-[13px] font-semibold text-slate-900 border-t-2 border-slate-200";

/** A text link: indigo, underlined on hover ("!" beats antd's own <a> colour). */
export const LINK = "!text-indigo-600 hover:!text-indigo-700 hover:!underline";
/** A link whose colour may come from data (a conditional-format colour on its cell): LINK without the "!". */
export const LINK_PLAIN = "text-indigo-600 hover:text-indigo-700 hover:underline";
/** A heading inside a popover or a panel ("Filter by column"). */
export const HEADING = "m-0 text-[13px] leading-5 font-semibold text-slate-900";
/** The line an empty list or table shows ("No documents yet"). */
export const EMPTY_STATE = "py-8 text-center text-[13px] text-slate-400";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 shrink-0 rounded-lg h-8 px-3 text-[13px] font-medium whitespace-nowrap transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";
/** A button: white with a grey frame. The same as antd's default Button. */
export const BTN = `${BTN_BASE} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900`;
/** The main action: indigo. The same as antd's primary Button. */
export const BTN_PRIMARY = `${BTN_BASE} border border-transparent bg-indigo-600 text-white hover:bg-indigo-700`;
/** A destructive action: red. The same as antd's danger primary Button. */
export const BTN_DANGER = `${BTN_BASE} border border-transparent bg-red-600 text-white hover:bg-red-700`;
/** A quiet button with no frame (Cancel beside a form, an action in a toolbar). */
export const BTN_GHOST = `${BTN_BASE} border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900`;
/** The smaller size of any button above: add after it. */
export const BTN_SM = "!h-7 !px-2.5 !text-[12px]";
/** A button in a card's title bar (Add row, Tell the customer, Close…): BTN, small, lifted. */
export const BTN_BAR = `${BTN} ${BTN_SM} shadow-sm`;
/** The card's main action in its title bar (Save, Record an event, Confirm): BTN_PRIMARY, small. */
export const BTN_BAR_PRIMARY = `${BTN_PRIMARY} ${BTN_SM} !text-white hover:!text-white shadow-sm`;
/** The small square "+" that adds a row to a table or a card: on antd's `<Button size="small" type="primary">`. */
export const ADD_BTN = "!w-[22px] !h-[22px] !min-w-0 !p-0";
/** A square icon-only button. */
export const ICON_BTN =
  "inline-flex items-center justify-center shrink-0 w-8 h-8 rounded-lg border border-slate-300 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-900 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1";
/** An icon-only button with no frame (a row's action). */
export const ICON_BTN_GHOST =
  "inline-flex items-center justify-center shrink-0 w-7 h-7 rounded-md border-0 bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 outline-none focus-visible:ring-2 focus-visible:ring-indigo-500";

/** A row's delete: ICON_BTN_GHOST turning red on hover. */
export const ICON_BTN_DANGER = `${ICON_BTN_GHOST} hover:!bg-red-50 hover:!text-red-600`;

/** A chip that switches on and off (a filter among several): PillTabs' shape. Add CHIP_ON when on. */
export const CHIP =
  "inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-slate-200 bg-white text-[13px] font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer";
export const CHIP_ON = "!border-indigo-500 !bg-indigo-50 !text-indigo-700";

/** A text field or select drawn by hand (antd's Input/Select already look like this). */
export const INPUT =
  "h-8 rounded-lg border border-slate-300 bg-white px-2.5 text-[13px] text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors";
/** A multi-line text field drawn by hand (antd's TextArea already looks like this). */
export const TEXTAREA =
  "rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[13px] leading-5 text-slate-900 placeholder:text-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-colors";
