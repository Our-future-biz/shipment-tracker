import { joinDateTime } from "@/lib/columnConfig";

// Dates typed into the date editors of the shipment cards and grids (user council O4 / E8 / M2).
// Every screen shows a day as DD.MM.YYYY, so that is what people type; the editors took only
// YYYY-MM-DD and dropped anything else without a word.

/**
 * The formats a date picker shows (the first) and reads by itself. A two-digit year is left to
 * parseTypedDay: the picker would read "1.1.70" as 1970, and while "26.11.2026" is being typed it
 * would take "26.11.20" for 2020.
 */
export const DATE_INPUT_FORMATS = ["DD.MM.YYYY", "D.M.YYYY", "YYYY-MM-DD"];

// Every message of a date box that can't be read says how to leave it as it was (mock council R5): an emptied box
// is saved as no date, so one emptied to start over loses the date unless Escape is pressed.
const ESC_KEEPS_DATE = "Esc keeps the old date";
export const TYPE_DATE_HINT = `Type the date as 26.11.2026. ${ESC_KEEPS_DATE}`;
export const TYPE_TIME_HINT = "Type the time as 16:00. Esc keeps the old date and time";
/** A typed day the field doesn't allow, as its picker greys out (EditableCell dayBlocked). */
export const FUTURE_DAY_ERROR = `This date can't be in the future. ${ESC_KEEPS_DATE}`;

/**
 * How many years from this one a date may be (mock council S1-05). Any four-digit year was taken, so a slip such
 * as 11.12.2062 or 11.12.0026 was saved without a word. A shipment's dates (an ETA, a closing, a customs or
 * payment day) are a few years at most from today; 20 either way still takes an old job typed in late and a long
 * contract's end, and refuses the slips: a year out of order (2062), cut short (0026), or "99" (2099).
 */
export const YEAR_SPAN = 20;

/** Whether a day (YYYY-MM-DD) is more than YEAR_SPAN years from this year. */
export function yearOutOfReach(day: string, now: Date = new Date()): boolean {
  const year = Number(day.slice(0, 4));
  const thisYear = now.getFullYear();
  return year < thisYear - YEAR_SPAN || year > thisYear + YEAR_SPAN;
}

/** Why a typed day far from today is not taken. */
export const yearOutOfReachError = (day: string) =>
  `${Number(day.slice(0, 4))} is more than ${YEAR_SPAN} years from today. ${TYPE_DATE_HINT}`;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A typed day as stored (YYYY-MM-DD), or null when it isn't one: DD.MM.YYYY, D.M.YYYY, DD.MM.YY
 * (and D.M.YY) or YYYY-MM-DD. The Czech way of writing it, with a space after each dot
 * ("26. 11. 2026") and often a dot after the year ("26.11.2026."), is read too. A two-digit year is
 * in this century. A day the calendar hasn't (31.02.2026) is no day. Whether its year is near enough to today is
 * readTypedDay's (yearOutOfReach): "99" is read as 2099, and then refused there.
 */
export function parseTypedDay(text: string): string | null {
  const t = text.trim();
  let y: number, m: number, d: number;
  const dotted = t.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4}|\d{2})\.?$/);
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dotted) {
    d = Number(dotted[1]);
    m = Number(dotted[2]);
    y = dotted[3]!.length === 2 ? 2000 + Number(dotted[3]) : Number(dotted[3]);
  } else if (iso) {
    y = Number(iso[1]);
    m = Number(iso[2]);
    d = Number(iso[3]);
  } else return null;
  if (m < 1 || m > 12 || d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()) return null;
  return `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;
}

/** A typed time as stored (HH:MM), or null: "16:00", or "9:30" for 09:30. */
export function parseTypedTime(text: string): string | null {
  const hit = text.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!hit) return null;
  const h = Number(hit[1]);
  const min = Number(hit[2]);
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : null;
}

/** What a typed date box says once Enter reads it: the day ("" for a box emptied), or why not. */
export type TypedDay = { day: string } | { error: string };

export function readTypedDay(text: string, blocked?: (day: string) => boolean, now: Date = new Date()): TypedDay {
  if (text.trim() === "") return { day: "" };
  const day = parseTypedDay(text);
  if (!day) return { error: TYPE_DATE_HINT };
  if (yearOutOfReach(day, now)) return { error: yearOutOfReachError(day) };
  if (blocked?.(day)) return { error: FUTURE_DAY_ERROR };
  return { day };
}

/** What a date editor does when it is left by Tab or a click elsewhere, or closed by Escape. */
export type DayLeave = { close: true } | TypedDay;

/**
 * Leaving a date box saves what was typed into it, as Enter does: rc-picker would read it only
 * after its panel has closed, and by then the editor is gone, so a typed date was silently lost
 * (user council O4). Escape, or nothing typed, just closes and leaves the date as it was.
 */
export function leaveTypedDay(typed: string | null, escaped: boolean, blocked?: (day: string) => boolean): DayLeave {
  if (escaped || typed === null) return { close: true };
  return readTypedDay(typed, blocked);
}

/**
 * Whether the focus going on to `next` leaves a date + time editor, so it saves (mock council S1-04): to an element
 * outside it and outside every picker's panel (rendered elsewhere in the page). The focus going nowhere - a click on
 * the page, another window - is not a leave here: a click elsewhere saves by its own (DateTimeEditor's mousedown).
 */
export function leavesEditor(next: Element | null, editor: Element | null): boolean {
  if (!next || !editor) return false;
  return !editor.contains(next) && !next.closest(".ant-picker-dropdown");
}

/**
 * The value a date + time editor saves ("YYYY-MM-DD HH:MM", "YYYY-MM-DD" or ""), or the box that
 * can't be read and why. `picked` is what the pickers hold; `typed` is what was typed into each box
 * since its picker last set it (null: nothing), which counts over the picked value.
 */
export function resolveDateTime(
  picked: { date: string; time: string },
  typed: { date?: string | null; time?: string | null },
  now: Date = new Date(),
): { value: string } | { error: string; box: "date" | "time" } {
  let { date, time } = picked;
  if (typed.date != null) {
    const read = readTypedDay(typed.date, undefined, now);
    if ("error" in read) return { error: read.error, box: "date" };
    date = read.day;
  }
  if (typed.time != null) {
    if (typed.time.trim() === "") time = "";
    else {
      const hhmm = parseTypedTime(typed.time);
      if (!hhmm) return { error: TYPE_TIME_HINT, box: "time" };
      time = hhmm;
    }
  }
  return { value: date ? joinDateTime(date, time) : "" };
}
