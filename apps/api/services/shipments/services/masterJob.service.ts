import { APIError, ErrCode } from "encore.dev/api";
import { customers } from "~encore/clients";
import { isUuid } from "../../../lib/uuid";
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
  houseContainerLines,
  isLoadTypeChange,
  legacyContainerGroups,
  syncedShipmentData,
  type MasterContainer,
} from "../lib/masterJobSync";
import type { MasterJobRecord, NewMasterJobRecord } from "../schemas/masterJob.schema";
import { isDetailsManager, isOpenToPerson, touchesDetails } from "../lib/shipmentEditRule";
import type { MasterJobContainerRecord } from "../schemas/masterJobContainer.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type {
  ContainerLine,
  MasterJobContainerLine,
  MasterJobItem,
  MasterJobHouseItem,
  MasterJobInvoiceHouseItem,
  MasterJobShipmentItem,
  MasterJobDetail,
} from "../interfaces/interfaces";
import { assertTimes, clearStaleTimes } from "../lib/dateTimes";
import { dropSharesOfLeftShipments } from "../lib/masterJobCosts";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { freightTons } from "../lib/freightTons";
import { compareJobNumbers } from "../../../lib/jobNumber";
import { CANCELLED_STATUS } from "../lib/fieldDefaults";
import { companyUsers, userEmailOf, type CompanyUser } from "../../../lib/companyUsers";
import { requireUserEmail } from "../../../lib/personPick";

/** The person saving a master job, held to who may change each house's details (lib/shipmentEditRule). */
export interface MasterJobEditor {
  userID: string;
  role: string;
}

/** Editable master-job fields (everything but the id, MCZ number, who created it and bookkeeping). */
export type MasterJobUpdate = Partial<
  Omit<NewMasterJobRecord, "id" | "companyId" | "mczNumber" | "createdBy" | "createdAt" | "updatedAt" | "deletedAt">
>;

/** The master job's own people: a user of the company, kept by e-mail, or nobody. */
const MASTER_JOB_PEOPLE = { personInCharge: "Person In Charge", holidayCover: "Holiday Cover" } as const;
type MasterJobPerson = keyof typeof MASTER_JOB_PEOPLE;

/** Why a person may not change the master job's people (lib/shipmentEditRule, as on a shipment). */
export const MASTER_JOB_PEOPLE_REFUSAL =
  "Only this master job's Person in Charge, Holiday Cover or a manager can change its Person in Charge and Holiday Cover";

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
  "amsDeadline",
  "isfDeadline",
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

/**
 * The MBL Shipper / Consignee point at customers of the caller's company: an unknown id is refused,
 * a blank one unlinks (the name stays as free text), and a linked one stores the customer's current
 * name whatever text came with it - later renames reach it through the customer-changed event.
 */
async function resolveParties(data: Record<string, unknown>): Promise<void> {
  const parties = [
    ["shipperId", "shipper", "shipper"],
    ["consigneeId", "consignee", "consignee"],
  ] as const;
  await Promise.all(
    parties.map(async ([key, nameKey, label]) => {
      if (!(key in data)) return;
      const id = data[key];
      if (typeof id !== "string" || !id) {
        data[key] = null;
        return;
      }
      if (!isUuid(id)) throw APIError.invalidArgument(`Unknown ${label}`);
      try {
        data[nameKey] = (await customers.customerGet({ id })).customer.companyName;
      } catch (err) {
        if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.invalidArgument(`Unknown ${label}`);
        throw err;
      }
    }),
  );
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
      .sort((a, b) => compareJobNumbers(a.jobNumber, b.jobNumber))
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
        personInCharge: h.personInCharge,
        holidayCover: h.holidayCover,
      }));
    return {
      masterJob: toItem(row, houses.length),
      containers: masterContainers,
      shipments,
    };
  }

  // MCZ numbers are a per-company sequence over all rows incl. archived ones,
  // so a number is never reused.
  async create(companyId: string, userId?: string): Promise<MasterJobItem> {
    // Who created it, by e-mail as on a shipment ("" when the user can't be looked up).
    const createdBy = userId ? await userEmailOf(userId) : "";
    const row = await masterJobRepository.createWithMczNumber(companyId, createdBy);
    return toItem(row, 0);
  }

  // `editor`: the person saving, when it is their edit (the Master Jobs page, and a date or vessel
  // from a house's Tracking tab: an event recorded or confirmed, a notice kept). A save that writes
  // a house's details is held to that house's rule, all houses before any is written. Left out only
  // by the app's own writes, which aren't held to it.
  async update(id: string, companyId: string, data: MasterJobUpdate, userId: string, editor?: MasterJobEditor): Promise<MasterJobItem> {
    const existing = await this.require(id, companyId);
    if (isLoadTypeChange(existing.loadType, data.loadType ?? undefined)) {
      throw APIError.failedPrecondition(`Load Type is already ${existing.loadType} and can't be changed`);
    }
    const clean: Record<string, unknown> = { ...data };
    await resolveParties(clean);
    await this.checkPeople(existing, clean, editor);
    assertTimes(clean);
    for (const key of Object.keys(clean)) {
      if (!DATE_FIELDS.has(key)) continue;
      if (clean[key] === "") clean[key] = null;
      // Values read off a document reach here too; refuse a non-date instead of failing in the DB.
      else if (typeof clean[key] === "string" && !ISO_DATE.test(clean[key])) {
        throw APIError.invalidArgument(`${key} must be a date as "YYYY-MM-DD"`);
      }
    }
    clearStaleTimes(clean, existing);
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
    if (editor && touchesDetails(synced)) await this.assertMayChangeHouses(houses, editor);

    const row = await masterJobRepository.updateForCompany(id, companyId, clean as MasterJobUpdate);
    if (!row) throw APIError.notFound("Master job not found");
    if (houses.length > 0) {
      for (const house of houses) {
        // The synced keys are shipment columns; blanks clear them (null on a date).
        await shipmentService.update(house.id, companyId, synced as ShipmentUpdateData, userId, undefined, "master_job");
      }
    }
    return toItem(row, await this.countShipments(id, companyId));
  }

  async setContainers(id: string, companyId: string, lines: MasterJobContainerLine[], userId: string, editor?: MasterJobEditor): Promise<MasterJobDetail> {
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
    // Containers removed from the master job stay "known" with no assignment, so
    // the houses that carried them drop them too.
    const kept = new Set(numbers);
    const removed: MasterContainer[] = previous
      .filter((p) => !kept.has(normalizeContainerNumber(p.containerNumber)))
      .map((p) => ({ ...p, shipmentIds: [] }));
    const masterContainers = [...cleaned, ...removed];

    // A house whose containers this save changes is held to its rule, all of them before anything is stored.
    if (editor && !isDetailsManager(editor.role)) {
      const lists = await containerRepository.listByShipmentIds([...houseIds], companyId);
      const boxes = (ls: readonly ContainerLine[]) => JSON.stringify(ls.map((l) => [normalizeContainerNumber(l.containerNumber), l.sealNumber, l.type]));
      const changed = houses.filter((h) => {
        const now = lists.filter((c) => c.shipmentId === h.id).map(toContainerLine);
        const next = houseContainerLines(h.id, now, masterContainers);
        return next !== null && boxes(next) !== boxes(now);
      });
      await this.assertMayChangeHouses(changed, editor);
    }

    // A Full Load has no list of its own (it is read from the houses), so nothing is stored.
    if (row.loadType !== FULL_LOAD) await masterJobContainerRepository.replaceForMasterJob(id, companyId, cleaned);
    for (const house of houses) {
      await this.applyToHouse(house.id, companyId, userId, {}, masterContainers);
    }
    return this.get(id, companyId);
  }

  async linkShipments(id: string, companyId: string, shipmentIds: string[], userId: string): Promise<MasterJobDetail> {
    const row = await this.require(id, companyId);
    const left: (string | null)[] = [];
    for (const shipmentId of shipmentIds) {
      const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
      if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
      left.push(shipment.masterJobId);
    }
    for (const shipmentId of shipmentIds) {
      await this.attachShipment(shipmentId, companyId, row.mczNumber, userId, { dropShares: false });
    }
    // They carry nothing of the master jobs they left; this one's costs reach them when its split is processed.
    await dropSharesOfLeftShipments(left.filter((masterJobId) => masterJobId !== id));
    return this.get(id, companyId);
  }

  /**
   * Puts a shipment on the master job with this MCZ number (created when new) and copies
   * the master job's values onto it. A shipment moved off another master job is taken
   * out of that one's container assignments.
   */
  async attachShipment(shipmentId: string, companyId: string, mczNumber: string, userId: string, { dropShares = true } = {}): Promise<void> {
    const shipment = await shipmentRepository.getByIdForCompany(shipmentId, companyId);
    if (!shipment) throw APIError.notFound(`Shipment ${shipmentId} not found`);
    const linked = await shipmentService.linkMasterJob(shipmentId, companyId, mczNumber, userId);
    if (shipment.masterJobId && shipment.masterJobId !== linked?.masterJobId) {
      await this.unassignFromContainers(shipment.masterJobId, companyId, shipmentId);
    }
    await this.syncShipment(shipmentId, companyId, userId);
    // It carries nothing of a master job it left; the new one's costs reach it when its split is processed.
    if (dropShares && shipment.masterJobId !== linked?.masterJobId) await dropSharesOfLeftShipments([shipment.masterJobId]);
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
    await dropSharesOfLeftShipments([shipment.masterJobId]);
  }

  /** The master job's live shipments with their freight tons (W/M), what its costs are split over. */
  async houses(id: string, companyId: string): Promise<MasterJobHouseItem[]> {
    return (await this.invoiceHouses(id, companyId)).map(({ shipmentId, jobNumber, freightTon }) => ({ shipmentId, jobNumber, freightTon }));
  }

  /** The same shipments with their House B/L and whether they are cancelled: what a vendor invoice read by B/L is checked against. */
  async invoiceHouses(id: string, companyId: string): Promise<MasterJobInvoiceHouseItem[]> {
    await this.require(id, companyId);
    const rows = await shipmentRepository.findByMasterJobId(id, companyId);
    const dims = await cargoDimensionRepository.listByShipmentIds(rows.map((r) => r.id), companyId);
    return rows
      .map((r) => ({
        shipmentId: r.id,
        jobNumber: r.jobNumber,
        freightTon: freightTons(dims.filter((d) => d.shipmentId === r.id), r).freightTon,
        houseBolNumber: r.houseBolNumber,
        cancelled: r.status === CANCELLED_STATUS,
      }))
      .sort((a, b) => compareJobNumbers(a.jobNumber, b.jobNumber));
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

  /** Refuses the save, naming the houses, when the editor may not change every one of them. */
  /** Refuses, naming them, a person who may not change the details of every house of the master job. */
  async assertMayChangeEveryHouse(id: string, companyId: string, editor: MasterJobEditor): Promise<void> {
    if (isDetailsManager(editor.role)) return;
    await this.assertMayChangeHouses(await shipmentRepository.findByMasterJobId(id, companyId), editor);
  }

  private async assertMayChangeHouses(
    houses: readonly { jobNumber: string; personInCharge: string; holidayCover: string }[],
    editor: MasterJobEditor,
  ): Promise<void> {
    if (isDetailsManager(editor.role)) return;
    const refused: string[] = [];
    for (const house of houses) {
      if (!(await shipmentService.mayChangeDetails(house, editor.userID, editor.role))) refused.push(house.jobNumber);
    }
    if (refused.length > 0) {
      throw APIError.permissionDenied(
        `Only the Person in Charge, Holiday Cover or a manager can change ${refused.join(", ")}, so this master job save would change ${refused.length === 1 ? "a shipment" : "shipments"} you can't`,
      );
    }
  }

  /**
   * The master job's Person in Charge / Holiday Cover in `data`, as they are stored. Each names a user
   * of the company (by e-mail) or nobody (""); the value it already holds passes as it is, an old one
   * too. A change is held to the shipment's rule (lib/shipmentEditRule), with the master job's own
   * people: a manager, admin or superadmin always, at user level its Person in Charge or Holiday
   * Cover, or anyone while it names neither. The app's own writes name no editor and aren't held to it.
   */
  private async checkPeople(existing: MasterJobRecord, data: Record<string, unknown>, editor?: MasterJobEditor): Promise<void> {
    const changed: MasterJobPerson[] = [];
    for (const key of Object.keys(MASTER_JOB_PEOPLE) as MasterJobPerson[]) {
      const value = data[key];
      if (typeof value !== "string") continue;
      const current = existing[key] ?? "";
      if (value.trim() === current.trim()) data[key] = current;
      else changed.push(key);
    }
    if (changed.length === 0) return;
    if (editor && !(await this.mayChangePeople(existing, editor))) throw APIError.permissionDenied(MASTER_JOB_PEOPLE_REFUSAL);
    // The users are read once, and only for a person named (clearing one needs none).
    let users: CompanyUser[] | null = null;
    for (const key of changed) {
      const value = (data[key] as string).trim();
      if (!value) {
        data[key] = "";
        continue;
      }
      users ??= await companyUsers();
      data[key] = requireUserEmail(value, MASTER_JOB_PEOPLE[key], users);
    }
  }

  /** Whether this person may change the master job's people: as shipmentService.mayChangeDetails rules a shipment's. */
  private async mayChangePeople(masterJob: Pick<MasterJobRecord, MasterJobPerson>, editor: MasterJobEditor): Promise<boolean> {
    return isDetailsManager(editor.role) || isOpenToPerson(masterJob, "") || isOpenToPerson(masterJob, await userEmailOf(editor.userID));
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
