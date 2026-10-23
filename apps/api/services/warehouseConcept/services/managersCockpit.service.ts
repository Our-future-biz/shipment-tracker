import { gateMovementRepository, hasStamp, type GateMovementRow } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { gateEventOutboxRepository } from "../repositories/gateEventOutbox.repository";
import { gateExceptionRepository } from "../repositories/gateException.repository";
import { settingsRepository } from "../repositories/settings.repository";
import { containerRepository } from "../repositories/warehouseRecords.repository";
import type { CockpitDelivery, WarehouseManagersCockpit } from "../interfaces/cockpit.interfaces";
import type { StorageSummary } from "../interfaces/records.interfaces";
import { containerService } from "./container.service";
import { gateMovementService } from "./gateMovement.service";
import { buildCockpit } from "./managersCockpit";
import { movementStorage } from "./storage";
import { GATE_EVENT_WHAT } from "./gateEvents.service";
import { SENDING_STALE_MS } from "./emailSupplier.service";
import { BONDED_DOCUMENT_DAYS, FLOOR_WRITE_LOST_DAYS, RELEASED_CHARGEABLE_DAYS, STALE_PENDING_MINUTES, SUPPLIER_EMAIL_DAYS } from "./cockpitThresholds";
import { correctionNeeded, FLOOR_WRITE_LOST_EVENT } from "./correction";
import { warehouseStockService } from "./warehouseStock.service";
import { isBareDischargeHow, leftPhysically } from "./warehouseStockPlan";

const DAY = 86_400_000;

// The managers' cockpit (Warehouse Concept → Managers): reads what the rules in managersCockpit.ts
// need, one query after another so a page polled every minute holds few connections at once.
// Only the records that still matter get their related rows read: the open ones (not released,
// not left), those owing their shipment an update or Trucking an event, those with an exception
// still open, a deleted shipment or a recent correction to make, and those released in the last
// days (storage left unsettled). The others count only in the audit line and the storage summary,
// which read the record itself.

// The time is within the last `days` days.
const within = (at: Date | string | null | undefined, days: number, now: Date) => {
  const t = at ? new Date(at).getTime() : NaN;
  return !Number.isNaN(t) && t >= now.getTime() - days * DAY;
};

class ManagersCockpitService {
  async cockpit(companyId: string, now = new Date()): Promise<WarehouseManagersCockpit> {
    const rows = await gateMovementRepository.listAll(companyId);
    const unsent = new Set(await shipmentOutboxRepository.unsentMovementIds(companyId));
    const truckingFailed = await gateEventOutboxRepository.failedWhere(companyId);
    const truckingNotSent = new Map<string, string[]>();
    for (const r of truckingFailed) truckingNotSent.set(r.movementId, [...(truckingNotSent.get(r.movementId) ?? []), GATE_EVENT_WHAT[r.event.kind] ?? r.event.kind]);
    const held = new Set(await gateExceptionRepository.openMovementIds(companyId));
    const leftWithoutDocument = await this.leftWithoutDocument(companyId, now);
    const matters = (m: GateMovementRow) =>
      (!m.impRelease && !m.leftAt) ||
      unsent.has(m.id) ||
      truckingNotSent.has(m.id) ||
      held.has(m.id) ||
      leftWithoutDocument.has(m.id) ||
      within(m.impRelease ?? m.leftAt, RELEASED_CHARGEABLE_DAYS, now) ||
      !!correctionNeeded(m.events) ||
      m.events.some((e) => e.kind === "shipmentDeleted" || (e.kind === FLOOR_WRITE_LOST_EVENT && within(e.at, FLOOR_WRITE_LOST_DAYS, now)));
    const matter = rows.filter(matters);
    const items = await gateMovementService.itemsFor(matter, companyId);

    const containerRows = (await containerRepository.listForCompany(companyId, 5000)).filter((c) => !c.gateOutAt);
    const containers = await containerService.items(containerRows, companyId, now);

    const archived = await gateMovementRepository.listArchived(companyId);
    const shipmentUpdates = await shipmentOutboxRepository.health(companyId);
    const delivery = await this.delivery(companyId, now);

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
      truckingNotSent,
      leftWithoutDocument,
      delivery,
      now,
    });
  }

  // Bonded entries whose goods left (WH release, or stuffed in a container that went out) under
  // temporary storage or T1 transit, discharged lately, with no MRN and no customs document: the
  // gate record id → the regime.
  private async leftWithoutDocument(companyId: string, now: Date): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    for (const e of await warehouseStockService.listBonded(companyId)) {
      if (e.status !== "Discharged" || !e.movementId || !within(e.dischargedAt, BONDED_DOCUMENT_DAYS, now)) continue;
      if (e.regime !== "Temporary storage" && e.regime !== "Transit T1") continue;
      if (e.mrn.trim() || (e.dischargeRef.trim() && !isBareDischargeHow(e.dischargeRef)) || !leftPhysically(e.discharge)) continue;
      out.set(e.movementId, e.regime);
    }
    return out;
  }

  // What the warehouse owes other systems and suppliers: updates and events waiting too long,
  // events for Trucking that failed for good, supplier e-mails that failed or never finished.
  private async delivery(companyId: string, now: Date): Promise<CockpitDelivery> {
    const shipments = await shipmentOutboxRepository.unsentHealth(STALE_PENDING_MINUTES, companyId);
    const trucking = await gateEventOutboxRepository.unsentHealth(STALE_PENDING_MINUTES, companyId);
    const attempts = await settingsRepository.latestAttemptsSince(companyId, new Date(now.getTime() - SUPPLIER_EMAIL_DAYS * DAY));
    const failedEmails = attempts.filter((a) => a.status === "failed" || (a.status === "sending" && now.getTime() - a.createdAt.getTime() > SENDING_STALE_MS));
    return {
      shipmentUpdatesWaiting: shipments.stalePending,
      truckingFailed: trucking.failed,
      truckingWaiting: trucking.stalePending,
      staleMinutes: STALE_PENDING_MINUTES,
      supplierEmailsFailed: new Set(failedEmails.map((a) => a.taskId)).size,
      supplierEmailDays: SUPPLIER_EMAIL_DAYS,
    };
  }
}

export const managersCockpitService = new ManagersCockpitService();
