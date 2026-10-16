// What a Trucking trip filled in the warehouse — a gate job's transport leg, the shipment's
// pick-up rows (Shipments → Warehouse → Pick-up) — carries `source: { kind: "trucking", tripRef }`
// (with the trip's `tripId` when Trucking sent it). Such data is read-only in Warehouse and in
// Shipments and shows "From trip LCZ…", a link to the trip when its id is known; only the trip
// changes or clears it (the server keeps it as stored whatever a save sends). Pure helpers.

export interface TripSource {
  kind: "trucking";
  tripRef: string;
  tripId?: string;
}

/** The trip marker of a leg or row, or null when people typed it. */
export function tripSourceOf(x: { source?: unknown } | null | undefined): TripSource | null {
  const s = x?.source as Record<string, unknown> | null | undefined;
  if (!s || typeof s !== "object" || s.kind !== "trucking" || typeof s.tripRef !== "string" || !s.tripRef.trim()) return null;
  return { kind: "trucking", tripRef: s.tripRef, ...(typeof s.tripId === "string" && s.tripId ? { tripId: s.tripId } : {}) };
}

/** The trip's page in Trucking, or null when the marker has no trip id (filled before ids were sent). */
export function tripHref(x: { source?: unknown } | null | undefined): string | null {
  const id = tripSourceOf(x)?.tripId;
  return id ? `/trucking/trips/${encodeURIComponent(id)}` : null;
}

/** "From trip LCZ…", or null for data people typed. */
export function tripLabel(x: { source?: unknown } | null | undefined): string | null {
  const s = tripSourceOf(x);
  return s ? `From trip ${s.tripRef}` : null;
}

/** Filled by a trip: shown read-only. */
export const isFromTrip = (x: { source?: unknown } | null | undefined) => tripSourceOf(x) !== null;

/**
 * A gate figure (pieces / kg / cbm) still as the trip wrote it: it then shows "From trip LCZ…".
 * Once someone changes it, it is the warehouse's own figure.
 */
export function figureFromTrip(
  figures: ({ source?: unknown } & Partial<Record<"colli" | "weightKg" | "measureCbm", number>>) | null | undefined,
  key: "colli" | "weightKg" | "measureCbm",
  value: number,
): boolean {
  return !!figures && isFromTrip(figures) && figures[key] !== undefined && figures[key] === value;
}

export type PickupRowData = Record<string, unknown> & { source?: unknown };

/** The stored pick-up rows split into the trip's (read-only) and the ones people edit. */
export function splitPickupRows(rows: PickupRowData[]): { tripRows: PickupRowData[]; ownRows: PickupRowData[] } {
  const tripRows = rows.filter(isFromTrip);
  const ownRows = rows.filter((r) => !isFromTrip(r));
  return { tripRows, ownRows };
}
