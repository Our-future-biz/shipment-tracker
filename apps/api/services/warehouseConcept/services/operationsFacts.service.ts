import log from "encore.dev/log";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import type { WarehouseOperationsFacts } from "../interfaces/interfaces";
import { STALE_PENDING_MINUTES } from "./cockpitThresholds";
import { managersCockpitService } from "./managersCockpit.service";
import { buildOperationsFacts, NOT_KNOWN_CONTAINERS, NOT_KNOWN_RECORDS, NOT_KNOWN_UPDATES, operationsShipmentIds, type OperationsFactsInput } from "./operationsFacts";

// The operations facts Shipments → Managers asks for its jobs (Council Outlay 11, step 5): read
// with the Warehouse cockpit's own fact reads (managersCockpitService.recordFacts and
// containerFacts, narrowed to the shipments asked), judged by its own rules (operationsFacts.ts).
// READ ONLY: nothing is sent, marked or followed. Each part is read on its own: one that fails is
// named in `notKnown` and gives none of its figures.
//
// Statements per call, whatever the number of shipments: the records of the shipments (1); their
// unsent updates, failed Trucking events and open exceptions (3); the bonded register (2); the
// related rows of the records still in play (gateMovementService.itemsFor); the containers linked
// to the records (2 + 1) and their related rows (containerService.items, with one call to Shipments
// for the job's free time); the updates per shipment (1, at the same time as the records).

class OperationsFactsService {
  async forShipments(companyId: string, shipmentIds: string[], now = new Date()): Promise<WarehouseOperationsFacts> {
    const ids = operationsShipmentIds(shipmentIds);
    if (!ids.length) return { shipments: [], notKnown: [] };

    const [records, updates] = await Promise.all([this.records(companyId, ids, now), this.updates(companyId, ids)]);
    const containers = records ? await this.containers(companyId, records.rows.map((m) => m.id), now) : null;

    const notKnown = [
      ...(records ? [] : [NOT_KNOWN_RECORDS]),
      ...(records && !containers ? [NOT_KNOWN_CONTAINERS] : []),
      ...(updates ? [] : [NOT_KNOWN_UPDATES]),
    ];
    return buildOperationsFacts({ shipmentIds: ids, records, containers, updates, notKnown, now });
  }

  private async records(companyId: string, shipmentIds: string[], now: Date): Promise<OperationsFactsInput["records"]> {
    try {
      return await managersCockpitService.recordFacts(companyId, now, { shipmentIds });
    } catch (err) {
      log.warn(err, "warehouse: operations facts could not read the records", { shipments: shipmentIds.length });
      return null;
    }
  }

  private async containers(companyId: string, movementIds: string[], now: Date): Promise<OperationsFactsInput["containers"]> {
    if (!movementIds.length) return { items: [], movementIds: new Map() };
    try {
      return await managersCockpitService.containerFacts(companyId, now, movementIds);
    } catch (err) {
      log.warn(err, "warehouse: operations facts could not read the containers", { records: movementIds.length });
      return null;
    }
  }

  private async updates(companyId: string, shipmentIds: string[]): Promise<OperationsFactsInput["updates"]> {
    try {
      return await shipmentOutboxRepository.unsentHealthByShipment(STALE_PENDING_MINUTES, companyId, shipmentIds);
    } catch (err) {
      log.warn(err, "warehouse: operations facts could not read the updates to the shipments", { shipments: shipmentIds.length });
      return null;
    }
  }
}

export const operationsFactsService = new OperationsFactsService();
