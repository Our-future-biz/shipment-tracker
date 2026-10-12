import { APIError } from "encore.dev/api";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { masterJobContainerRepository } from "../repositories/masterJobContainer.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { containerRepository } from "../repositories/container.repository";
import { shipmentService } from "./shipment.service";
import { isValidContainerNumber, normalizeContainerNumber } from "./cargoProjection";
import {
  FULL_LOAD,
  containersFromHouses,
  formatMczNumber,
  houseContainerLines,
  isLoadTypeChange,
  legacyContainerGroups,
  syncedShipmentData,
  type MasterContainer,
} from "./masterJobSync";
import type { MasterJobRecord, NewMasterJobRecord } from "../schemas/masterJob.schema";
import type { MasterJobContainerRecord } from "../schemas/masterJobContainer.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type {
  ContainerLine,
  MasterJobContainerLine,
  MasterJobItem,
  MasterJobShipmentItem,
} from "../interfaces/interfaces";

/** Editable master-job fields (everything but the id, MCZ number and bookkeeping). */
export type MasterJobUpdate = Partial<
  Omit<NewMasterJobRecord, "id" | "companyId" | "mczNumber" | "createdAt" | "updatedAt" | "deletedAt">
>;

// Real `date` columns reject "" — the UI sends an empty string when a date is cleared.
const DATE_FIELDS = new Set([
  "closingDate",
  "estimatedDeparture",
  "estimatedArrival",
  "actualDeparture",
  "actualArrival",
  "etaWarehouse",
  "warehouseReceivedDate",
]);

function toItem(row: MasterJobRecord, shipmentCount: number): MasterJobItem {
  const { companyId: _companyId, deletedAt: _deletedAt, ...fields } = row;
  return {
    ...fields,
    shipmentCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toContainerLine(row: ContainerRecord): ContainerLine {
  return {
    id: row.id,
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

function toMasterContainerLine(row: MasterJobContainerRecord): MasterJobContainerLine {
  return {
    id: row.id,
    containerNumber: row.containerNumber,
    sealNumber: row.sealNumber,
    type: row.type,
    shipmentIds: row.shipmentIds,
  };
}

class MasterJobService {
  async list(companyId: string): Promise<MasterJobItem[]> {
    const rows = await masterJobRepository.listForCompany(companyId);
    const counts = await masterJobRepository.shipmentCounts(rows.map((r) => r.id), companyId);
    return rows.map((r) => toItem(r, counts.get(r.id) ?? 0));
  }

  async get(id: string, companyId: string) {
    const row = await this.require(id, companyId);
    const [houses, containers] = await Promise.all([
      shipmentRepository.findByMasterJobId(id, companyId),
      masterJobContainerRepository.listByMasterJobId(id),
    ]);
    const houseContainers = await containerRepository.listByShipmentIds(houses.map((h) => h.id));
    // A Full Load master job shows its houses' containers live; any other load
    // type keeps its own list, assigned out to the houses.
    const masterContainers =
      row.loadType === FULL_LOAD ? containersFromHouses(houseContainers) : containers.map(toMasterContainerLine);
    const shipments: MasterJobShipmentItem[] = houses
      .sort((a, b) => a.jobNumber.localeCompare(b.jobNumber))
      .map((h) => ({
        id: h.id,
        jobNumber: h.jobNumber,
        customer: h.customer,
        shipper: h.shipper,
        consignee: h.consignee,
        tradeDirection: h.tradeDirection,
        status: h.status,
        containerNumber: houseContainers
          .filter((c) => c.shipmentId === h.id && c.containerNumber)
          .map((c) => c.containerNumber)
          .join(", "),
      }));
    return {
      masterJob: toItem(row, houses.length),
      containers: masterContainers,
      shipments,
    };
  }

  // MCZ numbers are a per-company sequence over all rows incl. archived ones,
  // so a number is never reused.
  async create(companyId: string): Promise<MasterJobItem> {
    const max = await masterJobRepository.maxMczSequence(companyId);
    const row = await masterJobRepository.createForCompany(companyId, { mczNumber: formatMczNumber(max + 1) });
    return toItem(row, 0);
  }

  async update(id: string, companyId: string, data: MasterJobUpdate, userId: string): Promise<MasterJobItem> {
    const existing = await this.require(id, companyId);
    if (isLoadTypeChange(existing.loadType, data.loadType ?? undefined)) {
      throw APIError.failedPrecondition(`Load Type is already ${existing.loadType} and can't be changed`);
    }
    const clean: Record<string, unknown> = { ...data };
    for (const key of Object.keys(clean)) {
      if (clean[key] === "" && DATE_FIELDS.has(key)) clean[key] = null;
    }
    const row = await masterJobRepository.updateForCompany(id, companyId, clean as MasterJobUpdate);
    if (!row) throw APIError.notFound("Master job not found");

    // The master job wins: every synced field in this save is written onto the houses.
    const synced = syncedShipmentData(row, clean);
    if (Object.keys(synced).length > 0) {
      const houses = await shipmentRepository.findByMasterJobId(id, companyId);
      for (const house of houses) {
        await shipmentService.update(house.id, companyId, synced as never, userId);
      }
    }
    return toItem(row, await this.countShipments(id, companyId));
  }

  async setContainers(id: string, companyId: string, lines: MasterJobContainerLine[], userId: string) {
    const row = await this.require(id, companyId);
    const numbers = lines.map((l) => normalizeContainerNumber(l.containerNumber));
    const bad = lines.find((l, i) => !numbers[i] || !isValidContainerNumber(l.containerNumber));
    if (bad) {
      throw APIError.invalidArgument(
        `Container number "${bad.containerNumber}" must be 4 letters followed by 7 digits (e.g. MSKU1234567)`,
      );
    }
    const duplicate = numbers.find((n, i) => numbers.indexOf(n) !== i);
    if (duplicate) throw APIError.invalidArgument(`Container ${duplicate} is listed twice`);

    // Assignments may only name this master job's own houses.
    const houses = await shipmentRepository.findByMasterJobId(id, companyId);
    const houseIds = new Set(houses.map((h) => h.id));
    const cleaned = lines.map((l) => ({ ...l, shipmentIds: l.shipmentIds.filter((s) => houseIds.has(s)) }));

    // What the houses carried before this save: on a Full Load that is the houses'
    // own containers, otherwise the master job's stored list.
    const previous: MasterContainer[] =
      row.loadType === FULL_LOAD
        ? containersFromHouses(await containerRepository.listByShipmentIds([...houseIds]))
        : (await masterJobContainerRepository.listByMasterJobId(id)).map(toMasterContainerLine);
    await masterJobContainerRepository.replaceForMasterJob(id, companyId, cleaned);

    // Containers removed from the master job stay "known" with no assignment, so
    // the houses that carried them drop them too.
    const kept = new Set(numbers);
    const removed: MasterContainer[] = previous
      .filter((p) => !kept.has(normalizeContainerNumber(p.containerNumber)))
      .map((p) => ({ ...p, shipmentIds: [] }));
    for (const house of houses) {
      await this.applyToHouse(house.id, companyId, userId, {}, [...cleaned, ...removed]);
    }
    return this.get(id, companyId);
  }

  async linkShipments(id: string, companyId: string, shipmentIds: string[], userId: string) {
    const row = await this.require(id, companyId);
    for (const shipmentId of shipmentIds) {
      const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
      if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
    }
    for (const shipmentId of shipmentIds) {
      await shipmentService.linkMasterJob(shipmentId, companyId, row.mczNumber);
      await this.syncShipment(shipmentId, companyId, userId);
    }
    return this.get(id, companyId);
  }

  async unlinkShipment(id: string, companyId: string, shipmentId: string) {
    await this.require(id, companyId);
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment || shipment.masterJobId !== id) throw APIError.notFound("Shipment is not on this master job");
    await shipmentService.unlinkMasterJob(shipmentId, companyId);

    // The house keeps its data; it just stops being assigned to any container.
    const containers = await masterJobContainerRepository.listByMasterJobId(id);
    if (containers.some((c) => c.shipmentIds.includes(shipmentId))) {
      await masterJobContainerRepository.replaceForMasterJob(
        id,
        companyId,
        containers.map((c) => ({
          ...toMasterContainerLine(c),
          shipmentIds: c.shipmentIds.filter((s) => s !== shipmentId),
        })),
      );
    }
    return this.get(id, companyId);
  }

  /** Copy the master job's filled-in values onto a shipment that was just linked to it. */
  async syncShipment(shipmentId: string, companyId: string, userId: string) {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment?.masterJobId) return;
    const row = await masterJobRepository.getByIdForCompany(shipment.masterJobId, companyId);
    if (!row) return;
    // On a Full Load the house is where containers come from, so its own list stays as it is.
    const containers =
      row.loadType === FULL_LOAD ? [] : (await masterJobContainerRepository.listByMasterJobId(row.id)).map(toMasterContainerLine);
    await this.applyToHouse(shipmentId, companyId, userId, syncedShipmentData(row), containers);
  }

  // One shipmentService.update per house, so the audit log and the shipment's
  // own field rules apply exactly as for an edit made on the shipment.
  private async applyToHouse(
    shipmentId: string,
    companyId: string,
    userId: string,
    fields: Record<string, unknown>,
    masterContainers: MasterContainer[],
  ) {
    const house = (await containerRepository.listByShipmentId(shipmentId)).map(toContainerLine);
    const containers = houseContainerLines(shipmentId, house, masterContainers);
    const data: Record<string, unknown> = { ...fields };
    if (containers) {
      data.containers = containers;
      Object.assign(data, legacyContainerGroups(containers.map((c) => c.type)));
    }
    if (Object.keys(data).length === 0) return;
    await shipmentService.update(shipmentId, companyId, data as never, userId);
  }

  private async require(id: string, companyId: string): Promise<MasterJobRecord> {
    const row = await masterJobRepository.getByIdForCompany(id, companyId);
    if (!row) throw APIError.notFound("Master job not found");
    return row;
  }

  private async countShipments(id: string, companyId: string): Promise<number> {
    return (await masterJobRepository.shipmentCounts([id], companyId)).get(id) ?? 0;
  }
}

export const masterJobService = new MasterJobService();
