// Year calendar maths: Czech public holidays and ISO week numbers.

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const key = (y: number, m: number, d: number) => `${y}-${m + 1}-${d}`;

// Easter Sunday (Gregorian, anonymous algorithm); m is 0-based.
function easterSunday(y: number): { m: number; d: number } {
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
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
  return { m: month - 1, d: day };
}

// Czech public holidays of a year, keyed "yyyy-m-d" (m 1-based). Good Friday is a holiday since 2016.
export function czechHolidays(y: number): Map<string, string> {
  const map = new Map<string, string>([
    [key(y, 0, 1), "New Year's Day / Restoration Day of the Czech State"],
    [key(y, 4, 1), "Labour Day"],
    [key(y, 4, 8), "Liberation Day"],
    [key(y, 6, 5), "Saints Cyril and Methodius Day"],
    [key(y, 6, 6), "Jan Hus Day"],
    [key(y, 8, 28), "Czech Statehood Day"],
    [key(y, 9, 28), "Independent Czechoslovak State Day"],
    [key(y, 10, 17), "Struggle for Freedom and Democracy Day"],
    [key(y, 11, 24), "Christmas Eve"],
    [key(y, 11, 25), "Christmas Day"],
    [key(y, 11, 26), "St. Stephen's Day"],
  ]);
  const easter = easterSunday(y);
  const at = (offset: number) => new Date(y, easter.m, easter.d + offset);
  const monday = at(1);
  map.set(key(y, monday.getMonth(), monday.getDate()), "Easter Monday");
  if (y >= 2016) {
    const friday = at(-2);
    map.set(key(y, friday.getMonth(), friday.getDate()), "Good Friday");
  }
  return map;
}

export const holidayKey = key;

// ISO 8601 week number (weeks start on Monday, week 1 holds the year's first Thursday).
export function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

// A month as Monday-first weeks: each row has its week number and 7 days (null outside the month).
export function monthWeeks(y: number, m: number): { week: number; days: (number | null)[] }[] {
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const lead = (first.getDay() + 6) % 7; // Monday = 0
  const rows: { week: number; days: (number | null)[] }[] = [];
  let day = 1 - lead;
  while (day <= daysInMonth) {
    const days: (number | null)[] = [];
    for (let i = 0; i < 7; i++, day++) days.push(day >= 1 && day <= daysInMonth ? day : null);
    const firstDay = days.find((d) => d !== null)!;
    rows.push({ week: isoWeek(new Date(y, m, firstDay)), days });
  }
  return rows;
}
