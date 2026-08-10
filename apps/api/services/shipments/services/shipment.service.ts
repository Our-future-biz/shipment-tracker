import { customers } from "~encore/clients";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { containerRepository, normalizeContainerNumber } from "../repositories/container.repository";
import type { ShipmentListFilters } from "../repositories/shipment.repository";
import type { NewShipmentRecord } from "../schemas/shipment.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type { ContainerLine } from "../interfaces/interfaces";

// Project a container table row down to the API line shape (drops internal
// id/shipmentId/timestamps).
function toContainerLine(row: ContainerRecord): ContainerLine {
  return {
    containerNumber: normalizeContainerNumber(row.containerNumber),
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

const money = (v: string | null | undefined): number => {
  const n = parseFloat(v ?? "");
  return Number.isNaN(n) ? 0 : n;
};

class ShipmentService {
  // The customer's stored rollups (totalRevenue/totalProfit/totalShipments/
  // lastActivityDate) live in the customers service, which cannot query this
  // database — so every shipment mutation that touches a linked customer
  // recomputes them here and pushes them over. Failures are swallowed: a stale
  // rollup must not fail the shipment write itself.
  private async recalcCustomerRollups(customerId: string | null | undefined, companyId: string) {
    if (!customerId) return;
    try {
      const rows = await shipmentRepository.findByCustomerId(customerId, companyId);
      const totalRevenue = rows.reduce((sum, r) => sum + money(r.selling), 0);
      const totalProfit = rows.reduce((sum, r) => sum + (money(r.selling) - money(r.buying)), 0);
      const lastActivityDate =
        rows
          .map((r) => r.estimatedArrival || r.createdAt.toISOString().slice(0, 10))
          .filter(Boolean)
          .sort()
          .pop() ?? "";
      await customers.customerUpdate({
        id: customerId,
        totalRevenue,
        totalProfit,
        totalShipments: rows.length,
        lastActivityDate,
      });
    } catch {
      // Customer may have been deleted since; nothing to sync.
    }
  }

  async list(companyId: string, filters: ShipmentListFilters) {
    const result = await shipmentRepository.listFiltered(companyId, filters);

    // Enrich with master job MCZ numbers
    const masterJobIds = result.data
      .map((s) => s.masterJobId)
      .filter((id): id is string => !!id);

    const mczMap = new Map<string, string>();
    if (masterJobIds.length > 0) {
      const uniqueIds = [...new Set(masterJobIds)];
      const masterJobs = await Promise.all(
        uniqueIds.map((id) => masterJobRepository.getByIdForCompany(id, companyId))
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

    return {
      pagination: { total: result.total, offset: filters.offset, limit: filters.limit },
      data: enriched,
    };
  }

  async getById(id: string, companyId: string) {
    const shipment = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!shipment) return null;
    let masterJobMczNumber: string | null = null;
    if (shipment.masterJobId) {
      const mj = await masterJobRepository.getByIdForCompany(shipment.masterJobId, companyId);
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

  async create(companyId: string, data: Omit<NewShipmentRecord, "companyId"> & { containers?: ContainerLine[] }) {
    const { containers, ...shipmentData } = data;
    const shipment = await shipmentRepository.createForCompany(companyId, shipmentData as never);
    if (containers && containers.length > 0) {
      await containerRepository.replaceForShipment(shipment.id, companyId, containers);
    }
    await this.recalcCustomerRollups(shipment.customerId, companyId);
    return this.getById(shipment.id, companyId);
  }

  // Next CZ job number for this company (a per-company sequence over all rows incl.
  // archived, so a reference is never reused within the company).
  async nextJobNumber(companyId: string): Promise<string> {
    const max = await shipmentRepository.maxCzJobNumber(companyId);
    return `CZ${String(max + 1).padStart(8, "0")}`;
  }

  async update(id: string, companyId: string, data: Partial<NewShipmentRecord> & { containers?: ContainerLine[] }, userId: string) {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) return null;

    const { containers, ...shipmentData } = data;

    // Write audit entries for changed shipment fields
    const existingRecord = existing as unknown as Record<string, unknown>;
    for (const [key, newValue] of Object.entries(shipmentData)) {
      const oldValue = existingRecord[key];
      if (oldValue !== newValue) {
        await shipmentAuditRepository.create({
          companyId,
          shipmentId: id,
          userId,
          field: key,
          oldValue: oldValue != null ? String(oldValue) : null,
          newValue: newValue != null ? String(newValue) : null,
        });
      }
    }

    if (containers !== undefined) {
      await containerRepository.replaceForShipment(id, companyId, containers);
    }

    if (Object.keys(shipmentData).length > 0) {
      await shipmentRepository.updateForCompany(id, companyId, shipmentData as never);
    }

    // Recalc for the new customer, and for the old one when the link moved.
    const newCustomerId = "customerId" in shipmentData ? shipmentData.customerId : existing.customerId;
    await this.recalcCustomerRollups(newCustomerId, companyId);
    if (existing.customerId && existing.customerId !== newCustomerId) {
      await this.recalcCustomerRollups(existing.customerId, companyId);
    }

    return this.getById(id, companyId);
  }

  async getAllForCompany(companyId: string, limit = 5000) {
    return shipmentRepository.listAllForCompany(companyId, limit);
  }

  // Soft-delete: the row and all its details are kept (only deletedAt is set) so the
  // job reference can never be reused. Recorded in the audit log as a change.
  async softDelete(id: string, companyId: string, userId?: string) {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) return null;

    if (userId) {
      await shipmentAuditRepository.create({
        companyId,
        shipmentId: id,
        userId,
        field: "deletedAt",
        oldValue: null,
        newValue: new Date().toISOString(),
      });
    }

    const deleted = await shipmentRepository.softDeleteForCompany(id, companyId);
    await this.recalcCustomerRollups(existing.customerId, companyId);
    return deleted;
  }

  async linkMasterJob(shipmentId: string, companyId: string, mczNumber: string) {
    let masterJob = await masterJobRepository.findByMczNumber(mczNumber, companyId);
    if (!masterJob) {
      masterJob = await masterJobRepository.createForCompany(companyId, { mczNumber } as never);
    }
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: masterJob.id } as never);
  }

  async unlinkMasterJob(shipmentId: string, companyId: string) {
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: null } as never);
  }
}

export const shipmentService = new ShipmentService();
