import { APIError } from "encore.dev/api";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { masterJobContainerRepository } from "../repositories/masterJobContainer.repository";
import { shipmentRepository } from "../repositories/shipment.repository";
import { containerRepository } from "../repositories/container.repository";
import { shipmentService, type ShipmentUpdateData } from "./shipment.service";
import { isValidContainerNumber, normalizeContainerNumber } from "../lib/cargoProjection";
import { changesTaxDate } from "../lib/taxDate";
import {
  FULL_LOAD,
  containersFromHouses,
  formatMczNumber,
  houseContainerLines,
  isLoadTypeChange,
  legacyContainerGroups,
  syncedShipmentData,
  type MasterContainer,
} from "../lib/masterJobSync";
import type { MasterJobRecord, NewMasterJobRecord } from "../schemas/masterJob.schema";
import type { MasterJobContainerRecord } from "../schemas/masterJobContainer.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type {
  ContainerLine,
  MasterJobContainerLine,
  MasterJobItem,
  MasterJobShipmentItem,
  MasterJobDetail,
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
  "vgmClosing",
  "siClosing",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function toItem(
  { companyId: _companyId, deletedAt: _deletedAt, ...fields }: MasterJobRecord,
  shipmentCount: number,
): MasterJobItem {
  return {
    ...fields,
    shipmentCount,
    createdAt: fields.createdAt.toISOString(),
    updatedAt: fields.updatedAt.toISOString(),
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

  async get(id: string, companyId: string): Promise<MasterJobDetail> {
    const row = await this.require(id, companyId);
    const [houses, containers] = await Promise.all([
      shipmentRepository.findByMasterJobId(id, companyId),
      masterJobContainerRepository.listByMasterJobId(id, companyId),
    ]);
    const houseContainers = await containerRepository.listByShipmentIds(houses.map((h) => h.id), companyId);
    // A Full Load master job shows its houses' containers live; any other load
    // type keeps its own list, assigned out to the houses. An assignment to a
    // shipment that has since left the master job or was archived is not shown.
    const houseIds = new Set(houses.map((h) => h.id));
    const masterContainers =
      row.loadType === FULL_LOAD
        ? containersFromHouses(houseContainers)
        : containers.map((c) => ({ ...toMasterContainerLine(c), shipmentIds: c.shipmentIds.filter((s) => houseIds.has(s)) }));
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
      if (!DATE_FIELDS.has(key)) continue;
      if (clean[key] === "") clean[key] = null;
      // Values read off a document reach here too; refuse a non-date instead of failing in the DB.
      else if (typeof clean[key] === "string" && !ISO_DATE.test(clean[key])) {
        throw APIError.invalidArgument(`${key} must be a date as "YYYY-MM-DD"`);
      }
    }
    // The master job wins: every synced field in this save is written onto the houses. A
    // house that is invoiced can't take a new ATA / ATD, so all houses are checked before
    // anything is written — the save goes through for all of them or for none.
    const synced = syncedShipmentData(existing, clean);
    const houses = Object.keys(synced).length > 0 ? await shipmentRepository.findByMasterJobId(id, companyId) : [];
    const locked: string[] = [];
    for (const house of houses) {
      if (changesTaxDate(house, synced) && (await shipmentService.isInvoiced(house.id))) locked.push(house.jobNumber);
    }
    if (locked.length > 0) {
      throw APIError.failedPrecondition(
        `ATA / ATD can't change: ${locked.join(", ")} ${locked.length === 1 ? "is" : "are"} already invoiced — credit the invoice first`,
      );
    }

    const row = await masterJobRepository.updateForCompany(id, companyId, clean as MasterJobUpdate);
    if (!row) throw APIError.notFound("Master job not found");
    if (houses.length > 0) {
      for (const house of houses) {
        // The synced keys are shipment columns; blanks clear them (null on a date).
        await shipmentService.update(house.id, companyId, synced as ShipmentUpdateData, userId);
      }
    }
    return toItem(row, await this.countShipments(id, companyId));
  }

  async setContainers(id: string, companyId: string, lines: MasterJobContainerLine[], userId: string): Promise<MasterJobDetail> {
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
        ? containersFromHouses(await containerRepository.listByShipmentIds([...houseIds], companyId))
        : (await masterJobContainerRepository.listByMasterJobId(id, companyId)).map(toMasterContainerLine);
    // A Full Load has no list of its own (it is read from the houses), so nothing is stored.
    if (row.loadType !== FULL_LOAD) await masterJobContainerRepository.replaceForMasterJob(id, companyId, cleaned);

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

  async linkShipments(id: string, companyId: string, shipmentIds: string[], userId: string): Promise<MasterJobDetail> {
    const row = await this.require(id, companyId);
    for (const shipmentId of shipmentIds) {
      const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
      if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
    }
    for (const shipmentId of shipmentIds) {
      await this.attachShipment(shipmentId, companyId, row.mczNumber, userId);
    }
    return this.get(id, companyId);
  }

  /**
   * Puts a shipment on the master job with this MCZ number (created when new) and copies
   * the master job's values onto it. A shipment moved off another master job is taken
   * out of that one's container assignments.
   */
  async attachShipment(shipmentId: string, companyId: string, mczNumber: string, userId: string): Promise<void> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
    const linked = await shipmentService.linkMasterJob(shipmentId, companyId, mczNumber);
    if (shipment.masterJobId && shipment.masterJobId !== linked?.masterJobId) {
      await this.unassignFromContainers(shipment.masterJobId, companyId, shipmentId);
    }
    await this.syncShipment(shipmentId, companyId, userId);
  }

  async unlinkShipment(id: string, companyId: string, shipmentId: string): Promise<MasterJobDetail> {
    await this.require(id, companyId);
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment || shipment.masterJobId !== id) throw APIError.notFound("Shipment is not on this master job");
    await this.detachShipment(shipmentId, companyId);
    return this.get(id, companyId);
  }

  /** Takes a shipment off its master job. It keeps its data; it just stops being assigned to any container. */
  async detachShipment(shipmentId: string, companyId: string): Promise<void> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
    await shipmentService.unlinkMasterJob(shipmentId, companyId);
    if (shipment.masterJobId) await this.unassignFromContainers(shipment.masterJobId, companyId, shipmentId);
  }

  /** Copy the master job's filled-in values onto a shipment that was just linked to it. */
  private async syncShipment(shipmentId: string, companyId: string, userId: string): Promise<void> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment?.masterJobId) return;
    const row = await masterJobRepository.getByIdForCompany(shipment.masterJobId, companyId);
    if (!row) return;
    // On a Full Load the house is where containers come from, so its own list stays as it is.
    const containers =
      row.loadType === FULL_LOAD ? [] : (await masterJobContainerRepository.listByMasterJobId(row.id, companyId)).map(toMasterContainerLine);
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
  ): Promise<void> {
    const house = (await containerRepository.listByShipmentId(shipmentId, companyId)).map(toContainerLine);
    const containers = houseContainerLines(shipmentId, house, masterContainers);
    const data: Record<string, unknown> = { ...fields };
    if (containers) {
      data.containers = containers;
      Object.assign(data, legacyContainerGroups(containers.map((c) => c.type)));
    }
    if (Object.keys(data).length === 0) return;
    await shipmentService.update(shipmentId, companyId, data as ShipmentUpdateData, userId);
  }

  private async unassignFromContainers(id: string, companyId: string, shipmentId: string): Promise<void> {
    const containers = await masterJobContainerRepository.listByMasterJobId(id, companyId);
    if (!containers.some((c) => c.shipmentIds.includes(shipmentId))) return;
    await masterJobContainerRepository.replaceForMasterJob(
      id,
      companyId,
      containers.map((c) => ({ ...toMasterContainerLine(c), shipmentIds: c.shipmentIds.filter((s) => s !== shipmentId) })),
    );
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
