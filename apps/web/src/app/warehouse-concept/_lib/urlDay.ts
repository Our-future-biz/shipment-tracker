// A day kept in the address (the Dock Schedule's ?day=): a real YYYY-MM-DD date, anything else
// (missing, mistyped, 2026-02-30) reads as `fallback` (today). Pure (tested in urlDay.test.ts).

export function dayParamOf(param: string | null, fallback: string): string {
  if (!param || !/^\d{4}-\d{2}-\d{2}$/.test(param)) return fallback;
  const d = new Date(`${param}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === param ? param : fallback;
}
