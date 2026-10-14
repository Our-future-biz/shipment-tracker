import { APIError } from "encore.dev/api";
import { sql } from "drizzle-orm";
import { containerPositionRepository, containerRepository } from "../repositories/warehouseRecords.repository";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import type { Tx } from "../repositories/warehouseSection.repository";
import { gateMovementTable, type GateEvent } from "../schemas/gateMovement.schema";
import {
  warehouseContainerPositionTable,
  warehouseContainerTable,
  type ContainerPositionRecord,
  type WarehouseContainerRecord,
} from "../schemas/warehouseRecords.schema";
import type { GatePositionContainer } from "../interfaces/gate.interfaces";
import { containerKind, containerStatus, LEGACY_LINK } from "./containerRules";
import type { db } from "../db/db";

// A position as a house of a container: what the gate job reads of it and the rules the gate
// stamps and archive follow because of it. Only repositories here (no import cycle with the
// gate service).

/** The house of a position: its link, its container and every house of that container. */
export interface HouseCtx {
  link: ContainerPositionRecord;
  container: WarehouseContainerRecord;
  links: ContainerPositionRecord[];
}

export { LEGACY_LINK };

/** The house of each of these positions (a position is in at most one container). */
export async function houseContexts(movementIds: string[], companyId: string, tx?: Tx | typeof db): Promise<Map<string, HouseCtx>> {
  const links = await containerPositionRepository.liveForMovements(movementIds, companyId, tx);
  const containerIds = [...new Set(links.map((l) => l.containerId))];
  const containers = await containerRepository.findByIds(containerIds, companyId, tx);
  const all = await containerPositionRepository.listForContainers(containerIds, companyId, tx);
  const out = new Map<string, HouseCtx>();
  for (const link of links) {
    const container = containers.find((c) => c.id === link.containerId);
    if (container) out.set(link.movementId, { link, container, links: all.filter((l) => l.containerId === container.id) });
  }
  return out;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

export const isExportContainer = (c: Pick<WarehouseContainerRecord, "direction">) => containerKind(c.direction) === "export";

/** An import house whose receipt is the tally tick (not an old one-position container). */
export const tallyRequired = (h: HouseCtx | null | undefined): h is HouseCtx => !!h && !isExportContainer(h.container) && h.link.addedBy !== LEGACY_LINK;

/** The container card of the gate job. */
export function positionContainer(h: HouseCtx): GatePositionContainer {
  return {
    id: h.container.id,
    number: h.container.number,
    equipment: h.container.equipment,
    direction: h.container.direction,
    kind: containerKind(h.container.direction),
    status: containerStatus(h.container, h.links),
    seal: h.container.seal,
    gateInAt: iso(h.container.gateInAt),
    gateOutAt: iso(h.container.gateOutAt),
    stuffedAt: iso(h.link.stuffedAt),
    stuffedBy: h.link.stuffedBy,
    tallyOutcome: h.link.tallyOutcome,
    tallyPieces: h.link.tallyPieces,
    tickedAt: iso(h.link.tickedAt),
    tickedBy: h.link.tickedBy,
    tallyRequired: tallyRequired(h),
  };
}

/** Why the WH release of this position is refused because of its container; null when it is not. */
export function houseBlocksRelease(m: { visit: string; leftAt: Date | null }, h: HouseCtx | null | undefined): string | null {
  if (m.leftAt) return "This cargo already left the warehouse in a container";
  if (!h) return null;
  if (isExportContainer(h.container) && h.link.stuffedAt) {
    return `Stuffed in container ${h.container.number} — it leaves with the container (its gate-out), not through WH release`;
  }
  if (m.visit === "výdej" && tallyRequired(h) && h.link.tallyOutcome !== "received") {
    return `Not received yet — tick this house off at the stripping tally of container ${h.container.number} first`;
  }
  return null;
}

/**
 * Locks the live container of this position (if it is a house), then the position — container
 * before position, as every container action locks them. A stuffed mark or tally under way
 * finishes first, so the caller's next statement sees it (a conditional UPDATE alone re-checks
 * only the position row: its EXISTS on the house would still read the old snapshot).
 */
export async function lockHouse(tx: Tx, movementId: string, companyId: string) {
  const link = await containerPositionRepository.liveForMovement(tx, movementId, companyId);
  if (link) await containerRepository.lock(tx, link.containerId, companyId);
  await gateMovementRepository.lockLive(tx, [movementId], companyId);
}

const t = gateMovementTable;
const cp = warehouseContainerPositionTable;
const ct = warehouseContainerTable;

/** houseBlocksRelease in SQL, on the movement being released (checked at the moment of the UPDATE). */
export const houseReleaseOkSql = sql`(${t.leftAt} IS NULL AND NOT EXISTS (
  SELECT 1 FROM ${cp} p JOIN ${ct} c ON c.id = p.container_id AND c.deleted_at IS NULL
  WHERE p.movement_id = ${t.id} AND p.deleted_at IS NULL
    AND ((c.direction = 'Loading' AND p.stuffed_at IS NOT NULL)
      OR (c.direction <> 'Loading' AND ${t.visit} = 'výdej' AND p.added_by <> ${LEGACY_LINK} AND p.tally_outcome <> 'received'))))`;

/** The position is a stuffed house (export) or a tallied house (import) of a container that has not gone out. */
const holdsPosition = (h: HouseCtx) => !h.container.gateOutAt && (!!h.link.stuffedAt || !!h.link.tallyOutcome);

/**
 * Before a position is archived or removed: refused while it is stuffed or tallied in a container
 * that has not gone out; otherwise its house is taken out of the container (planned / not
 * tallied yet), logged on the container. Runs in the archive's transaction.
 */
export async function releaseHousesForArchive(tx: Tx, movementIds: string[], companyId: string, by: string, label: string) {
  // Containers first (as every container action locks them), then read the houses as they are.
  const linked = await containerPositionRepository.liveForMovements(movementIds, companyId, tx);
  for (const id of [...new Set(linked.map((l) => l.containerId))].sort()) await containerRepository.lock(tx, id, companyId);
  const houses = await houseContexts(movementIds, companyId, tx);
  for (const h of houses.values()) {
    if (holdsPosition(h)) {
      const what = h.link.stuffedAt ? "stuffed in" : "tallied in";
      throw APIError.failedPrecondition(`This position is ${what} container ${h.container.number} — take it out there first (or void the tally)`);
    }
  }
  const open = [...houses.values()].filter((h) => !h.container.gateOutAt);
  if (!open.length) return;
  await containerPositionRepository.softRemove(
    tx,
    open.map((h) => h.link.id),
    companyId,
  );
  const at = new Date().toISOString();
  for (const h of open) {
    const evt: GateEvent = { kind: "removedFromContainer", label: `House taken out — ${label}`, at, by, detail: h.link.movementId };
    await containerRepository.conditionalUpdate(tx, h.container.id, companyId, {}, [evt]);
  }
}
