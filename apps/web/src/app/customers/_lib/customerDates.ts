import dayjs from "dayjs";

// Whole calendar days from a timestamp to now on the viewer's clock, so something from late
// last night is "yesterday", not "today". Null when the value is missing or unreadable.
export function daysSince(iso: string | null | undefined, now = Date.now()): number | null {
  if (!iso) return null;
  const then = dayjs(iso);
  if (!then.isValid()) return null;
  // Rounded, not truncated: across a DST change two local midnights are 23 or 25 hours apart.
  return Math.max(0, Math.round(dayjs(now).startOf("day").diff(then.startOf("day"), "day", true)));
}

// "Today" / "Yesterday" / "N days ago".
export function relativeDayLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  return `${days} days ago`;
}
