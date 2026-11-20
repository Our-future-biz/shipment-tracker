// The date / date-and-time fields of the warehouse record forms: the app's date picker
// (DD.MM.YYYY, as every other date of the app), not the browser's own control (user council W20),
// kept as the server stores them - "YYYY-MM-DD" or "YYYY-MM-DDTHH:mm". Pure (tested in pickerDate.test.ts).

import dayjs, { type Dayjs } from "dayjs";

const STORED = { date: "YYYY-MM-DD", datetime: "YYYY-MM-DDTHH:mm" } as const;

/** The picker's value of a stored date; a value it cannot read shows as empty. */
export function pickerValue(v: unknown): Dayjs | null {
  if (typeof v !== "string" || !v) return null;
  const d = dayjs(v);
  return d.isValid() ? d : null;
}

/** The stored text of a picked date ("" when cleared). */
export const pickerStored = (d: Dayjs | null | undefined, type: "date" | "datetime"): string => (d && d.isValid() ? d.format(STORED[type]) : "");
