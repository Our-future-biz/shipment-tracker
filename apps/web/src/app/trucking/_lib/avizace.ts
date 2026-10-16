import type { AvizaceChannel, AvizaceTemplate } from "@/hooks/useTruckingControl";
import type { ConsignmentDetail, TripKind } from "@/hooks/useTruckingConsignments";
import { businessDateTime, businessTime } from "@/lib/date";
import type { Tone } from "@/components/Badge";

// Avizace: agreeing the delivery with the consignee. The app prepares the text to copy and staff
// record how it was agreed; nothing is sent from here. Tested in avizace.test.ts.

export const AVIZACE_CHANNEL_LABELS: Record<AvizaceChannel, string> = {
  PHONE: "Phone",
  EMAIL: "E-mail",
  SMS: "SMS",
  OTHER: "Other",
};

export type AvizaceState = "notNeeded" | "pending" | "done";

/** Where a consignment stands with its avizace: needed (B2C or the stop asks for it) and recorded or not. */
export function avizaceState(c: Pick<ConsignmentDetail, "avizaceNeeded" | "avizace">): AvizaceState {
  if (c.avizace) return "done";
  return c.avizaceNeeded ? "pending" : "notNeeded";
}

export const AVIZACE_BADGE: Record<AvizaceState, { label: string; tone: Tone; hint: string }> = {
  notNeeded: { label: "Not needed", tone: "", hint: "Not B2C and the delivery stop does not ask for avizace" },
  pending: { label: "Needed", tone: "a", hint: "B2C or the delivery stop asks for avizace, and none is recorded yet — the delivery run shows a warning" },
  done: { label: "Recorded", tone: "g", hint: "The delivery was agreed with the consignee" },
};

/** Lines naming a PIN are dropped: the Pick-up PIN never leaves Shipments, whatever a template holds. */
export function withoutPin(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/\bPIN\b/i.test(line))
    .join("\n");
}

/** The text to copy in one language, with its subject on top. */
export function avizaceCopyText(template: AvizaceTemplate, language: "cs" | "en"): string {
  const body = withoutPin(template[language]).trim();
  const subject = withoutPin(template.subject).trim();
  return subject ? `${subject}\n\n${body}` : body;
}

/** "15.10.2026 08:00–12:00", "from 15.10.2026 08:00", or "" when no window was agreed. */
export function agreedWindowText(from: string | null, to: string | null): string {
  if (from && to) {
    const sameDay = businessDateTime(from).slice(0, 10) === businessDateTime(to).slice(0, 10);
    return `${businessDateTime(from)}–${sameDay ? businessTime(to) : businessDateTime(to)}`;
  }
  if (from) return `from ${businessDateTime(from)}`;
  if (to) return `by ${businessDateTime(to)}`;
  return "";
}

/** Why a record cannot be saved: who was reached is required, and the window cannot end before it starts. */
export function avizaceRecordProblems(r: { contact: string; agreedFrom: string | null; agreedTo: string | null }): string[] {
  const out: string[] = [];
  if (!r.contact.trim()) out.push("Say who was reached (name, phone or e-mail)");
  if (r.agreedFrom && r.agreedTo && Date.parse(r.agreedTo) < Date.parse(r.agreedFrom)) out.push("The agreed window ends before it starts");
  return out;
}

/** The trips that deliver to consignees: a delivery run and an FTL trip. */
const DELIVERING_TRIPS: readonly TripKind[] = ["DELIVERY_RUN", "FTL"];

/**
 * The avizace warning of a trip (shown, never blocking): its consignments that still need avizace,
 * from the Consignments "Avizace pending" view (id → ref). Null when none, when the trip does not
 * deliver, or when the server already lists an avizace warning on the trip.
 */
export function avizaceWarning(trip: { kind: TripKind; consignmentIds: readonly string[]; warnings: readonly string[] }, pending: ReadonlyMap<string, string>): string | null {
  if (!DELIVERING_TRIPS.includes(trip.kind)) return null;
  if (trip.warnings.some((w) => /aviz/i.test(w))) return null;
  const refs = [...new Set(trip.consignmentIds)].filter((id) => pending.has(id)).map((id) => pending.get(id)!);
  if (!refs.length) return null;
  return `Avizace not recorded: ${refs.join(", ")}`;
}
