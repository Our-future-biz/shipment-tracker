// Office time is counted 08:00-17:00 on Czech working days (officeMinutesBetween in apps/api/services/quotes/lib/marginInquiry.ts):
// an office day is 9 hours.
const OFFICE_DAY_HOURS = 9;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** "45 min", "3 h", "1 office day 2 h" of office minutes, as Sales → Managers says how long a question waited. */
export function officeTime(minutes: number): string {
  if (minutes < 60) return `${Math.max(0, Math.floor(minutes))} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < OFFICE_DAY_HOURS) return `${hours} h`;
  const rest = hours % OFFICE_DAY_HOURS;
  return `${plural(Math.floor(hours / OFFICE_DAY_HOURS), "office day")}${rest ? ` ${rest} h` : ""}`;
}
