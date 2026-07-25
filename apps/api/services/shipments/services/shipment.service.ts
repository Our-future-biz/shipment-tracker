import { eq } from "drizzle-orm";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentTable } from "../schemas/shipment.schema";
import type { PaginationRequest } from "../../../lib/db/interface";
import type { NewShipmentRecord, ShipmentRecord } from "../schemas/shipment.schema";

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

    const enriched = result.data.map((s) => ({
      ...s,
      masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId) || null : null,
    }));

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
    return { ...shipment, masterJobMczNumber };
  }

  async create(data: NewShipmentRecord) {
    return shipmentRepository.create(data);
  }

  async update(id: string, data: Partial<NewShipmentRecord>, userId: string) {
    const existing = await shipmentRepository.getById(id);
    if (!existing) return null;

    // Write audit entries for changed fields
    const existingRecord = existing as unknown as Record<string, unknown>;
    for (const [key, newValue] of Object.entries(data)) {
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

    return shipmentRepository.update(id, data);
  }

  async getAll(limit = 5000) {
    return shipmentRepository.getAll(limit);
  }

  async softDelete(id: string) {
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
