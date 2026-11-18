import { COLUMN_MAP } from "@/lib/columnConfig";
import { formatDate } from "@/lib/date";

// How a shipment deadline from the Needs Attention API is worded and coloured, wherever it is shown.

/** A deadline as the Needs Attention API sends it. */
export interface Deadline {
  field: string;
  /** "YYYY-MM-DD". */
  date: string;
  /** Calendar days from today; negative once it passed. */
  daysLeft: number;
  /** A cut-off whose day passed, or whose time today did: it stays URGENT while the job has not left. */
  missed: boolean;
  /** A cut-off's time of day, "HH:mm"; "" for none. */
  time: string;
}

// AMS / ISF Deadline: the date entered on the shipment, or 4 days before ETD when none is.
export const deadlineLabel = (field: string) => COLUMN_MAP.get(field)?.title ?? field;

export const deadlineDayLabel = (daysLeft: number) => {
  if (daysLeft < 0) return `overdue ${-daysLeft} day${daysLeft === -1 ? "" : "s"}`;
  return ["today", "tomorrow"][daysLeft] ?? `in ${daysLeft} days`;
};

/** "17.11." of a YYYY-MM-DD day. */
const dayMonth = (date: string) => `${date.slice(8, 10)}.${date.slice(5, 7)}.`;

/**
 * A deadline in words:
 *   "ETD Estimated: tomorrow (19.11.2026)", "Closing Date: today 14:00 (18.11.2026)",
 *   "VGM Closing: today 10:00 (18.11.2026)", "VGM Closing: overdue 2 days (16.11.2026 10:00)",
 *   a filing whose time today has passed: "VGM Closing: overdue · today 10:00 (18.11.2026)"
 *   - and a missed Closing as Shipments → Managers says it: "Closing missed · 17.11. 14:00",
 *   "Closing missed · today 14:00".
 */
export const deadlineText = (d: Deadline) => {
  const at = d.time ? ` ${d.time}` : "";
  if (d.field === "closingDate" && d.missed) return `Closing missed · ${d.daysLeft === 0 ? "today" : dayMonth(d.date)}${at}`;
  // Overdue by days, the time belongs to the day it was due on: "overdue 1 day (17.11.2026 16:00)".
  if (d.daysLeft < 0) return `${deadlineLabel(d.field)}: ${deadlineDayLabel(d.daysLeft)} (${formatDate(d.date)}${at})`;
  // Overdue since its time today: no day has passed yet, so the time says since when.
  const when = d.missed ? "overdue · today" : deadlineDayLabel(d.daysLeft);
  return `${deadlineLabel(d.field)}: ${when}${at} (${formatDate(d.date)})`;
};

/** The two Needs Attention windows, as the API names them: URGENT and the two working days after. */
export type DeadlineWindow = "within24h" | "within48h";

// A date is as urgent as the list it is on - the windows are working days, so Monday seen on a
// Friday is urgent though three days off: everything on the URGENT list is red (a missed or
// overdue cut-off among it), the two working days after are orange.
export const deadlineColor = (window: DeadlineWindow) => (window === "within24h" ? "red" : "orange");
