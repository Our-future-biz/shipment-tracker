import { consignmentHref, jobConsignmentsHref, tripHref } from "./truckingLinks";

// Cost rows Trucking writes on a job (Costs Breakdown), by their source ref: a consignment's selling
// rows "trucking:consignment:<id>", a trip's buying rows "trucking:trip:<id>" (or
// "trucking:trip:<id>:job:<shipment>" when a trip carries several jobs), a partner delivery
// "trucking:leg:<id>", the internal charge "trucking:internal:<consignment>" and a charged exception
// "trucking:exception:<id>". They are kept by Trucking — read-only in the Costs Breakdown — and
// their tag links to where they change.

export type TruckingRef = { kind: "consignment" | "trip" | "leg" | "internal" | "exception"; id: string };

/** The Trucking record a cost row comes from, or null for a row of the job's own. */
export function parseTruckingRef(sourceRef: string | null | undefined): TruckingRef | null {
  const m = /^trucking:(consignment|trip|leg|internal|exception):([^:]+)/.exec(sourceRef ?? "");
  return m ? { kind: m[1] as TruckingRef["kind"], id: m[2]! } : null;
}

export const isTruckingCost = (sourceRef: string | null | undefined) => (sourceRef ?? "").startsWith("trucking:");

export interface TruckingCostTag {
  /** "Kept by Trucking · TCZ2026000123" or, for a trip's buy line, "Kept by Trucking · trip LCZ2026000045" */
  label: string;
  /** Where the row changes: the consignment, the trip, or the job's consignments; null when Trucking is not enabled for the company */
  href: string | null;
  /** Read out and shown on hover */
  title: string;
}

interface TagContext {
  consignments: readonly { id: string; ref: string }[];
  /** Trip refs by trip id */
  tripRefs: ReadonlyMap<string, string>;
  /** The job's shipment id, for rows without a page of their own */
  shipmentId: string;
  /** False when the company has Trucking hidden: the tag says what the row is, without a link. */
  linkable?: boolean;
}

/** The tag of a Trucking cost row: what it comes from and a link to where it changes; null for a row of the job's own. */
export function truckingCostTag(sourceRef: string | null | undefined, ctx: TagContext): TruckingCostTag | null {
  const tag = truckingCostTagWithLink(sourceRef, ctx);
  return tag && ctx.linkable === false ? { ...tag, href: null, title: "Kept by Trucking" } : tag;
}

function truckingCostTagWithLink(sourceRef: string | null | undefined, ctx: TagContext): TruckingCostTag | null {
  if (!isTruckingCost(sourceRef)) return null;
  const ref = parseTruckingRef(sourceRef);
  const kept = "Kept by Trucking";
  if (ref?.kind === "consignment" || ref?.kind === "internal") {
    const c = ctx.consignments.find((x) => x.id === ref.id);
    return { label: c ? `${kept} · ${c.ref}` : kept, href: consignmentHref(ref.id), title: `${kept} — open the consignment to change it` };
  }
  if (ref?.kind === "trip") {
    const tripRef = ctx.tripRefs.get(ref.id);
    return { label: tripRef ? `${kept} · trip ${tripRef}` : `${kept} · trip`, href: tripHref(ref.id), title: `${kept} — the trip's buy price; open the trip to change it` };
  }
  return { label: kept, href: jobConsignmentsHref(ctx.shipmentId), title: `${kept} — open the job's consignments to change it` };
}
