// Cost rows Trucking writes on a job (Costs Breakdown): the selling rows of a consignment carry
// "trucking:consignment:<id>", the buying rows of its trip "trucking:trip:<id>". They are kept by
// Trucking — read-only in the Costs Breakdown — and tagged with the consignment's ref.

export type TruckingRef = { kind: "consignment" | "trip"; id: string };

/** The consignment or trip a cost row comes from, or null for a row of the job's own. */
export function parseTruckingRef(sourceRef: string | null | undefined): TruckingRef | null {
  const m = /^trucking:(consignment|trip):(.+)$/.exec(sourceRef ?? "");
  return m ? { kind: m[1] as TruckingRef["kind"], id: m[2]! } : null;
}

export const isTruckingCost = (sourceRef: string | null | undefined) => (sourceRef ?? "").startsWith("trucking:");

/** "From Trucking · TCZ2026000123": the consignment a row comes from (a trip row by the consignment on it). */
export function truckingCostTag(sourceRef: string | null | undefined, consignments: readonly { id: string; ref: string; tripId: string | null }[]): string {
  const ref = parseTruckingRef(sourceRef);
  const c = ref && consignments.find((x) => (ref.kind === "consignment" ? x.id === ref.id : x.tripId === ref.id));
  return c ? `From Trucking · ${c.ref}` : "From Trucking";
}
