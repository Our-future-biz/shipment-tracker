import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import type { PaginationRequest } from "../../../lib/db/interface";

class ShipmentService {
  async list(request: PaginationRequest) {
    return shipmentRepository.getPaginated({
      request,
      defaultOrderBy: shipmentRepository["table"].createdAt,
      defaultMaxLimit: 200,
      defaultLimit: 100,
    });
  }

  async getById(id: string) {
    return shipmentRepository.getById(id);
  }

  async create(data: Record<string, unknown>) {
    return shipmentRepository.create(data as never);
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = await shipmentRepository.getById(id);
    if (!existing) return null;

    // Write audit entries for changed fields
    for (const [key, newValue] of Object.entries(data)) {
      const oldValue = (existing as Record<string, unknown>)[key];
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

    return shipmentRepository.update(id, data as never);
  }

  async softDelete(id: string) {
    return shipmentRepository.softDelete(id);
  }

  async linkMasterJob(shipmentId: string, mczNumber: string) {
    let masterJob = await masterJobRepository.findByMczNumber(mczNumber);
    if (!masterJob) {
      masterJob = await masterJobRepository.create({ mczNumber } as never);
    }
    return shipmentRepository.update(shipmentId, { masterJobId: masterJob.id } as never);
  }

  async unlinkMasterJob(shipmentId: string) {
    return shipmentRepository.update(shipmentId, { masterJobId: null } as never);
  }
}

export const shipmentService = new ShipmentService();
