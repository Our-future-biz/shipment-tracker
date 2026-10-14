import { sql } from "drizzle-orm";
import { gateMovementTable, type GateReleaseLine } from "../schemas/gateMovement.schema";
import { warehouseExceptionTable } from "../schemas/warehouseException.schema";

// Damage / short / over (OS&D) exceptions — pure helpers, no imports from the services (no
// import cycle). An open exception puts the cargo ON HOLD: the release gate shows the line
// below as Blocked, nobody ticks it by hand, and the WH release is refused (even after a
// supervisor override) until every open exception of the movement is resolved with a note.

/** Release-gate line set by the exceptions, never by hand. The web shows the same text. */
export const EXCEPTION_GATE = "No open exceptions";
export const EXCEPTION_TYPES = ["Damaged", "Short", "Over"] as const;

export type OpenException = { type: string; pieces: number };

/** The line's note while exceptions are open, e.g. "2 open: Damaged 3 pcs, Short 1 pc". */
export function openExceptionsNote(open: OpenException[]): string {
  const parts = open.map((e) => `${e.type} ${e.pieces} pc${e.pieces === 1 ? "" : "s"}`);
  return `${open.length} open: ${parts.join(", ")}`.slice(0, 500);
}

const t = gateMovementTable;
const lineJson = (line: GateReleaseLine) => sql`${JSON.stringify(line)}::jsonb`;

/** Release gates with the exceptions line set to `line` (order kept), or appended when missing. */
export const setExceptionLineSql = (line: GateReleaseLine) => sql`CASE WHEN ${t.releaseGates} @> ${JSON.stringify([{ g: EXCEPTION_GATE }])}::jsonb
  THEN (SELECT jsonb_agg(CASE WHEN e.x->>'g' = ${EXCEPTION_GATE} THEN ${lineJson(line)} ELSE e.x END ORDER BY e.ord)
        FROM jsonb_array_elements(${t.releaseGates}) WITH ORDINALITY AS e(x, ord))
  ELSE ${t.releaseGates} || jsonb_build_array(${lineJson(line)}) END`;

/**
 * No open exception holds the movement: its exceptions line (if any) is OK and no open exception
 * row exists. Both are checked so the release is refused even if the line went missing; the line
 * is on the row itself, so a release racing with a new exception sees it.
 */
export const noOpenExceptionSql = sql`(NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(${t.releaseGates}) x
    WHERE x->>'g' = ${EXCEPTION_GATE} AND COALESCE(x->>'s', '') <> 'OK')
  AND NOT EXISTS (
    SELECT 1 FROM ${warehouseExceptionTable} ex
    WHERE ex.movement_id = ${t.id} AND ex.status = 'open' AND ex.deleted_at IS NULL))`;

/** The movement's exceptions line holds it (TypeScript twin of the line part of noOpenExceptionSql). */
export const exceptionHold = (gates: GateReleaseLine[]) => gates.some((x) => x.g === EXCEPTION_GATE && x.s !== "OK");
