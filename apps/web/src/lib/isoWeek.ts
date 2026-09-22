/**
 * Prace s ISO tydny pro kurzovni listek (stranka Exchange).
 * ISO tyden: tyden zacina pondelim a rok tydne urcuje jeho ctvrtek,
 * proto napr. 29. 12. 2025 uz patri do tydne 2026-W01.
 */

interface WeekParts {
  year: number;
  week: number;
}

/** Rozlozi datum (YYYY-MM-DD) na ISO rok a cislo tydne. */
function isoWeekParts(dateStr: string): WeekParts | null {
  const d = new Date(`${dateStr}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day); // ctvrtek daneho tydne
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7);
  return { year, week };
}

/** Datum -> klic tydne, napr. "2026-W36". Prazdny retezec pri neplatnem datu. */
export function weekKeyFromDate(dateStr: string): string {
  const p = isoWeekParts(dateStr);
  return p ? formatWeekKey(p.year, p.week) : "";
}

function formatWeekKey(year: number, week: number): string {
  return `${year}-W${String(week).padStart(2, "0")}`;
}

/** Pocet ISO tydnu v roce (52 nebo 53). Pouziva weekRange pro overeni,
 *  ze zadany tyden v danem roce vubec existuje. */
function weeksInYear(year: number): number {
  const dec28 = `${year}-12-28`; // 28. 12. je vzdy v poslednim tydnu roku
  return isoWeekParts(dec28)?.week ?? 52;
}

/** Klic tydne -> pondeli a nedele. Null, pokud tyden v danem roce neexistuje. */
export function weekRange(weekKey: string): { from: string; to: string } | null {
  const m = weekKey.match(/^(\d{4})-W(\d{1,2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const week = Number(m[2]);
  if (week < 1 || week > weeksInYear(year)) return null;

  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {
    from: monday.toISOString().slice(0, 10),
    to: sunday.toISOString().slice(0, 10),
  };
}

/** Klic tydne aktualniho tydne. */
export function currentWeekKey(): string {
  return weekKeyFromDate(new Date().toISOString().slice(0, 10));
}

/** Lidsky citelny popis tydne, napr. "Week 36 · 31 Aug – 6 Sep 2026". */
export function formatWeekLabel(weekKey: string): string {
  const r = weekRange(weekKey);
  if (!r) return weekKey;
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric", month: "short", timeZone: "UTC",
    });
  const year = weekKey.slice(0, 4);
  const week = weekKey.slice(6);
  return `Week ${week} · ${fmt(r.from)} – ${fmt(r.to)} ${year}`;
}
