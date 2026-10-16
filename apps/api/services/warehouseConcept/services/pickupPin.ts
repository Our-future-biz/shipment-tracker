import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { gateMovementTable, type GateReleaseLine } from "../schemas/gateMovement.schema";
import { warehouseTaskTable } from "../schemas/warehouseTask.schema";

// Pick-up PIN: operations generate it in Shipments (Warehouse tab → Pick-up), the haulier's
// driver gives it at the gate, and the warehouse checks it before releasing outbound cargo of a
// position linked to that shipment. Only its HMAC (`pinHash`, keyed with a server secret and the
// PIN's id) is stored in the shipment's "pickup" section; the PIN itself is shown once, in the
// answer to "generate". PINs stored before the switch as plain `pin` still verify and are hashed
// (and the plain value dropped) on their first check or on renewal; no read ever returns either
// field (`stripPickupSecrets`). Pure helpers here, no imports from the services (no import cycle).

/** Release-gate line set by the PIN check at the gate, never by hand. The web shows the same text. */
export const PICKUP_PIN_GATE = "Pick-up PIN verified";
export const PICKUP_SECTION = "pickup";
export const PICKUP_PIN_DIGITS = 6;
/** Rows of the pick-up table (haulier / plate / driver) one save may carry. */
export const MAX_PICKUP_ROWS = 50;

export const pickupPinLine = (note = "waiting for the driver's PIN"): GateReleaseLine => ({ g: PICKUP_PIN_GATE, s: "Pending", note });

/** Six digits from a cryptographically secure source; leading zeros kept. */
export const newPickupPin = () => String(randomInt(0, 10 ** PICKUP_PIN_DIGITS)).padStart(PICKUP_PIN_DIGITS, "0");

// Constant-time compare. Both sides are hashed first so neither the length nor the digits leak
// through timing. Empty never matches. PINs made before the switch (4 digits) still match.
export function pinMatches(stored: string | null | undefined, typed: string | null | undefined): boolean {
  const a = (stored ?? "").trim();
  const b = (typed ?? "").trim();
  if (!a || !b) return false;
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** HMAC of a pick-up PIN: keyed with the server secret, bound to the PIN's id. Hex. */
export const hashPickupPin = (key: string, pinId: string, pin: string) =>
  createHmac("sha256", key).update(`${pinId}:${pin.trim()}`).digest("hex");

/**
 * The typed PIN against what is stored: its hash, or (stored before hashing) the plain PIN.
 * Constant-time; empty never matches.
 */
export function pickupPinMatches(stored: { pin: string; pinHash: string; pinId: string }, typed: string, key: string): boolean {
  const t = typed.trim();
  if (!t) return false;
  if (stored.pinHash) {
    const a = Buffer.from(stored.pinHash, "hex");
    const b = Buffer.from(hashPickupPin(key, stored.pinId, t), "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  }
  return pinMatches(stored.pin, t);
}

/** The pick-up section's data as any client may see it: never the PIN or its hash. */
export function stripPickupSecrets(data: unknown): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  return Object.fromEntries(Object.entries(data).filter(([k]) => k !== "pin" && k !== "pinHash"));
}

/** Outbound cargo of a position linked to a shipment: released against the pick-up PIN. */
export const isLinkedOutbound = (m: { shipmentId: string | null; visit: string }) => !!m.shipmentId && m.visit === "výdej";

/** A row a Trucking trip filled carries `source` (read-only "From trip LCZ…"); rows typed in Shipments have none. */
export type PickupRow = { haulier: string; licensePlate: string; driver: string; source?: { kind: "trucking"; tripRef: string; tripKind?: string; tripId?: string } };
export type PickupHistoryEntry = { kind: "created" | "renewed"; at: string; by: string };
export type PickupData = {
  /** Plain PIN of a PIN stored before hashing; "" otherwise. */
  pin: string;
  pinHash: string;
  pinId: string;
  pinTries: number;
  pinCreatedAt: string;
  pinCreatedBy: string;
  rows: PickupRow[];
};

const str = (v: unknown) => (typeof v === "string" ? v : "");

/** Haulier / plate / driver rows from the stored JSON string; anything unreadable is dropped. */
export function parsePickupRows(raw: unknown): PickupRow[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r) => {
      const row: PickupRow = { haulier: str(r.haulier), licensePlate: str(r.licensePlate), driver: str(r.driver) };
      const src = r.source as Record<string, unknown> | null | undefined;
      if (src && typeof src === "object" && src.kind === "trucking" && typeof src.tripRef === "string" && src.tripRef.trim()) {
        row.source = {
          kind: "trucking",
          tripRef: src.tripRef,
          ...(typeof src.tripKind === "string" && src.tripKind ? { tripKind: src.tripKind } : {}),
          ...(typeof src.tripId === "string" && src.tripId ? { tripId: src.tripId } : {}),
        };
      }
      return row;
    });
}

/** Reads a stored pick-up section safely, whatever shape it has. */
export function readPickup(data: unknown): PickupData {
  const d = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  const tries = typeof d.pinTries === "number" && Number.isInteger(d.pinTries) && d.pinTries > 0 ? d.pinTries : 0;
  return {
    pin: str(d.pin).trim(),
    pinHash: str(d.pinHash),
    pinId: str(d.pinId),
    pinTries: tries,
    pinCreatedAt: str(d.pinCreatedAt),
    pinCreatedBy: str(d.pinCreatedBy),
    rows: parsePickupRows(d.rows),
  };
}

/** A PIN is set (hashed, or plain from before hashing). */
export const hasPickupPin = (p: { pin: string; pinHash: string }) => !!(p.pin || p.pinHash);

const t = gateMovementTable;
const lineJson = (line: GateReleaseLine) => sql`${JSON.stringify(line)}::jsonb`;
const hasLine = sql`${t.releaseGates} @> ${JSON.stringify([{ g: PICKUP_PIN_GATE }])}::jsonb`;

/** Release gates with the Pick-up PIN line set to `line` (order kept), or appended when missing. */
export const setPickupLineSql = (line: GateReleaseLine) => sql`CASE WHEN ${hasLine}
  THEN (SELECT jsonb_agg(CASE WHEN e.x->>'g' = ${PICKUP_PIN_GATE} THEN ${lineJson(line)} ELSE e.x END ORDER BY e.ord)
        FROM jsonb_array_elements(${t.releaseGates}) WITH ORDINALITY AS e(x, ord))
  ELSE ${t.releaseGates} || jsonb_build_array(${lineJson(line)}) END`;

/** Release gates without the Pick-up PIN line. */
export const dropPickupLineSql = sql`COALESCE((SELECT jsonb_agg(e.x ORDER BY e.ord)
  FROM jsonb_array_elements(${t.releaseGates}) WITH ORDINALITY AS e(x, ord)
  WHERE e.x->>'g' IS DISTINCT FROM ${PICKUP_PIN_GATE}), '[]'::jsonb)`;

export const hasPickupLineSql = hasLine;
export const pickupLineOkSql = sql`${t.releaseGates} @> ${JSON.stringify([{ g: PICKUP_PIN_GATE, s: "OK" }])}::jsonb`;

/** isLinkedOutbound in SQL, on the gate row's own columns and its live warehouse task. */
export const linkedOutboundCond = sql`(${t.visit} = 'výdej' AND EXISTS (
  SELECT 1 FROM ${warehouseTaskTable} wt
  WHERE wt.id = ${t.warehouseTaskId} AND wt.shipment_id IS NOT NULL AND wt.deleted_at IS NULL))`;

/** Gate rows linked (through their live task) to one shipment. */
export const linkedToShipmentCond = (shipmentId: string) => sql`EXISTS (
  SELECT 1 FROM ${warehouseTaskTable} wt
  WHERE wt.id = ${t.warehouseTaskId} AND wt.shipment_id::text = ${shipmentId} AND wt.deleted_at IS NULL)`;

const MAX_PICKUP_FIELD = 200;

// What a pick-up save from Shipments may carry: the rows only, as a JSON string holding a list of
// up to MAX_PICKUP_ROWS objects with text fields. The PIN and its tries are never taken from
// the client. Null when the input is not that shape. A row sent with a trip marker (`source`) is
// the trip's row echoed back: it is left out — the stored trip rows stay as they are
// (tripSource.mergeUserPickupRows).
export function pickupRowsFromInput(data: unknown): PickupRow[] | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const raw = (data as Record<string, unknown>).rows;
  if (typeof raw !== "string") return null;
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(list) || list.length > MAX_PICKUP_ROWS) return null;
  const rows: PickupRow[] = [];
  for (const r of list) {
    if (!r || typeof r !== "object" || Array.isArray(r)) return null;
    const o = r as Record<string, unknown>;
    if (o.source !== undefined && o.source !== null) continue;
    const field = (k: string) => (o[k] === undefined || o[k] === null ? "" : o[k]);
    const [haulier, licensePlate, driver] = ["haulier", "licensePlate", "driver"].map(field);
    if ([haulier, licensePlate, driver].some((v) => typeof v !== "string" || v.length > MAX_PICKUP_FIELD)) return null;
    rows.push({ haulier: haulier as string, licensePlate: licensePlate as string, driver: driver as string });
  }
  return rows;
}
