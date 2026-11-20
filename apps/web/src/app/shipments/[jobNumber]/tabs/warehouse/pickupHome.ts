// Which pick-up a job's Warehouse tab → Pick-up keeps (owner decision Q17, user council 20 Nov
// 2026, built per job): a shipment with a Warehouse Concept position, seen by a user who may see
// the Concept, has its live pick-up and server-made PIN in the Concept - the one its gate checks -
// and the normal Warehouse's pick-up of that job is shown read-only. Every other job, and every
// user who can't see the Concept, keeps the normal Warehouse's pick-up as before. Pure, so it is
// tested without React.

/** Warehouse Concept keeps its truck references (TCZ…) in the positions table; they are not positions. */
export const CONCEPT_TRUCK_TYPE = "Truck";

export type PickupHome =
  /** The normal Warehouse's pick-up, editable as before. `checkFailed`: the Concept could not be asked. */
  | { kind: "basic"; checkFailed: boolean }
  /** Still asking the Concept whether the job has a position: neither pick-up is offered yet. */
  | { kind: "checking" }
  /** The Concept's pick-up is the live one; `positionRef` is the position's WCZ reference. */
  | { kind: "concept"; positionRef: string };

export interface PickupHomeInput {
  canSeeConcept: boolean;
  isLoading: boolean;
  isError: boolean;
  /** The job's Warehouse Concept positions as the API lists them; undefined while none were read. */
  positions: { taskId: string; type: string }[] | undefined;
}

const PICKUP_FIELDS = ["haulier", "licensePlate", "driver"] as const;

/** The normal Warehouse's stored pick-up rows (JSON) that hold anything, for its read-only view. */
export function filledPickupRows(json: string | undefined): Record<string, string>[] {
  try {
    const parsed: unknown = JSON.parse(json || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => Object.fromEntries(PICKUP_FIELDS.map((f) => [f, typeof r[f] === "string" ? (r[f] as string) : ""])))
      .filter((r) => PICKUP_FIELDS.some((f) => r[f]!.trim()));
  } catch {
    return [];
  }
}

export function pickupHome({ canSeeConcept, isLoading, isError, positions }: PickupHomeInput): PickupHome {
  if (!canSeeConcept) return { kind: "basic", checkFailed: false };
  // Positions read once decide, also while a later refetch fails: a failed background read must
  // not bring the old editable pick-up back on a job whose live one is the Concept's.
  if (positions) {
    const position = positions.find((p) => p.type !== CONCEPT_TRUCK_TYPE);
    return position ? { kind: "concept", positionRef: position.taskId } : { kind: "basic", checkFailed: false };
  }
  // Nothing read and the read failed: the pick-up the job has had all along stays, with a note.
  if (isError) return { kind: "basic", checkFailed: true };
  if (isLoading) return { kind: "checking" };
  return { kind: "basic", checkFailed: false };
}
