import { sql } from "drizzle-orm";
import { APIError } from "encore.dev/api";
import log from "encore.dev/log";
import { shipments } from "~encore/clients";
import { db } from "../db/db";
import { gateMovementRepository, type GateMovementRow, type ShipmentLink } from "../repositories/gateMovement.repository";
import { dockSlotRepository } from "../repositories/warehouseRecords.repository";
import type { Tx } from "../repositories/warehouseSection.repository";
import type { GateMovementRecord } from "../schemas/gateMovement.schema";
import { syncStockForMovement } from "./warehouseStockSync";
import { partiesChange, type GateParties } from "./gateParties";
import { serviceActor, type ServiceActor } from "../../../lib/outbox/serviceIdentity";

// The change may come from a shipment edit or a rename in the Customer Database that the shipment
// took: either way the record takes what the shipment shows, so the log names the shipment.
const BY = "Shipment";
const LABEL = "Customer updated from the shipment";
// Shipments the backfill reads at once.
const PARALLEL = 4;
// Names listed in one line of the backfill report.
const REPORT_NAMES = 20;

/** What follow() did for one shipment. */
export interface FollowResult {
  /** The gate records that changed, as stored now. */
  changed: GateMovementRecord[];
  /** The shipment is gone in Shipments: nothing was changed. */
  shipmentDeleted: boolean;
}

// Changes of one shipment's gate records take turns (the lock lasts until the transaction ends),
// and each reads the shipment only once it has its turn. So an event delivered late, twice or out
// of order never writes older names over newer ones (as shipments/partyLinks does for renames).
const takeTurn = (tx: Tx, companyId: string, shipmentId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`gate-parties:${companyId}:${shipmentId}`}))`);

// The shipment's Customer and Customer's PIC as Shipments holds them now; null when it is deleted.
async function currentParties(shipmentId: string, authData: ServiceActor): Promise<GateParties | null> {
  try {
    const { shipment } = await shipments.shipmentGet({ shipmentId }, { authData });
    return { customer: shipment.customer ?? "", customerContact: shipment.customerPic ?? "" };
  } catch (err) {
    if (err instanceof APIError && err.code === "not_found") return null;
    throw err;
  }
}

// One locked record takes the shipment's parties: the record and its log, the dock slots that
// showed the old customer, and its stock line and bonded entry (they copy the customer).
async function applyParties(tx: Tx, companyId: string, row: GateMovementRow, shipment: GateParties): Promise<GateMovementRecord | null> {
  const change = partiesChange({ customer: row.customer, customerContact: row.customerContact }, shipment);
  if (!change) return null;
  const updated = await gateMovementRepository.conditionalUpdate(
    row.id,
    companyId,
    change.changes,
    [{ kind: "refreshedFromShipment", label: LABEL, at: new Date().toISOString(), by: BY, detail: change.detail }],
    undefined,
    tx,
  );
  if (!updated) return null;
  if (change.changes.customer !== undefined) await dockSlotRepository.followCustomer(tx, companyId, row.id, row.customer, change.changes.customer);
  await syncStockForMovement(tx, companyId, row.id, { by: BY, why: "customer updated from the shipment" });
  return updated;
}

// "SEA-1A2B3C (WCZ2026000012)": how the report names a shipment (its id means nothing to people).
function shipmentName(links: ShipmentLink[]): string {
  const job = links.find((l) => l.jobNumber)?.jobNumber ?? "";
  const refs = [...new Set(links.map((l) => l.positionRef || l.gateRef))].join(", ");
  return job ? `${job} (${refs})` : refs;
}

function reportLine(field: string, names: string[]) {
  const more = names.length - REPORT_NAMES;
  return { field, value: names.slice(0, REPORT_NAMES).join(", ") + (more > 0 ? ` and ${more} more` : ""), count: names.length };
}

class GatePartiesService {
  /**
   * The gate records of a shipment take its current Customer and Customer's PIC, in one
   * transaction with their stock line and bonded entry and the dock slots that still show the
   * old customer. The shipment-parties-changed event is only the signal: the names are read from
   * Shipments under the shipment's turn. A deleted shipment changes nothing; a failed read is
   * thrown (the event is delivered again).
   * `authData`: who reads Shipments (the company's service identity unless given).
   */
  async follow(companyId: string, shipmentId: string, authData?: ServiceActor): Promise<FollowResult> {
    // Before the transaction: no lock is held while auth answers.
    const reader = authData ?? (await serviceActor(companyId));
    return db.transaction(async (tx) => {
      await takeTurn(tx, companyId, shipmentId);
      const ids = await gateMovementRepository.liveIdsForShipment(tx, shipmentId, companyId);
      // Most shipments are not in the warehouse: Shipments is not asked about them.
      if (!ids.length) return { changed: [], shipmentDeleted: false };
      const shipment = await currentParties(shipmentId, reader);
      if (!shipment) return { changed: [], shipmentDeleted: true };
      const changed: GateMovementRecord[] = [];
      for (const row of await gateMovementRepository.lockLive(tx, ids, companyId)) {
        if (row.shipmentId !== shipmentId) continue; // unlinked meanwhile
        const updated = await applyParties(tx, companyId, row, shipment);
        if (updated) changed.push(updated);
      }
      return { changed, shipmentDeleted: false };
    });
  }

  /**
   * Links backfill: every live gate record linked to a shipment takes the shipment's current
   * Customer and Customer's PIC. One shipment's failure does not stop the others; deleted and
   * unreadable shipments are reported by job number and position, not by id.
   */
  async normalize(companyId: string): Promise<{ checked: number; changed: number; unmatched: { field: string; value: string; count: number }[] }> {
    const links = await gateMovementRepository.liveShipmentLinks(companyId);
    const byShipment = new Map<string, ShipmentLink[]>();
    for (const l of links) byShipment.set(l.shipmentId, [...(byShipment.get(l.shipmentId) ?? []), l]);
    const reader = await serviceActor(companyId);
    const queue = [...byShipment.keys()];
    let changed = 0;
    const deleted: string[] = [];
    const unread: string[] = [];
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const r = await this.follow(companyId, id, reader);
          if (r.shipmentDeleted) deleted.push(shipmentName(byShipment.get(id)!));
          changed += r.changed.length;
        } catch (err) {
          log.warn(err, "warehouse: gate records not brought up to date with their shipment", { companyId, shipmentId: id });
          unread.push(shipmentName(byShipment.get(id)!));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, worker));
    const unmatched = [
      ...(deleted.length ? [reportLine("shipment deleted", deleted.sort())] : []),
      ...(unread.length ? [reportLine("shipment could not be read", unread.sort())] : []),
    ];
    log.info("warehouse: gate links normalized", { companyId, checked: links.length, changed, deleted: deleted.length, unread: unread.length });
    return { checked: links.length, changed, unmatched };
  }
}

export const gatePartiesService = new GatePartiesService();
