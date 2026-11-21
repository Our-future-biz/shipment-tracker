import { sql } from "drizzle-orm";
import { gateMovementTable, type GateReleaseLine } from "../schemas/gateMovement.schema";
import type { GateCustomsMode, GateCustomsStatus } from "../interfaces/gate.interfaces";

// Customs statuses shared with the Shipments module; only the last one releases cargo.
export const CUSTOMS_STATUSES: readonly GateCustomsStatus[] = [
  "Waiting For Commercial Paperwork",
  "Paperwork Verification Pending",
  "Paperwork Verified",
  "Under Customs Clearance",
  "Customs Cleared/Released",
];
export const CUSTOMS_CLEARED: GateCustomsStatus = "Customs Cleared/Released";
// Customs modes of the gate (the web's CUSTOMS_MODES has the same list).
export const CUSTOMS_MODES: readonly GateCustomsMode[] = ["SCP", "JSD", "T1", "T2L", "ATA Carnet", "RDT", "C-Goods"];

/**
 * Why a customs status is not typed on a record linked to a shipment: it follows the shipment
 * (shipmentFollow), and only customs clears the Customs line (Q18 (b)). Must match
 * CUSTOMS_FROM_SHIPMENT on the web (gate-log/_lib/steps.ts).
 */
export const CUSTOMS_FROM_SHIPMENT = "The customs status of a record linked to a shipment follows the shipment — it is set in Shipments (Refresh from shipment reads it now)";

/** A customs status the gate knows (Shipments sends free text). */
export const isCustomsStatus = (v: unknown): v is GateCustomsStatus => (CUSTOMS_STATUSES as readonly unknown[]).includes(v);

export const customsLine = (customsStatus: string): GateReleaseLine =>
  customsStatus === CUSTOMS_CLEARED
    ? { g: "Customs", s: "OK", note: "released" }
    : { g: "Customs", s: "Pending", note: customsStatus || "customs status not set" };

const t = gateMovementTable;

/**
 * Release gates with the Customs line set to `line` (order kept), or appended when missing.
 * Domestic positions have no customs: their gates stay as they are.
 */
export const setCustomsLineSql = (line: GateReleaseLine) => {
  const lineJson = sql`${JSON.stringify(line)}::jsonb`;
  return sql`CASE WHEN ${t.handling} = 'Domestic' THEN ${t.releaseGates}
    WHEN ${t.releaseGates} @> ${JSON.stringify([{ g: "Customs" }])}::jsonb
    THEN (SELECT jsonb_agg(CASE WHEN e.x->>'g' = 'Customs' THEN ${lineJson} ELSE e.x END ORDER BY e.ord)
          FROM jsonb_array_elements(${t.releaseGates}) WITH ORDINALITY AS e(x, ord))
    ELSE ${t.releaseGates} || jsonb_build_array(${lineJson}) END`;
};
