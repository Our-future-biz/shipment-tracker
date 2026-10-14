import type { DeadlinePeriod } from "../interfaces/interfaces";

export const DEADLINE_PERIODS: DeadlinePeriod[] = ["OVERDUE", "TODAY", "THIS_WEEK", "NEXT_WEEK", "LATER"];

/**
 * Which part of the dashboard a date falls in, seen from `now`: overdue, today, the rest of
 * this week (weeks end on Sunday), next week, or later. Takes an ISO date or legacy MM/DD/YY;
 * null when the value isn't a date.
 */
export function deadlinePeriod(dateStr: string, now: Date): DeadlinePeriod | null {
  let d: Date | null = null;
  if (dateStr.includes("-")) {
    const [y, m, day] = dateStr.slice(0, 10).split("-").map(Number);
    if (y && m && day) d = new Date(y, m - 1, day);
  } else if (dateStr.includes("/")) {
    const [month, day, year] = dateStr.split("/").map((p) => parseInt(p, 10));
    if (month && day && year !== undefined && !Number.isNaN(year)) d = new Date(2000 + year, month - 1, day);
  }
  if (!d || Number.isNaN(d.getTime())) return null;

  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.round((d.getTime() - todayStart.getTime()) / 86_400_000);

  if (diffDays < 0) return "OVERDUE";
  if (diffDays === 0) return "TODAY";
  const daysToEndOfWeek = 7 - (now.getDay() || 7); // Monday=1..Sunday=7
  if (diffDays <= daysToEndOfWeek) return "THIS_WEEK";
  if (diffDays <= daysToEndOfWeek + 7) return "NEXT_WEEK";
  return "LATER";
}
