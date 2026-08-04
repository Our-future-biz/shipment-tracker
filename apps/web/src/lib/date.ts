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
