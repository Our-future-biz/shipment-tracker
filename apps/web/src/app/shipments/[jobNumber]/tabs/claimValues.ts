import type { controllers, interfaces } from "@/lib/api/client";

// What the claim dialog sends. Pure, so it is unit-tested.

export type ClaimValues = controllers.ClaimUpdateRequest;

/**
 * The fields of a changed claim that differ from the claim as it was opened: only those are sent,
 * so two people changing different fields of one claim keep both. A new claim sends them all.
 */
export function claimChanges(claim: interfaces.ClaimItem | undefined, values: ClaimValues): ClaimValues {
  if (!claim) return values;
  const was = claim as unknown as Record<string, string | null | undefined>;
  return Object.fromEntries(Object.entries(values).filter(([k, v]) => v !== (was[k] ?? "")));
}

/** Something is filled in: a new claim needs that, as an empty one would still mark the shipment as claimed. */
export const claimFilled = (values: ClaimValues): boolean => Object.values(values).some((v) => typeof v === "string" && v.trim() !== "");
