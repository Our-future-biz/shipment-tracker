import { sql } from "drizzle-orm";
import { gateMovementTable, type GateReleaseLine } from "../schemas/gateMovement.schema";

// Customs statuses shared with the Shipments module; only the last one releases cargo.
export const CUSTOMS_STATUSES = [
  "Waiting For Commercial Paperwork",
  "Paperwork Verification Pending",
  "Paperwork Verified",
  "Under Customs Clearance",
  "Customs Cleared/Released",
];
export const CUSTOMS_CLEARED = "Customs Cleared/Released";
// Customs modes of the gate (the web's CUSTOMS_MODES has the same list).
export const CUSTOMS_MODES = ["SCP", "JSD", "T1", "T2L", "ATA Carnet", "RDT", "C-Goods"];

export const customsLine = (customsStatus: string): GateReleaseLine =>
  customsStatus === CUSTOMS_CLEARED
    ? { g: "Customs", s: "OK", note: "released" }
    : { g: "Customs", s: "Pending", note: customsStatus || "customs status not set" };

const t = gateMovementTable;

/** Release gates with the Customs line set to `line` (order kept), or appended when missing. */
export const setCustomsLineSql = (line: GateReleaseLine) => {
  const lineJson = sql`${JSON.stringify(line)}::jsonb`;
  return sql`CASE WHEN ${t.releaseGates} @> ${JSON.stringify([{ g: "Customs" }])}::jsonb
    THEN (SELECT jsonb_agg(CASE WHEN e.x->>'g' = 'Customs' THEN ${lineJson} ELSE e.x END ORDER BY e.ord)
          FROM jsonb_array_elements(${t.releaseGates}) WITH ORDINALITY AS e(x, ord))
    ELSE ${t.releaseGates} || jsonb_build_array(${lineJson}) END`;
};
