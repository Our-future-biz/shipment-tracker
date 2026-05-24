import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import type { PaginationRequest } from "../../../lib/db/interface";

class ShipmentService {
  async list(request: PaginationRequest) {
    const result = await shipmentRepository.getPaginated({
      request,
      defaultOrderBy: shipmentRepository["table"].createdAt,
      defaultMaxLimit: 200,
      defaultLimit: 100,
    });

    // Enrich with master job MCZ numbers
    const masterJobIds = result.data
      .map((s: Record<string, unknown>) => s.masterJobId as string | null)
      .filter((id): id is string => !!id);

    if (masterJobIds.length > 0) {
      const uniqueIds = [...new Set(masterJobIds)];
      const masterJobs = await Promise.all(
        uniqueIds.map((id) => masterJobRepository.getById(id))
      );
      const mczMap = new Map<string, string>();
      for (const mj of masterJobs) {
        if (mj) mczMap.set(mj.id, mj.mczNumber);
      }
      result.data = result.data.map((s: Record<string, unknown>) => ({
        ...s,
        masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId as string) || null : null,
      }));
    } else {
      result.data = result.data.map((s: Record<string, unknown>) => ({
        ...s,
        masterJobMczNumber: null,
      }));
    }

    return result;
  }

  async getById(id: string) {
    const shipment = await shipmentRepository.getById(id);
    if (!shipment) return null;
    // Enrich with MCZ number
    let masterJobMczNumber: string | null = null;
    if (shipment.masterJobId) {
      const mj = await masterJobRepository.getById(shipment.masterJobId);
      if (mj) masterJobMczNumber = mj.mczNumber;
    }
    return { ...shipment, masterJobMczNumber };
  }

  async create(data: Record<string, unknown>) {
    return shipmentRepository.create(data as never);
  }

  async update(id: string, data: Record<string, unknown>, userId: string) {
    const existing = await shipmentRepository.getById(id);
    if (!existing) return null;

    // Merge extra fields with existing extra data
    if (data.extra && typeof data.extra === "object") {
      const existingExtra = (existing as Record<string, unknown>).extra as Record<string, string> | null;
      data.extra = { ...(existingExtra || {}), ...(data.extra as Record<string, string>) };
    }

    // Write audit entries for changed fields
    for (const [key, newValue] of Object.entries(data)) {
      if (key === "extra") continue; // audit individual extra fields below
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

    // Audit extra field changes individually
    if (data.extra && typeof data.extra === "object") {
      const existingExtra = (existing as Record<string, unknown>).extra as Record<string, string> | null;
      for (const [key, newValue] of Object.entries(data.extra as Record<string, string>)) {
        const oldValue = existingExtra?.[key];
        if (oldValue !== newValue) {
          await shipmentAuditRepository.create({
            shipmentId: id,
            userId,
            field: `extra.${key}`,
            oldValue: oldValue ?? null,
            newValue: newValue ?? null,
          });
        }
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
