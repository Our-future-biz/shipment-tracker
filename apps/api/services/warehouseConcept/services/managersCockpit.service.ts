import { gateMovementRepository, hasStamp } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { containerRepository } from "../repositories/warehouseRecords.repository";
import type { WarehouseManagersCockpit } from "../interfaces/cockpit.interfaces";
import type { StorageSummary } from "../interfaces/records.interfaces";
import { containerService } from "./container.service";
import { gateMovementService } from "./gateMovement.service";
import { buildCockpit } from "./managersCockpit";
import { movementStorage } from "./storage";

// The managers' cockpit (Warehouse Concept → Managers): reads what the rules in managersCockpit.ts
// need, one query after another so a page polled every minute holds few connections at once.
// Only the records that still matter get their related rows read: the open ones (not released,
// not left) and the ones still owing their shipment an update. Released records count only in the
// audit line and the storage summary, which read the record itself.

class ManagersCockpitService {
  async cockpit(companyId: string, now = new Date()): Promise<WarehouseManagersCockpit> {
    const rows = await gateMovementRepository.listAll(companyId);
    const unsent = new Set(await shipmentOutboxRepository.unsentMovementIds(companyId));
    const matter = rows.filter((m) => (!m.impRelease && !m.leftAt) || unsent.has(m.id));
    const items = await gateMovementService.itemsFor(matter, companyId);

    const containerRows = (await containerRepository.listForCompany(companyId, 5000)).filter((c) => !c.gateOutAt);
    const containers = await containerService.items(containerRows, companyId, now);

    const archived = await gateMovementRepository.listArchived(companyId);
    const shipmentUpdates = await shipmentOutboxRepository.health(companyId);

    // Cargo in the warehouse now, with the same clock and the same records as Reports.
    const running = rows.map((m) => movementStorage(m, now)).filter((s) => s.started && !s.stopped);
    const storage: StorageSummary = {
      inWarehouse: running.length,
      expiring: running.filter((s) => s.state === "Expiring").length,
      chargeable: running.filter((s) => s.state === "Chargeable").length,
      estimatedCzk: running.reduce((a, s) => a + s.estimatedCzk, 0),
    };

    return buildCockpit({
      items,
      containers,
      history: rows.map((m) => ({ events: m.events })),
      archived: archived.map((m) => ({ archivedAt: m.deletedAt ? m.deletedAt.toISOString() : null, stamped: hasStamp(m) })),
      shipmentUpdates,
      storage,
      now,
    });
  }
}

export const managersCockpitService = new ManagersCockpitService();
