import { warehouseTaskRepository } from "../repositories/warehouseTask.repository";
import { warehouseSectionRepository } from "../repositories/warehouseSection.repository";

class WarehouseService {
  async listAll(companyId: string) {
    return warehouseTaskRepository.listAll(companyId);
  }

  async listByShipmentId(shipmentId: string, companyId: string) {
    return warehouseTaskRepository.listByShipmentId(shipmentId, companyId);
  }

  async addShipment(companyId: string, shipmentId: string, now = new Date()) {
    return warehouseTaskRepository.createForShipment(companyId, shipmentId, warehouseRefPrefix(now));
  }

  // A position created in the warehouse itself: its own WCZ reference, no shipment job.
  async createPosition(companyId: string, now = new Date()) {
    return (await warehouseTaskRepository.createForShipment(companyId, null, warehouseRefPrefix(now))).task;
  }

  async update(id: string, companyId: string, data: Record<string, unknown>) {
    return warehouseTaskRepository.update(id, companyId, data);
  }

  async softDelete(id: string, companyId: string) {
    return warehouseTaskRepository.softDelete(id, companyId);
  }

  // Warehouse sections
  async getSection(shipmentId: string, section: string, companyId: string) {
    return warehouseSectionRepository.findByShipmentAndSection(shipmentId, section, companyId);
  }

  async upsertSection(shipmentId: string, section: string, companyId: string, data: unknown) {
    return warehouseSectionRepository.upsert(shipmentId, section, companyId, data);
  }
}

export const warehouseService = new WarehouseService();

// Warehouse references are WCZ + the Prague calendar date (YYYYMMDD) + a daily sequence.
export function warehouseRefPrefix(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Prague", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `WCZ${get("year")}${get("month")}${get("day")}`;
}
