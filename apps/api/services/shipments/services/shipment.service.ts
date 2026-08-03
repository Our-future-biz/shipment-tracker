import { eq } from "drizzle-orm";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { containerRepository } from "../repositories/container.repository";
import { shipmentTable } from "../schemas/shipment.schema";
import type { PaginationRequest } from "../../../lib/db/interface";
import type { NewShipmentRecord } from "../schemas/shipment.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type { ContainerLine } from "../interfaces/interfaces";

// Project a container table row down to the API line shape (drops internal
// id/shipmentId/timestamps).
function toContainerLine(row: ContainerRecord): ContainerLine {
  return {
    containerNumber: row.containerNumber,
    sealNumber: row.sealNumber,
    type: row.type,
    teu: row.teu,
    packages: row.packages,
    packageType: row.packageType,
    grossWeight: row.grossWeight,
    volume: row.volume,
  };
}

// Container and seal numbers live per-container; the shipment-level values are
// read-only aggregates of every container's value.
function aggregate(containers: ContainerLine[], field: "containerNumber" | "sealNumber"): string {
  return containers
    .map((c) => c[field])
    .filter((v) => v && v.trim().length > 0)
    .join(", ");
}

class ShipmentService {
  async list(request: PaginationRequest, filters?: { customerId?: string }) {
    const whereClauses = filters?.customerId
      ? [eq(shipmentTable.customerId, filters.customerId)]
      : [];
    const result = await shipmentRepository.getPaginated({
      request,
      whereClauses,
      defaultOrderBy: shipmentRepository["table"].createdAt,
      defaultMaxLimit: 200,
      defaultLimit: 100,
    });

    // Enrich with master job MCZ numbers
    const masterJobIds = result.data
      .map((s) => s.masterJobId)
      .filter((id): id is string => !!id);

    const mczMap = new Map<string, string>();
    if (masterJobIds.length > 0) {
      const uniqueIds = [...new Set(masterJobIds)];
      const masterJobs = await Promise.all(
        uniqueIds.map((id) => masterJobRepository.getById(id))
      );
      for (const mj of masterJobs) {
        if (mj) mczMap.set(mj.id, mj.mczNumber);
      }
    }

    // Enrich with containers (one query for the whole page, grouped by shipment)
    const containerRows = await containerRepository.listByShipmentIds(result.data.map((s) => s.id));
    const containersByShipment = new Map<string, ContainerLine[]>();
    for (const row of containerRows) {
      const list = containersByShipment.get(row.shipmentId) ?? [];
      list.push(toContainerLine(row));
      containersByShipment.set(row.shipmentId, list);
    }

    const enriched = result.data.map((s) => {
      const containers = containersByShipment.get(s.id) ?? [];
      return {
        ...s,
        masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId) || null : null,
        containers,
        containerNumber: aggregate(containers, "containerNumber"),
        sealNumber: aggregate(containers, "sealNumber"),
      };
    });

    return { ...result, data: enriched };
  }

  async getById(id: string) {
    const shipment = await shipmentRepository.getById(id);
    if (!shipment) return null;
    let masterJobMczNumber: string | null = null;
    if (shipment.masterJobId) {
      const mj = await masterJobRepository.getById(shipment.masterJobId);
      if (mj) masterJobMczNumber = mj.mczNumber;
    }
    const containers = (await containerRepository.listByShipmentId(id)).map(toContainerLine);
    return {
      ...shipment,
      masterJobMczNumber,
      containers,
      containerNumber: aggregate(containers, "containerNumber"),
      sealNumber: aggregate(containers, "sealNumber"),
    };
  }

  async create(data: NewShipmentRecord & { containers?: ContainerLine[] }) {
    const { containers, ...shipmentData } = data;
    const shipment = await shipmentRepository.create(shipmentData);
    if (containers && containers.length > 0) {
      await containerRepository.replaceForShipment(shipment.id, containers);
    }
    return this.getById(shipment.id);
  }

  // Next CZ job number, computed over ALL shipments (incl. archived) so it never repeats.
  async nextJobNumber(): Promise<string> {
    const max = await shipmentRepository.maxCzJobNumber();
    return `CZ${String(max + 1).padStart(8, "0")}`;
  }

  async update(id: string, data: Partial<NewShipmentRecord> & { containers?: ContainerLine[] }, userId: string) {
    const existing = await shipmentRepository.getById(id);
    if (!existing) return null;

    const { containers, ...shipmentData } = data;

    // Write audit entries for changed shipment fields
    const existingRecord = existing as unknown as Record<string, unknown>;
    for (const [key, newValue] of Object.entries(shipmentData)) {
      const oldValue = existingRecord[key];
      if (oldValue !== newValue) {
        await shipmentAuditRepository.create({
          shipmentId: id,
          userId,
          field: key,
          oldValue: oldValue != null ? String(oldValue) : null,
          newValue: newValue != null ? String(newValue) : null,
        });
      }
    }

    if (containers !== undefined) {
      await containerRepository.replaceForShipment(id, containers);
    }

    if (Object.keys(shipmentData).length > 0) {
      await shipmentRepository.update(id, shipmentData);
    }

    return this.getById(id);
  }

  async getAll(limit = 5000) {
    return shipmentRepository.getAll(limit);
  }

  // Soft-delete: the row and all its details are kept (only deletedAt is set) so the
  // job reference can never be reused. Recorded in the audit log as a change.
  async softDelete(id: string, userId?: string) {
    const existing = await shipmentRepository.getById(id);
    if (!existing) return null;

    if (userId) {
      await shipmentAuditRepository.create({
        shipmentId: id,
        userId,
        field: "deletedAt",
        oldValue: null,
        newValue: new Date().toISOString(),
      });
    }

    return shipmentRepository.softDelete(id);
  }

  async linkMasterJob(shipmentId: string, mczNumber: string) {
    let masterJob = await masterJobRepository.findByMczNumber(mczNumber);
    if (!masterJob) {
      masterJob = await masterJobRepository.create({ mczNumber });
    }
    return shipmentRepository.update(shipmentId, { masterJobId: masterJob.id });
  }

  async unlinkMasterJob(shipmentId: string) {
    return shipmentRepository.update(shipmentId, { masterJobId: null });
  }
}

export const shipmentService = new ShipmentService();
