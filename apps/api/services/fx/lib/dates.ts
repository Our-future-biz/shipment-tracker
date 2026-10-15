// Calendar dates as yyyy-mm-dd strings, always in Prague time. ČNB fixings are Prague
// dates, and the UTC date is wrong between 00:00 and 02:00 local time.

const PRAGUE = "Europe/Prague";

function pragueParts(now: Date): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PRAGUE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

export function pragueToday(now = new Date()): string {
  const p = pragueParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

// Minutes since midnight in Prague.
export function pragueMinutes(now = new Date()): number {
  const p = pragueParts(now);
  return Number(p.hour) * 60 + Number(p.minute);
}

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 0 = Sunday … 6 = Saturday.
export function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

export function isWeekend(date: string): boolean {
  const d = weekday(date);
  return d === 0 || d === 6;
}

export function previousWeekday(date: string): string {
  let d = addDays(date, -1);
  while (isWeekend(d)) d = addDays(d, -1);
  return d;
}

// Easter Sunday (Gregorian, anonymous algorithm).
function easterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Czech public holidays (zákon 245/2000 Sb.) — ČNB publishes no fixing on them.
const FIXED_HOLIDAYS = ["01-01", "05-01", "05-08", "07-05", "07-06", "09-28", "10-28", "11-17", "12-24", "12-25", "12-26"];

export function isCzechHoliday(date: string): boolean {
  if (FIXED_HOLIDAYS.includes(date.slice(5))) return true;
  const easter = easterSunday(Number(date.slice(0, 4)));
  return date === addDays(easter, -2) || date === addDays(easter, 1); // Good Friday, Easter Monday
}

// A day ČNB publishes a fixing on: a weekday that is not a Czech public holiday.
export function isFixingDay(date: string): boolean {
  return !isWeekend(date) && !isCzechHoliday(date);
}

export function nextFixingDay(date: string): string {
  let d = addDays(date, 1);
  while (!isFixingDay(d)) d = addDays(d, 1);
  return d;
}

export function previousFixingDay(date: string): string {
  let d = addDays(date, -1);
  while (!isFixingDay(d)) d = addDays(d, -1);
  return d;
}

export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y!, m!, 0)).toISOString().slice(0, 10);
}

// ČNB publishes at about 14:30; the tool pulls at 15:00 Prague time and retries at 15:30
// and 16:00 (owner decision, 14 Oct 2026). A fixing still missing after the last pull is
// reported to the admins.
export const PULL_SLOTS = [15 * 60, 15 * 60 + 30, 16 * 60];
export const PUBLISH_MINUTES = PULL_SLOTS[0]!;
export const LAST_PULL_MINUTES = PULL_SLOTS.at(-1)!;

/**
 * The newest fixing that should be stored at `now`: today on a fixing day from the first
 * pull (15:00) on, otherwise the previous fixing day.
 */
export function expectedLatestFixing(now = new Date()): string {
  const today = pragueToday(now);
  if (isFixingDay(today) && pragueMinutes(now) >= PUBLISH_MINUTES) return today;
  return previousFixingDay(today);
}
