import type { ShipmentItem } from "@/hooks/useShipments";

function parseISODate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export interface ShipmentEta {
  days: number; // whole days from today to the relevant date
  date: string; // the relevant date string (YYYY-MM-DD)
  direction: "Export" | "Import";
}

// The relevant milestone depends on direction:
//  - Export → Estimated Departure (days to departure)
//  - Import → Estimated Arrival (days to arrival)
export function relevantEta(s: ShipmentItem): ShipmentEta | null {
  const isExport = (s.tradeDirection || "").toLowerCase().includes("export");
  const dateStr = isExport ? s.estimatedDeparture : s.estimatedArrival;
  if (!dateStr) return null;
  const d = parseISODate(dateStr);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((d.getTime() - today.getTime()) / 86400000);
  return { days, date: dateStr, direction: isExport ? "Export" : "Import" };
}

export function daysLabel(days: number): string {
  if (days <= 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `In ${days} days`;
}

// Shipments whose relevant milestone falls within [minDays, maxDays] inclusive.
export function shipmentsInWindow(shipments: ShipmentItem[], minDays: number, maxDays: number) {
  return shipments
    .map((s) => ({ s, eta: relevantEta(s) }))
    .filter((x): x is { s: ShipmentItem; eta: ShipmentEta } => !!x.eta && x.eta.days >= minDays && x.eta.days <= maxDays)
    .sort((a, b) => a.eta.days - b.eta.days);
}
