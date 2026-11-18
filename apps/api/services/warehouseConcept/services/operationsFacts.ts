import { rankRow, type CockpitSignal, type CockpitTag } from "../../../lib/cockpit";
import { isUuid } from "../../../lib/uuid";
import type { GateMovementItem } from "../interfaces/gate.interfaces";
import type { WarehouseOperationsFacts, WarehouseOperationsRecord, WarehouseOperationsSignal } from "../interfaces/interfaces";
import type { WarehouseContainerItem } from "../interfaces/records.interfaces";
import { containerRow, containerSignals, positionRow, recordSignals } from "./managersCockpit";
import { pragueDate } from "./storage";

// The operations facts (Shipments → Managers asks the Warehouse by shipment, Council Outlay 11, D29
// and D30): each shipment's warehouse records still in play, with the Warehouse cockpit's OWN
// signals for them — recordSignals and containerSignals of managersCockpit.ts, fed the same facts
// (managersCockpitService.recordFacts / containerFacts) with the same `now` and Prague day — and
// the shipment's updates waiting too long or failed. Pure: no database, tested in
// tests/operationsFacts.test.ts.

/** Shipment ids answered at most per call. */
export const OPERATIONS_FACTS_MAX_SHIPMENTS = 2000;

// What `notKnown` says when a part could not be read.
export const NOT_KNOWN_RECORDS = "the warehouse's records";
export const NOT_KNOWN_CONTAINERS = "the containers in the warehouse";
export const NOT_KNOWN_UPDATES = "the warehouse's updates to the shipments";

/** The ids asked for that can be answered: uuids, each once, in the order asked. */
export function operationsShipmentIds(ids: readonly string[]): string[] {
  return [...new Set(ids.map((id) => id.trim()).filter(isUuid))];
}

export interface OperationsFactsInput {
  shipmentIds: string[];
  /** The gate records of those shipments (managersCockpitService.recordFacts); null when they could not be read. */
  records: {
    /** Every live record read, with its shipment: what links a container to a shipment. */
    rows: { id: string; shipmentId: string | null }[];
    /** The records still in play (those the Warehouse cockpit judges). */
    items: GateMovementItem[];
    truckingNotSent: Map<string, string[]>;
    leftWithoutDocument: Map<string, string>;
  } | null;
  /** The containers not gone out linked to those records (containerFacts); null when they could not be read. */
  containers: { items: WarehouseContainerItem[]; movementIds: Map<string, string[]> } | null;
  /** Shipment id → its updates failed / pending too long (shipmentOutboxRepository.unsentHealthByShipment); null when not read. */
  updates: Map<string, { failed: number; stalePending: number }> | null;
  notKnown: string[];
  now: Date;
}

// A record's signals as the Warehouse cockpit tags them: urgent first, then by rank (lib/cockpit).
const tags = (signals: CockpitSignal[]): WarehouseOperationsSignal[] =>
  (rankRow<{ tags: CockpitTag[] }>({}, signals)?.row.tags ?? []).map((t) => ({ text: t.text, urgent: t.urgent }));

const byRef = (a: WarehouseOperationsRecord, b: WarehouseOperationsRecord) => a.ref.localeCompare(b.ref);

export function buildOperationsFacts(input: OperationsFactsInput): WarehouseOperationsFacts {
  const { now } = input;
  const today = pragueDate(now);
  const asked = new Set(input.shipmentIds);

  // Positions: each record still in play, under the shipment its live task is linked to.
  const positions = new Map<string, WarehouseOperationsRecord[]>();
  for (const m of input.records?.items ?? []) {
    if (!m.shipmentId || !asked.has(m.shipmentId)) continue;
    const row = positionRow(m);
    const signals = recordSignals(m, today, now, {
      truckingNotSent: input.records!.truckingNotSent.get(m.id),
      leftWithoutDocument: input.records!.leftWithoutDocument.get(m.id),
    });
    positions.set(m.shipmentId, [...(positions.get(m.shipmentId) ?? []), { id: m.id, ref: row.ref, lifecycle: row.lifecycle, signals: tags(signals) }]);
  }

  // Containers: one the shipment's cargo is on (a house of it, or linked the legacy way), once per shipment.
  const containers = new Map<string, WarehouseOperationsRecord[]>();
  if (input.records && input.containers) {
    const shipmentOf = new Map(input.records.rows.map((m) => [m.id, m.shipmentId]));
    for (const c of input.containers.items) {
      const shipments = new Set((input.containers.movementIds.get(c.id) ?? []).map((id) => shipmentOf.get(id)).filter((s): s is string => !!s && asked.has(s)));
      if (!shipments.size) continue;
      const row = containerRow(c);
      const record: WarehouseOperationsRecord = { id: c.id, ref: row.ref, lifecycle: row.lifecycle, signals: tags(containerSignals(c, now, today)) };
      for (const s of shipments) containers.set(s, [...(containers.get(s) ?? []), record]);
    }
  }

  return {
    shipments: input.shipmentIds.map((shipmentId) => {
      const health = input.updates ? (input.updates.get(shipmentId) ?? { failed: 0, stalePending: 0 }) : null;
      return {
        shipmentId,
        records: [...(positions.get(shipmentId) ?? []).sort(byRef), ...(containers.get(shipmentId) ?? []).sort(byRef)],
        updatesWaiting: health ? health.stalePending : null,
        updatesFailed: health ? health.failed : null,
      };
    }),
    notKnown: input.notKnown,
  };
}
