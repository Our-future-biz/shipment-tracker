// A sailing's facts beside its shipments' own (Council Outlay 14, A3), in words: what "Copy to
// shipments" would write, what differs and is never written (the ports), and what a copy did. Pure,
// so it is tested without React.

import { formatDate } from "@/lib/date";

/** What the server compares a shipment with its sailing by (api lib/coLoadingSailing shipmentFactsDiff). */
export interface ShipmentFactsWords {
  changes: { field: string; label: string; old: string; next: string }[];
  mismatches: { label: string; shipment: string; sailing: string }[];
  skipped: string | null;
}

/** A copied value as it is shown: a date in the app's way, a text as it is, a dash for nothing. */
export const factShown = (field: string, value: string): string => (!value ? "—" : field === "estimatedDeparture" || field === "closingDate" ? formatDate(value) || value : value);

/**
 * How a shipment differs from its sailing, for the "differs" mark: a port (never copied), then - for
 * a shipment the copy does not leave alone - each field the copy would change, dates in the app's way.
 * "" when it agrees.
 */
export function differsWords(f: ShipmentFactsWords): string {
  const ports = f.mismatches.map((m) => `${m.label}: ${m.shipment}, the sailing's is ${m.sailing}`);
  const changes = f.skipped ? [] : f.changes.map((c) => `${c.label}: ${c.old ? factShown(c.field, c.old) : "empty"}, the sailing's is ${factShown(c.field, c.next)}`);
  return [...ports, ...changes].join(" · ");
}

/** What a copy did, in a sentence: "Copied to 3 shipments. 1 not changed: CZLCL… (why)". */
export function copyResultWords(result: { copied: number; refused: { jobNumber: string; reason: string }[] }): string {
  const copied = result.copied === 0 ? "Nothing was copied." : `Copied to ${result.copied === 1 ? "1 shipment" : `${result.copied} shipments`}.`;
  if (result.refused.length === 0) return copied;
  return `${copied} ${result.refused.length} not changed: ${result.refused.map((r) => `${r.jobNumber} (${r.reason})`).join("; ")}`;
}
