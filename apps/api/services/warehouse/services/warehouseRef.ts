// Warehouse references: WCZ + the Prague calendar year + a six-digit number that rises by one
// for every new position of the company (imported or created) and starts again at 000001 each
// year, e.g. WCZ2026000001. References made before (WCZ + day + two digits, e.g. WCZ2026101410)
// keep their value; they are the same length, so a new number that happens to spell an old
// reference is skipped (see warehouseTaskRepository.allocateRef).

export const MAX_REF_NUMBER = 999_999;

/** The Prague calendar year of `date` (23:30 UTC on 31 Dec is already the next year). */
export function warehouseRefYear(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric" }).format(date));
}

export function formatWarehouseRef(year: number, n: number): string {
  return `WCZ${year}${String(n).padStart(6, "0")}`;
}
