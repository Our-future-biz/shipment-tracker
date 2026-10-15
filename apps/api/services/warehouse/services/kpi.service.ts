import { APIError } from "encore.dev/api";
import { gateMovementRepository } from "../repositories/gateMovement.repository";
import { shipmentOutboxRepository } from "../repositories/shipmentOutbox.repository";
import { kpiRepository } from "../repositories/kpi.repository";
import { pragueInstant } from "./dockSlots";
import { addDays } from "./storage";
import log from "encore.dev/log";
import { buildKpiReport, DEFAULT_DOCK_SETTINGS, resolvePeriod } from "./kpiCalc";
import { settingsService } from "./settings.service";
import type { KpiDockSettings, WarehouseKpiReport } from "../interfaces/kpi.interfaces";

// Reports tab: loads the company's gate records, houses, dock slots, re-weighs, exceptions and the
// shipment-update health, and works out the KPIs for the period (kpiCalc.ts). Read only.

/** Slots this many days either side of the period are read too (a late arrival against an earlier slot). */
const SLOT_MARGIN_DAYS = 60;

class KpiService {
  /** Docks and opening hours for dock utilisation (Warehouse settings when they exist; else the defaults). */
  async docksFor(companyId: string): Promise<KpiDockSettings> {
    try {
      return (await settingsService.effective(companyId)).docks;
    } catch (err) {
      // Settings not readable (e.g. migration not applied yet): the defaults, logged.
      log.warn("dock settings could not be read — using the defaults", { companyId, err: String(err) });
      return DEFAULT_DOCK_SETTINGS;
    }
  }

  async report(companyId: string, q: { from?: string; to?: string }, now = new Date()): Promise<WarehouseKpiReport> {
    const period = resolvePeriod(q.from, q.to, now);
    if ("error" in period) throw APIError.invalidArgument(period.error);
    const slotFrom = pragueInstant(addDays(period.from, -SLOT_MARGIN_DAYS), "00:00");
    const slotTo = pragueInstant(addDays(period.to, SLOT_MARGIN_DAYS + 1), "00:00");
    const exceptionsFrom = pragueInstant(addDays(period.from, -1), "00:00");
    const [movements, containers, houses, slots, reweighs, exceptions, shipmentUpdates, docks] = await Promise.all([
      gateMovementRepository.listAll(companyId),
      kpiRepository.containers(companyId),
      kpiRepository.houses(companyId),
      kpiRepository.slotsBetween(companyId, slotFrom, slotTo),
      kpiRepository.reweighs(companyId),
      kpiRepository.exceptionsSince(companyId, exceptionsFrom),
      shipmentOutboxRepository.health(companyId),
      this.docksFor(companyId),
    ]);
    return buildKpiReport({ movements, containers, houses, slots, reweighs, exceptions, shipmentUpdates, docks }, period, now);
  }
}

export const kpiService = new KpiService();
