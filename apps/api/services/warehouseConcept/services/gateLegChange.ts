import type { MaxLen } from "encore.dev/validate";
import type { GateCheckState, GateChecklist, GateTransportLeg } from "../schemas/gateMovement.schema";
import { fromTrip } from "./tripSource";

// One field save of the gate job, merged into the record as stored (user council W2, 20 Nov 2026).
// Each field of a transport leg, and each gate checklist icon, used to send the whole legs list
// (or the whole checklist) built from the last server answer, and the server replaced it: a quick
// second field save - or a second person on the same record - undid the first (haulier and plate
// were lost before a WH release). Now the client sends only what changed and the server merges it
// into the stored value under the row lock. Pure (no database, no Encore runtime).

// The two request types spell their unions out (no keyof / indexed types), so Encore reads them.

/** The fields of one transport leg a person changed; the fields left out stay as stored. */
export interface GateLegChange {
  leg: "IN" | "OUT" | "CFS";
  company?: string & MaxLen<200>;
  plate?: string & MaxLen<40>;
  driver?: string & MaxLen<200>;
  phone?: string & MaxLen<40>;
  /** ISO time, "" clears it. */
  gateTime?: string & MaxLen<40>;
}

/** One gate checklist icon set to a state; the other icons stay as stored. */
export interface GateCheckChange {
  key: "ht" | "photos" | "measure" | "vgm" | "seal" | "dg";
  state: "g" | "a" | "r" | "n";
}

export const CHECK_KEYS: (keyof GateChecklist)[] = ["ht", "photos", "measure", "vgm", "seal", "dg"];
const CHECK_STATES: GateCheckState[] = ["g", "a", "r", "n"];
const LEGS: GateTransportLeg["leg"][] = ["IN", "OUT", "CFS"];
const LEG_FIELDS = ["company", "plate", "driver", "phone", "gateTime"] as const;

export const TRIP_LEG_READ_ONLY = "This leg was filled by a Trucking trip — it changes only on the trip";

/** Why the change cannot be taken as sent (a message for the user), or null. */
export function legChangeProblem(change: GateLegChange): string | null {
  if (!LEGS.includes(change.leg)) return `Leg must be one of: ${LEGS.join(", ")}`;
  if (!LEG_FIELDS.some((f) => change[f] !== undefined)) return "Nothing to change on the leg";
  const at = change.gateTime?.trim();
  if (at && Number.isNaN(Date.parse(at))) return "Gate time must be a date and time";
  return null;
}

export function checkChangeProblem(change: GateCheckChange): string | null {
  if (!CHECK_KEYS.includes(change.key)) return `Checklist item must be one of: ${CHECK_KEYS.join(", ")}`;
  if (!CHECK_STATES.includes(change.state)) return "Checklist state must be g, a, r or n";
  return null;
}

/**
 * The legs as stored (always the three, in order) with `change` merged into its leg: only the
 * fields sent change, trimmed. A leg a Trucking trip filled is read-only (null: refuse the change).
 */
export function mergeLegChange(stored: GateTransportLeg[], change: GateLegChange): GateTransportLeg[] | null {
  const target = stored.find((l) => l.leg === change.leg);
  if (target && fromTrip(target)) return null;
  const patch: Partial<GateTransportLeg> = {};
  for (const f of LEG_FIELDS) {
    const v = change[f];
    if (v !== undefined) patch[f] = v.trim();
  }
  return stored.map((l) => (l.leg === change.leg ? { ...l, ...patch } : l));
}
