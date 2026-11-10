import { formatDate } from "@/lib/date";

export type DueTone = "overdue" | "soon" | "later" | "done";

/** Whole days from `today` to `due` (both YYYY-MM-DD): negative when past. */
function daysBetween(today: string, due: string): number {
  const at = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return Date.UTC(y!, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((at(due) - at(today)) / 86400000);
}

/**
 * A to-do's deadline: the day itself, and how loud it is - red once past, amber today or tomorrow,
 * grey later. A done to-do keeps its deadline quiet. Null without a deadline.
 */
export function dueInfo(due: string | null, today: string, done = false): { label: string; tone: DueTone } | null {
  if (!due) return null;
  const label = formatDate(due);
  if (done) return { label, tone: "done" };
  const days = daysBetween(today, due);
  if (days < 0) return { label, tone: "overdue" };
  if (days <= 1) return { label, tone: "soon" };
  return { label, tone: "later" };
}
