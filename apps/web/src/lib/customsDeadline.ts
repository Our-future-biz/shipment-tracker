import dayjs, { type Dayjs } from "dayjs";
import utc from "dayjs/plugin/utc";
import timezone from "dayjs/plugin/timezone";

dayjs.extend(utc);
dayjs.extend(timezone);

/** Customs deadlines are Prague wall times ("YYYY-MM-DD HH:mm"), as the server reads them. */
export const CUSTOMS_TIMEZONE = "Europe/Prague";

/** The moment a customs deadline falls on, whatever the viewer's own timezone; null when unreadable. */
export function customsDeadlineAt(deadline: string | null | undefined): Dayjs | null {
  if (!deadline) return null;
  const at = dayjs.tz(deadline, "YYYY-MM-DD HH:mm", CUSTOMS_TIMEZONE);
  return at.isValid() ? at : null;
}
