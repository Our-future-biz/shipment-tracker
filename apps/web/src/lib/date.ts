import dayjs from "dayjs";

// Unified date display for the app. Values are STORED as ISO ("YYYY-MM-DD" or a
// full ISO timestamp); these helpers turn them into the Czech display format.
// Legacy "MM/DD/YY" values (older shipment data) are still tolerated.

function toDayjs(value: string) {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return dayjs(value); // ISO date or datetime
  const legacy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); // legacy MM/DD/YY(YY)
  if (legacy) {
    const [, mm, dd, yy] = legacy;
    const year = yy!.length <= 2 ? 2000 + parseInt(yy!, 10) : parseInt(yy!, 10);
    return dayjs(new Date(year, parseInt(mm!, 10) - 1, parseInt(dd!, 10)));
  }
  return dayjs(value);
}

// Date only → "DD.MM.YYYY" (empty for blank; original string if unparseable).
export function formatDate(value?: string | null): string {
  if (!value) return "";
  const d = toDayjs(value);
  return d.isValid() ? d.format("DD.MM.YYYY") : value;
}

// Timestamp → "DD.MM.YYYY HH:mm" in local time.
export function formatDateTime(value?: string | null): string {
  if (!value) return "";
  const d = toDayjs(value);
  return d.isValid() ? d.format("DD.MM.YYYY HH:mm") : value;
}

/** Today as the API stores dates (YYYY-MM-DD), in local time. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const businessDayParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" });

// The day (YYYY-MM-DD) of a moment on the company's calendar, which is Prague's wherever the
// viewer sits. The server counts by that day (apps/api/lib/businessDate.ts) - validity, and the
// days a list is filtered by - so what a screen says about a day is said by the same one.
export function businessDay(at: Date): string {
  const parts = Object.fromEntries(businessDayParts.formatToParts(at).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function businessToday(): string {
  return businessDay(new Date());
}

/** The company-calendar day (YYYY-MM-DD) of a stored time or Date; "" for none or an invalid one. */
export function businessDayOf(at: string | Date | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? "" : businessDay(d);
}

const DAY_MS = 86_400_000;

/** A calendar day (YYYY-MM-DD) moved by `n` days (negative = back). */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);
}

const pragueTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const pragueDayTime = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Prague",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** "14:05" — the time of a moment on the company's clock (Prague); "" for none or an invalid one. */
export function businessTime(at: string | Date | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? "" : pragueTime.format(d);
}

/** "05.03.2026 14:05" — a moment on the company's calendar and clock; "" for none or an invalid one. */
export function businessDateTime(at: string | Date | null | undefined): string {
  if (!at) return "";
  const d = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(pragueDayTime.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`;
}
