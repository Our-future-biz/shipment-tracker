// The gate job's transport legs and checklist icons. Pure helpers (tested in transportLegs.test.ts).

type Leg = "IN" | "OUT" | "CFS";

/**
 * One field save of the gate job (user council W2, 20 Nov 2026): only the leg field or the
 * checklist icon that changed goes to the server, which merges it into the record as stored, so a
 * quick second save - or a second person - never undoes the first. Sent with the general update
 * (`legChange` / `checkChange` of the gate PATCH; the server's services/gateLegChange).
 */
export interface GateLegChange {
  leg: Leg;
  company?: string;
  plate?: string;
  driver?: string;
  phone?: string;
  /** ISO time, "" clears it. */
  gateTime?: string;
}
export interface GateCheckChange {
  key: "ht" | "photos" | "measure" | "vgm" | "seal" | "dg";
  state: "g" | "a" | "r" | "n";
}
export interface GateFieldChange {
  legChange?: GateLegChange;
  checkChange?: GateCheckChange;
}

/**
 * The gate job's saves in turn (review of W2): each save starts once the one before has settled, so
 * two quick saves of the same leg field or checklist icon reach the server in the order made - as
 * the job's plain Pick-up chains its saves. A failed save does not stop the ones after it.
 */
export function saveQueue() {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(run: () => Promise<T>): Promise<T> => {
    const next = last.then(run);
    last = next.catch(() => undefined);
    return next;
  };
}

type StampFields = {
  visit: string;
  gateIn?: string | null;
  gateOut?: string | null;
  transportLegs: { leg: string; source?: unknown }[];
};

/**
 * The IN leg was filled by a Trucking pick-up run that brings the cargo to our hub (as the server's
 * services/gateEvents arrivesOnPickupRun; a marker without a trip kind is a pick-up run).
 */
export function inOnPickupRun(m: { transportLegs?: { leg: string; source?: unknown }[] | null }): boolean {
  const s = (m.transportLegs ?? []).find((l) => l.leg === "IN")?.source as { kind?: unknown; tripRef?: unknown; tripKind?: unknown } | null | undefined;
  if (!s || s.kind !== "trucking" || typeof s.tripRef !== "string" || !s.tripRef.trim()) return false;
  return (typeof s.tripKind === "string" && s.tripKind ? s.tripKind : "PICKUP_RUN") === "PICKUP_RUN";
}

/**
 * The gate stamp a leg's row shows when no gate time is typed on it: the stamp of the truck on that
 * leg. Inbound cargo comes in on the IN leg (its gate-in); the OUT row shows the gate-out.
 * Outbound (import) cargo is collected by the truck of the OUT leg, so its gate-in - the pick-up
 * truck in - belongs to the OUT row, not the IN row (user council W17); once the gate-out is stamped
 * the OUT row shows that. Only when a Trucking pick-up run brought the cargo in on the IN leg is
 * the outbound gate-in that leg's.
 */
export function legStamp(leg: Leg, m: StampFields): string {
  const outbound = m.visit === "výdej";
  const inLeg = !outbound || inOnPickupRun(m);
  if (leg === "IN") return inLeg ? (m.gateIn ?? "") : "";
  if (leg === "OUT") return m.gateOut || (!inLeg ? (m.gateIn ?? "") : "");
  return "";
}

const CHECK_CYCLE = ["n", "g", "a", "r"] as const;

/** The next state of a checklist icon on a click: n/a → done → pending → problem. */
export const nextCheck = (state: string | undefined): GateCheckChange["state"] =>
  CHECK_CYCLE[(CHECK_CYCLE.indexOf((state ?? "n") as (typeof CHECK_CYCLE)[number]) + 1) % CHECK_CYCLE.length]!;
