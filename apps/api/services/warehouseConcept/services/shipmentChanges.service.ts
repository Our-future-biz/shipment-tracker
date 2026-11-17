import { and, eq, not, type SQL } from "drizzle-orm";
import log from "encore.dev/log";
import { db } from "../db/db";
import { gateMovementRepository, hasStamp, hasStampSql } from "../repositories/gateMovement.repository";
import { gateMovementTable, type NewGateMovementRecord } from "../schemas/gateMovement.schema";
import { gateDecisions, type ShipmentChanges } from "../../../lib/shipmentPush";
import { userName } from "./users";

const t = gateMovementTable;
const shown = (v: string) => v || "—";

// What a person changed on a shipment in Shipments, taken by the shipment's live gate records
// (lib/shipmentPush): its ETA, and the plate before the gate saw the vehicle. A record that holds
// its own value, or may not change any more, keeps it and says why; the write is guarded by the
// value it replaces, so the gate's own edit made meanwhile wins. Logged on the record as
// "Refresh from shipment" logs it. Idempotent: a change taken already is "same" the second time.
class ShipmentChangesService {
  async follow(companyId: string, userId: string, shipmentId: string, changes: ShipmentChanges): Promise<{ kept: string[] }> {
    const ids = await gateMovementRepository.liveIdsForShipment(db, shipmentId, companyId);
    const records = await gateMovementRepository.findByIds(ids, companyId);
    const kept: string[] = [];
    let by: string | null = null;
    for (const m of records) {
      const name = m.positionRef || m.gateRef;
      const d = gateDecisions({ eta: m.eta, plate: m.plate, stamped: hasStamp(m), fromTrip: (m.transportLegs ?? []).length > 0 }, changes);
      const set: Partial<NewGateMovementRecord> = {};
      const guards: SQL[] = [];
      const details: string[] = [];
      if (d.eta?.kind === "skip") kept.push(`${name} ETA: ${d.eta.reason}`);
      if (d.eta?.kind === "apply" && changes.estimatedArrival) {
        set.eta = d.eta.to;
        guards.push(eq(t.eta, changes.estimatedArrival.from));
        details.push(`ETA: ${shown(changes.estimatedArrival.from)} → ${shown(d.eta.to)}`);
      }
      if (d.plate?.kind === "skip") kept.push(`${name} plate: ${d.plate.reason}`);
      if (d.plate?.kind === "apply" && changes.plateNumber) {
        set.plate = d.plate.to;
        guards.push(eq(t.plate, changes.plateNumber.from), not(hasStampSql));
        details.push(`plate: ${shown(changes.plateNumber.from)} → ${shown(d.plate.to)}`);
      }
      if (!details.length) continue;
      by ??= await userName(userId);
      const event = { kind: "refreshedFromShipment", label: `From shipment: ${details.map((x) => x.split(":")[0]).join(", ")}`, at: new Date().toISOString(), by, detail: details.join("; ") };
      const row = await gateMovementRepository.conditionalUpdate(m.id, companyId, { ...set, updatedBy: by }, [event], and(...guards));
      if (!row) kept.push(`${name}: changed at the gate meanwhile`);
    }
    if (kept.length) log.info("warehouse: a shipment's change was not taken by its gate records", { shipmentId, kept });
    return { kept };
  }
}

export const shipmentChangesService = new ShipmentChangesService();
