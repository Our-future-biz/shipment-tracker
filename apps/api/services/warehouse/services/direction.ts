import type { GateTransportLeg } from "../schemas/gateMovement.schema";
import type { GateVisit } from "../interfaces/gate.interfaces";

// A position's direction at the gate. Pure (no database, no Encore), so the pure rule modules
// (stock plan, gate events) can use it without an import cycle.
//
// Domestic cargo (Trucking's LTL through our hub) arrives at the gate (příjem: the gate-in is the
// arrival and the receipt) and leaves through the WH release, which stamps the gate-out too. No
// customs at all: no Customs / MRN / B/L / VGM lines, no pick-up PIN, no Draft receipt / Receipt
// and no re-weigh.

export const DOMESTIC = "Domestic";
export const isDomestic = (handling: string | null | undefined) => handling === DOMESTIC;

/** The gate visit a handling means: Import cargo goes out (výdej); Export and Domestic cargo come in (příjem). */
export const visitOfHandling = (handling: string): GateVisit => (handling === "Import" ? "výdej" : "příjem");

/**
 * The leg the cargo moves on at the gate now; the grid's carrier / plate / driver follow it.
 * Outbound cargo leaves on the OUT leg. Domestic cargo comes in on the IN leg (the pick-up run) and,
 * once it has arrived, leaves on the OUT leg (the line haul / delivery run). Other inbound cargo:
 * the IN leg.
 */
export function cargoLeg(m: { visit: string; handling?: string | null; gateIn?: Date | null }): GateTransportLeg["leg"] {
  if (m.visit === "výdej") return "OUT";
  return isDomestic(m.handling) && m.gateIn ? "OUT" : "IN";
}

/**
 * The plate of the truck the cargo leaves on with the WH release. Domestic cargo leaves on its OUT
 * leg — never the pick-up truck that brought it (the grid's plate before the gate-in).
 */
export function releasePlate(m: { handling?: string | null; plate: string; transportLegs?: GateTransportLeg[] | null }): string {
  if (!isDomestic(m.handling)) return m.plate;
  return ((m.transportLegs ?? []).find((l) => l.leg === "OUT")?.plate ?? "").trim();
}
