import { auth, customers, quotes } from "~encore/clients";
import { shipmentRepository } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { containerRepository, normalizeContainerNumber } from "../repositories/container.repository";
import { cargoItemRepository } from "../repositories/cargoItem.repository";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { projectCargo } from "./cargoProjection";
import { actionStamp, exportBolDefaults, isCreditApproval, startingStateDefaults } from "./fieldDefaults";
import type { ShipmentListFilters } from "../repositories/shipment.repository";
import type { NewShipmentRecord, ShipmentRecord } from "../schemas/shipment.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type { CargoItemRecord } from "../schemas/cargoItem.schema";
import type { CargoDimensionRecord } from "../schemas/cargoDimension.schema";
import type { ContainerLine, CargoItemLine, CargoDimensionLine } from "../interfaces/interfaces";

// Extra detail rows accepted alongside the shipment's own fields on create/update.
interface DetailRows {
  containers?: ContainerLine[];
  cargoItems?: CargoItemLine[];
  cargoDimensions?: CargoDimensionLine[];
}

// Project table rows down to the API line shapes (drop internal
// shipmentId/companyId/timestamps; containers keep their id — cargo lines
// reference it and clients echo it back on updates).
function toContainerLine(row: ContainerRecord): ContainerLine {
  return {
    id: row.id,
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

function toCargoItemLine(row: CargoItemRecord): CargoItemLine {
  return {
    containerId: row.containerId,
    cargoDescription: row.cargoDescription,
    hsCode: row.hsCode,
    pieces: row.pieces,
    packageType: row.packageType,
    grossWeight: row.grossWeight,
    commercialInvoiceValue: row.commercialInvoiceValue,
    currency: row.currency,
  };
}

function toCargoDimensionLine(row: CargoDimensionRecord): CargoDimensionLine {
  return {
    containerId: row.containerId,
    pieces: row.pieces,
    lengthCm: row.lengthCm,
    widthCm: row.widthCm,
    heightCm: row.heightCm,
    weightPerPcKg: row.weightPerPcKg,
    packageType: row.packageType,
    stackable: row.stackable,
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

// Attach detail rows and the read-only projections to a shipment row. Computed
// values win over the stored legacy fields; the stored value only shows for
// shipments that predate the detail tables and have no rows to compute from.
function enrich(shipment: ShipmentRecord, containers: ContainerLine[], cargoItems: CargoItemLine[], cargoDimensions: CargoDimensionLine[]) {
  const hasDetailRows = containers.length > 0 || cargoItems.length > 0 || cargoDimensions.length > 0;
  const p = projectCargo(containers, cargoItems, cargoDimensions);
  return {
    ...shipment,
    containers,
    cargoItems,
    cargoDimensions,
    containerNumber: aggregate(containers, "containerNumber"),
    sealNumber: aggregate(containers, "sealNumber"),
    pcs: hasDetailRows ? p.pcs : shipment.pcs,
    typeOfPackages: hasDetailRows ? p.typeOfPackages : shipment.typeOfPackages,
    hsCode: hasDetailRows ? p.hsCode : shipment.hsCode,
    cargoDescription: hasDetailRows ? p.cargoDescription : shipment.cargoDescription,
    civByCurrency: p.civByCurrency,
    containerTypeSummary: p.containerTypeSummary,
    totalTeu: p.totalTeu,
    totalGrossWeightKg: p.totalGrossWeightKg,
    totalVolumeM3: p.totalVolumeM3,
  };
}

// Cargo lines may only point at containers of their own shipment; anything else
// (stale id after a container was deleted, foreign id) becomes a shipment-level
// line rather than an error.
function sanitizeContainerLinks<T extends { containerId?: string | null }>(lines: T[], validIds: Set<string>): T[] {
  return lines.map((l) => ({
    ...l,
    containerId: l.containerId && validIds.has(l.containerId) ? l.containerId : null,
  }));
}

// Real `date` columns reject "" — the UI sends an empty string when a date cell is
// cleared, so coerce blanks to null. Same for the numeric money columns.
const DATE_FIELDS = new Set([
  "estimatedDeparture",
  "estimatedArrival",
  "actualDeparture",
  "actualArrival",
  "cargoReadinessDate",
  "pickupDate",
  "closingDate",
  "etaWarehouse",
  "plannedDeliveryDate",
  "shipmentsDate",
  "equipmentDeliveryDate",
]);
const MONEY_FIELDS = new Set(["selling", "buying"]);

function sanitizeTypedFields<T extends Record<string, unknown>>(data: T): T {
  const out = { ...data } as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    if (out[key] !== "") continue;
    if (DATE_FIELDS.has(key)) out[key] = null;
    else if (MONEY_FIELDS.has(key)) out[key] = "0";
  }
  return out as T;
}

class ShipmentService {
  // The customer's stored rollups (totalRevenue/totalProfit/totalShipments/
  // lastActivityDate) live in the customers service, which cannot query this
  // database — so every shipment mutation that touches a linked customer
  // recomputes them here and pushes them over. Failures are swallowed: a stale
  // rollup must not fail the shipment write itself.
  private async recalcCustomerRollups(customerId: string | null | undefined, companyId: string) {
    if (!customerId) return;
    try {
      const rollups = await shipmentRepository.customerRollups(customerId, companyId);
      await customers.customerUpdate({ id: customerId, ...rollups });
    } catch {
      // Customer may have been deleted since; nothing to sync.
    }
  }

  // Display name of the acting user, for stamps written into shipment fields.
  // Users live in the auth service, which this database cannot join against.
  // An unresolvable user must not fail the write — the stamp just loses the name.
  private async resolveUserName(userId: string): Promise<string> {
    try {
      const { users } = await auth.usersList();
      const me = users.find((u) => u.id === userId);
      return me?.displayName || me?.email || "";
    } catch {
      return "";
    }
  }

  // The sales person of the quote a shipment was sold from. Quotes live in
  // another service and their fields sit in a jsonb blob, so this reads the
  // owner off that blob. Empty when the reference isn't a known quote.
  private async quoteSalesOwner(quoteNumber: string): Promise<string> {
    try {
      const { quote } = await quotes.quoteGet({ quoteNumber });
      const data = (quote.data ?? {}) as { salesOwner?: string; createdBy?: string };
      return (data.salesOwner || data.createdBy || "").trim();
    } catch {
      // Free-text sales numbers are allowed; an unknown reference just means
      // there is no owner to inherit.
      return "";
    }
  }

  // Persist the shipment's detail rows. Containers first — cargo lines are
  // validated against the resulting container ids.
  private async syncDetailRows(shipmentId: string, companyId: string, rows: DetailRows) {
    if (rows.containers !== undefined) {
      await containerRepository.syncForShipment(shipmentId, companyId, rows.containers);
    }
    if (rows.cargoItems !== undefined || rows.cargoDimensions !== undefined) {
      const containerIds = new Set((await containerRepository.listByShipmentId(shipmentId)).map((c) => c.id));
      if (rows.cargoItems !== undefined) {
        await cargoItemRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoItems, containerIds));
      }
      if (rows.cargoDimensions !== undefined) {
        await cargoDimensionRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoDimensions, containerIds));
      }
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

    // Enrich with detail rows (one query per table for the whole page, grouped by shipment)
    const shipmentIds = result.data.map((s) => s.id);
    const groupByShipment = <R extends { shipmentId: string }, L>(rows: R[], toLine: (r: R) => L) => {
      const map = new Map<string, L[]>();
      for (const row of rows) {
        const list = map.get(row.shipmentId) ?? [];
        list.push(toLine(row));
        map.set(row.shipmentId, list);
      }
      return map;
    };
    const containersByShipment = groupByShipment(await containerRepository.listByShipmentIds(shipmentIds), toContainerLine);
    const itemsByShipment = groupByShipment(await cargoItemRepository.listByShipmentIds(shipmentIds), toCargoItemLine);
    const dimensionsByShipment = groupByShipment(await cargoDimensionRepository.listByShipmentIds(shipmentIds), toCargoDimensionLine);

    const enriched = result.data.map((s) => ({
      ...enrich(
        s,
        containersByShipment.get(s.id) ?? [],
        itemsByShipment.get(s.id) ?? [],
        dimensionsByShipment.get(s.id) ?? [],
      ),
      masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId) || null : null,
    }));

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
    const cargoItems = (await cargoItemRepository.listByShipmentId(id)).map(toCargoItemLine);
    const cargoDimensions = (await cargoDimensionRepository.listByShipmentId(id)).map(toCargoDimensionLine);
    return {
      ...enrich(shipment, containers, cargoItems, cargoDimensions),
      masterJobMczNumber,
    };
  }

  async create(companyId: string, data: Omit<NewShipmentRecord, "companyId"> & DetailRows) {
    const { containers, cargoItems, cargoDimensions, ...rest } = data;
    const shipmentData = sanitizeTypedFields(rest as Record<string, unknown>);
    Object.assign(
      shipmentData,
      exportBolDefaults(shipmentData.tradeDirection as string, {
        houseBolType: shipmentData.houseBolType as string,
        masterBolType: shipmentData.masterBolType as string,
      }),
      startingStateDefaults({
        creditCheck: shipmentData.creditCheck as string,
        vgm: shipmentData.vgm as string,
        bookingConfirmation: shipmentData.bookingConfirmation as string,
        invoicingStatus: shipmentData.invoicingStatus as string,
      }),
    );

    // A shipment created against a quote inherits that quote's sales owner.
    const salesNumber = ((shipmentData.salesNumber as string) ?? "").trim();
    if (salesNumber && !((shipmentData.salesPerson as string) ?? "").trim()) {
      const owner = await this.quoteSalesOwner(salesNumber);
      if (owner) shipmentData.salesPerson = owner;
    }
    const shipment = await shipmentRepository.createForCompany(companyId, shipmentData as never);
    await this.syncDetailRows(shipment.id, companyId, { containers, cargoItems, cargoDimensions });
    await this.recalcCustomerRollups(shipment.customerId, companyId);
    return this.getById(shipment.id, companyId);
  }

  // Next CZ job number for this company (a per-company sequence over all rows incl.
  // archived, so a reference is never reused within the company).
  async nextJobNumber(companyId: string): Promise<string> {
    const max = await shipmentRepository.maxCzJobNumber(companyId);
    return `CZ${String(max + 1).padStart(8, "0")}`;
  }

  async update(id: string, companyId: string, data: Partial<NewShipmentRecord> & DetailRows, userId: string) {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) return null;

    const { containers, cargoItems, cargoDimensions, ...rest } = data;
    const shipmentData = sanitizeTypedFields(rest as Record<string, unknown>);

    // Seed the export BoL types against the values this update leaves behind, so
    // switching a shipment to Export fills them in — and so an export shipment
    // that never had them (e.g. created before this rule) picks them up. Added
    // before the audit loop below, so the change is recorded like any other.
    const after = (key: string) => (key in shipmentData ? shipmentData[key] : (existing as Record<string, unknown>)[key]) as string;
    Object.assign(
      shipmentData,
      exportBolDefaults(after("tradeDirection"), {
        houseBolType: after("houseBolType"),
        masterBolType: after("masterBolType"),
      }),
      startingStateDefaults({
        creditCheck: after("creditCheck"),
        vgm: after("vgm"),
        bookingConfirmation: after("bookingConfirmation"),
        invoicingStatus: after("invoicingStatus"),
      }),
    );

    // Approving the credit check records who did it and when. An explicit
    // approvedBy in the same request wins — the stamp only fills the field the
    // approval itself would leave untouched.
    if (isCreditApproval(shipmentData.creditCheck as string, existing.creditCheck) && !("approvedBy" in shipmentData)) {
      shipmentData.approvedBy = actionStamp(await this.resolveUserName(userId), new Date());
    }

    // Assigning a quote number hands the shipment to whoever sold it: the
    // quote's sales owner becomes the shipment's sales person. Only on a real
    // change, and never over a salesPerson set in the same request.
    const nextSalesNumber = (shipmentData.salesNumber as string | undefined)?.trim();
    if (nextSalesNumber && nextSalesNumber !== existing.salesNumber && !("salesPerson" in shipmentData)) {
      const owner = await this.quoteSalesOwner(nextSalesNumber);
      if (owner) shipmentData.salesPerson = owner;
    }

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

    await this.syncDetailRows(id, companyId, { containers, cargoItems, cargoDimensions });

    if (Object.keys(shipmentData).length > 0) {
      await shipmentRepository.updateForCompany(id, companyId, shipmentData as never);
    }

    // Recalc for the new customer, and for the old one when the link moved.
    const newCustomerId = ("customerId" in shipmentData
      ? (shipmentData.customerId as string | null | undefined)
      : existing.customerId);
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

  // Release the house bill of lading, recording who released it and when.
  // A release is a one-off act: once stamped, the record stands — re-releasing
  // returns the shipment untouched rather than rewriting who did it.
  async releaseHouseBol(id: string, companyId: string, userId: string) {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) return null;
    if (existing.houseBolRelease.trim()) return this.getById(id, companyId);

    const stamp = actionStamp(await this.resolveUserName(userId), new Date());
    return this.update(id, companyId, { houseBolRelease: stamp }, userId);
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
