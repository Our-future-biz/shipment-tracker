import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { auth, customers, invoicing, quotes } from "~encore/clients";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentRepository, OVERDUE_DEADLINE_FIELDS } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { containerRepository } from "../repositories/container.repository";
import { cargoItemRepository } from "../repositories/cargoItem.repository";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { commercialInvoiceRepository } from "../repositories/commercialInvoice.repository";
import { invoiceValueByCurrency, isValidContainerNumber, normalizeContainerNumber, projectCargo } from "../lib/cargoProjection";
import { actionStamp, cfsDefault, exportBolDefaults, isCreditApproval, startingStateDefaults, statusForDirection } from "../lib/fieldDefaults";
import type { ShipmentListFilters } from "../repositories/shipment.repository";
import type { NewShipmentRecord, ShipmentRecord } from "../schemas/shipment.schema";
import type { ContainerRecord } from "../schemas/container.schema";
import type { CargoItemRecord } from "../schemas/cargoItem.schema";
import type { CargoDimensionRecord } from "../schemas/cargoDimension.schema";
import type { CommercialInvoiceRecord } from "../schemas/commercialInvoice.schema";
import type {
  ContainerLine,
  CargoItemLine,
  CargoDimensionLine,
  CommercialInvoiceLine,
  ShipmentDueItem,
  ShipmentItem,
  ShipmentTileCounts,
  CustomsPriority,
} from "../interfaces/interfaces";
import { iso } from "../../../lib/db/serialize";
import { publicFields } from "../lib/rows";
import { changesTaxDate } from "../lib/taxDate";
import { shipmentDeleted } from "../topics";

// Extra detail rows accepted alongside the shipment's own fields on create/update.
export interface DetailRows {
  containers?: ContainerLine[];
  cargoItems?: CargoItemLine[];
  cargoDimensions?: CargoDimensionLine[];
  commercialInvoices?: CommercialInvoiceLine[];
}

/** What a create writes: the shipment's own fields (a blank priority allowed), plus its detail rows. */
export type ShipmentCreateData = Omit<NewShipmentRecord, "companyId" | "customsPriority"> & BlankablePriority & DetailRows;
/** What an update may write: any of the shipment's own fields, plus its detail rows. */
export type ShipmentUpdateData = Partial<Omit<NewShipmentRecord, "customsPriority">> & BlankablePriority & DetailRows;

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

function toCommercialInvoiceLine(row: CommercialInvoiceRecord): CommercialInvoiceLine {
  return { invoiceNumber: row.invoiceNumber, value: row.value, currency: row.currency };
}

function uniqueJoin(values: string[]): string {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))].join(", ");
}

// The shipment's own Commercial Invoice fields follow the invoice rows whenever they are
// saved: the numbers joined, the single value cleared (the rows carry the values now).
function legacyInvoiceFields(invoices: CommercialInvoiceLine[] | undefined) {
  if (invoices === undefined) return {};
  return { commercialInvoice: uniqueJoin(invoices.map((i) => i.invoiceNumber)), commercialInvoiceValue: null };
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
function enrich(
  shipment: ShipmentRecord,
  containers: ContainerLine[],
  cargoItems: CargoItemLine[],
  cargoDimensions: CargoDimensionLine[],
  commercialInvoices: CommercialInvoiceLine[],
) {
  const hasDetailRows = containers.length > 0 || cargoItems.length > 0 || cargoDimensions.length > 0;
  const p = projectCargo(containers, cargoItems, cargoDimensions);
  return {
    ...shipment,
    containers,
    cargoItems,
    cargoDimensions,
    commercialInvoices,
    // The invoice numbers and values come from the commercial invoice rows; the stored
    // single fields only show for shipments that have no rows.
    commercialInvoice: commercialInvoices.length
      ? uniqueJoin(commercialInvoices.map((i) => i.invoiceNumber))
      : shipment.commercialInvoice,
    containerNumber: aggregate(containers, "containerNumber"),
    sealNumber: aggregate(containers, "sealNumber"),
    pcs: hasDetailRows ? p.pcs : shipment.pcs,
    typeOfPackages: hasDetailRows ? p.typeOfPackages : shipment.typeOfPackages,
    hsCode: hasDetailRows ? p.hsCode : shipment.hsCode,
    cargoDescription: hasDetailRows ? p.cargoDescription : shipment.cargoDescription,
    civByCurrency: invoiceValueByCurrency(commercialInvoices),
    containerTypeSummary: p.containerTypeSummary,
    totalTeu: p.totalTeu,
    totalGrossWeightKg: p.totalGrossWeightKg,
    totalVolumeM3: p.totalVolumeM3,
  };
}

type EnrichedShipment = ReturnType<typeof enrich> & {
  masterJobMczNumber: string | null;
  documentTypes: string[];
  customsStatus: string;
};

// The API shape of an enriched shipment: dates as ISO strings, no tenant/soft-delete columns.
function toShipmentItem(s: EnrichedShipment): ShipmentItem {
  const { createdAt, updatedAt, ...rest } = publicFields(s);
  return { ...rest, createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
}

// Checked before anything is written, so a bad number never leaves a half-saved shipment.
function assertValidContainerNumbers(containers: ContainerLine[] | undefined) {
  const bad = containers?.map((c) => c.containerNumber).find((n) => !isValidContainerNumber(n));
  if (bad !== undefined) {
    throw APIError.invalidArgument(`Container number "${bad}" must be 4 letters followed by 7 digits (e.g. MSKU1234567)`);
  }
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
  "vgmClosing",
  "siClosing",
  "etaWarehouse",
  "warehouseReceivedDate",
  "warehouseReleasedDate",
  "plannedDeliveryDate",
  "shipmentsDate",
  "equipmentDeliveryDate",
]);
const MONEY_FIELDS = new Set(["selling", "buying"]);

// Requests may send "" for the customs priority; it is stored as Standard.
type BlankablePriority = { customsPriority?: CustomsPriority | "" };

function sanitizeTypedFields<T extends BlankablePriority>(
  data: T,
): Omit<T, "customsPriority"> & { customsPriority?: CustomsPriority } {
  const out: Record<string, unknown> = { ...data };
  for (const key of Object.keys(out)) {
    if (out[key] !== "") continue;
    if (DATE_FIELDS.has(key)) out[key] = null;
    else if (MONEY_FIELDS.has(key)) out[key] = "0";
    // Customs Priority is never blank: a shipment is Standard until someone marks it Urgent.
    else if (key === "customsPriority") out[key] = "Standard";
  }
  return out as Omit<T, "customsPriority"> & { customsPriority?: CustomsPriority };
}

/** A classified document of a shipment and its customs review ("" | approved | declined). */
type ShipmentDocument = { documentType: string; customsStatus: string };

/** The paperwork customs needs before it can start work on a shipment. */
const COMMERCIAL_PAPERWORK = ["Invoice", "Packing list"];
const WAITING_FOR_PAPERWORK = "Waiting For Commercial Paperwork";
const PAPERWORK_PENDING = "Paperwork Verification Pending";
const PAPERWORK_VERIFIED = "Paperwork Verified";
/** The steps after the paperwork, set by hand. */
const AFTER_VERIFIED = ["Under Customs Clearance", "Customs Cleared/Released"];

/**
 * Where the commercial paperwork stands: waiting until both an invoice and a packing list
 * are uploaded; verified once each has an approved document and none of them is still
 * waiting for review; pending in between. A declined document stays on record without
 * blocking — the approved replacement counts. Only uploads count: a paper copy ticked as
 * received by hand still has to be uploaded to be reviewed.
 */
function paperworkStatus(documents: ShipmentDocument[]): string {
  const ofType = (type: string) => documents.filter((d) => d.documentType === type);
  if (!COMMERCIAL_PAPERWORK.every((t) => ofType(t).length > 0)) return WAITING_FOR_PAPERWORK;
  const verified = COMMERCIAL_PAPERWORK.every((t) => {
    const docs = ofType(t);
    return docs.some((d) => d.customsStatus === "approved") && !docs.some((d) => !d.customsStatus);
  });
  return verified ? PAPERWORK_VERIFIED : PAPERWORK_PENDING;
}

const CUSTOMS_PRIORITIES = ["Standard", "Urgent"];
const CUSTOMS_DEADLINE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;

/** A "YYYY-MM-DD HH:mm" wall time that is a real date and time. */
function isCustomsDeadline(value: string): boolean {
  const m = CUSTOMS_DEADLINE.exec(value);
  if (!m) return false;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCMonth() === mo - 1 && date.getUTCDate() === d && h < 24 && mi < 60;
}

/**
 * Checks the customs priority and deadline a write leaves behind (`after` reads the value
 * the shipment will have) and clears the deadline of a Standard shipment.
 */
function normalizeCustomsPriority(data: Record<string, unknown>, after: (key: string) => string): void {
  if (!("customsPriority" in data) && !("customsDeadline" in data)) return;
  const priority = after("customsPriority") || "Standard";
  if (!CUSTOMS_PRIORITIES.includes(priority)) {
    throw APIError.invalidArgument(`customsPriority must be one of: ${CUSTOMS_PRIORITIES.join(", ")}`);
  }
  if (priority === "Standard") {
    data.customsDeadline = "";
    return;
  }
  const deadline = after("customsDeadline") ?? "";
  if (deadline && !isCustomsDeadline(deadline)) {
    throw APIError.invalidArgument('customsDeadline must be a date and time as "YYYY-MM-DD HH:mm"');
  }
}

/**
 * The customs status a shipment shows. It follows the paperwork up to "Paperwork Verified";
 * a later step that was set by hand shows only while the paperwork stays verified.
 */
function customsStatusFor(stored: string, documents: ShipmentDocument[]): string {
  const paperwork = paperworkStatus(documents);
  return paperwork === PAPERWORK_VERIFIED && AFTER_VERIFIED.includes(stored) ? stored : paperwork;
}

// Whole days from one ISO date ("YYYY-MM-DD") to another.
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

class ShipmentService {
  // The customer's stored rollups (totalRevenue/totalProfit/totalShipments/
  // lastActivityDate) live in the customers service, which cannot query this
  // database — so every shipment mutation that touches a linked customer
  // recomputes them here and pushes them over. Failures are logged, not thrown: a
  // stale rollup must not fail the shipment write itself.
  private async recalcCustomerRollups(customerId: string | null | undefined, companyId: string): Promise<void> {
    if (!customerId) return;
    try {
      const rollups = await shipmentRepository.customerRollups(customerId, companyId);
      await customers.customerRollupsUpdate({ id: customerId, ...rollups });
    } catch (err) {
      // The customer may have been deleted since; nothing to sync then.
      log.warn(err, "customer rollups not synced", { customerId });
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
    } catch (err) {
      log.warn(err, "acting user name not resolved", { userId });
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
    } catch (err) {
      // Free-text sales numbers are allowed; an unknown reference just means
      // there is no owner to inherit.
      if (!(err instanceof APIError && err.code === ErrCode.NotFound)) {
        log.warn(err, "quote sales owner not resolved", { quoteNumber });
      }
      return "";
    }
  }

  // Persist the shipment's detail rows. Containers first — cargo lines are
  // validated against the resulting container ids.
  private async syncDetailRows(shipmentId: string, companyId: string, rows: DetailRows): Promise<void> {
    if (rows.containers !== undefined) {
      await containerRepository.syncForShipment(shipmentId, companyId, rows.containers);
    }
    if (rows.cargoItems !== undefined || rows.cargoDimensions !== undefined) {
      const containerIds = new Set((await containerRepository.listByShipmentId(shipmentId, companyId)).map((c) => c.id));
      if (rows.cargoItems !== undefined) {
        await cargoItemRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoItems, containerIds));
      }
      if (rows.cargoDimensions !== undefined) {
        await cargoDimensionRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoDimensions, containerIds));
      }
    }
    if (rows.commercialInvoices !== undefined) {
      await commercialInvoiceRepository.replaceForShipment(shipmentId, companyId, rows.commercialInvoices);
    }
  }

  async list(
    companyId: string,
    filters: ShipmentListFilters,
  ): Promise<{ pagination: { total: number; offset: number; limit: number }; data: ShipmentItem[] }> {
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
    const containersByShipment = groupByShipment(await containerRepository.listByShipmentIds(shipmentIds, companyId), toContainerLine);
    const itemsByShipment = groupByShipment(await cargoItemRepository.listByShipmentIds(shipmentIds, companyId), toCargoItemLine);
    const dimensionsByShipment = groupByShipment(await cargoDimensionRepository.listByShipmentIds(shipmentIds, companyId), toCargoDimensionLine);
    const invoicesByShipment = groupByShipment(await commercialInvoiceRepository.listByShipmentIds(shipmentIds, companyId), toCommercialInvoiceLine);

    // Document types per shipment — the Customs screen shows a tick when the
    // required document is present.
    const docRows = await shipmentAttachmentRepository.documentTypesByShipmentIds(shipmentIds, companyId);
    const docsByShipment = new Map<string, ShipmentDocument[]>();
    for (const r of docRows) {
      if (!r.documentType) continue;
      const list = docsByShipment.get(r.shipmentId) ?? [];
      list.push(r);
      docsByShipment.set(r.shipmentId, list);
    }

    const enriched = result.data.map((s) => toShipmentItem({
      ...enrich(
        s,
        containersByShipment.get(s.id) ?? [],
        itemsByShipment.get(s.id) ?? [],
        dimensionsByShipment.get(s.id) ?? [],
        invoicesByShipment.get(s.id) ?? [],
      ),
      masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId) || null : null,
      documentTypes: (docsByShipment.get(s.id) ?? []).map((d) => d.documentType),
      customsStatus: customsStatusFor(s.customsStatus, docsByShipment.get(s.id) ?? []),
    }));

    return {
      pagination: { total: result.total, offset: filters.offset, limit: filters.limit },
      data: enriched,
    };
  }

  async tileCounts(companyId: string): Promise<ShipmentTileCounts> {
    return shipmentRepository.tileCounts(companyId);
  }

  // Active shipments with a deadline coming up, split by how soon: within 24 hours
  // (today or tomorrow, plus unconfirmed compliance items already overdue) and within
  // 48 hours (the day after). A shipment with dates in both windows is listed in both,
  // each time with just that window's dates.
  async needsAttention(companyId: string): Promise<{ within24h: ShipmentDueItem[]; within48h: ShipmentDueItem[] }> {
    const rows = await shipmentRepository.dueWithinDays(companyId, 2);
    const window = (minDays: number, maxDays: number) =>
      rows.flatMap(({ id, jobNumber, customerId, customer, tradeDirection, status, today, ...dates }) => {
        const deadlines = Object.entries(dates)
          .flatMap(([field, date]) => (date ? [{ field, date, daysLeft: daysBetween(today, date) }] : []))
          // A row also carries its other dates, earlier and later; keep this window's.
          // Overdue items belong to the most urgent window.
          .filter((d) => d.daysLeft <= maxDays && (d.daysLeft >= minDays || (minDays === 0 && OVERDUE_DEADLINE_FIELDS.has(d.field))))
          .sort((a, b) => a.daysLeft - b.daysLeft);
        return deadlines.length ? [{ id, jobNumber, customerId, customer, tradeDirection, status, deadlines }] : [];
      });
    return { within24h: window(0, 1), within48h: window(2, 2) };
  }

  /** Refuses work on a shipment that isn't a live shipment of the company (child rows hang off it). */
  async requireLive(id: string, companyId: string): Promise<void> {
    if (!(await shipmentRepository.getByIdForCompany(id, companyId))) throw APIError.notFound("Shipment not found");
  }

  /** A live shipment of the company; not found otherwise. */
  async get(id: string, companyId: string): Promise<ShipmentItem> {
    const shipment = await this.getById(id, companyId);
    if (!shipment) throw APIError.notFound("Shipment not found");
    return shipment;
  }

  async getById(id: string, companyId: string): Promise<ShipmentItem | null> {
    const shipment = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!shipment) return null;
    let masterJobMczNumber: string | null = null;
    if (shipment.masterJobId) {
      const mj = await masterJobRepository.getByIdForCompany(shipment.masterJobId, companyId);
      if (mj) masterJobMczNumber = mj.mczNumber;
    }
    const containers = (await containerRepository.listByShipmentId(id, companyId)).map(toContainerLine);
    const cargoItems = (await cargoItemRepository.listByShipmentId(id, companyId)).map(toCargoItemLine);
    const cargoDimensions = (await cargoDimensionRepository.listByShipmentId(id, companyId)).map(toCargoDimensionLine);
    const commercialInvoices = (await commercialInvoiceRepository.listByShipmentId(id, companyId)).map(toCommercialInvoiceLine);
    const documents = await this.documentsOf(id, companyId);
    return toShipmentItem({
      ...enrich(shipment, containers, cargoItems, cargoDimensions, commercialInvoices),
      masterJobMczNumber,
      documentTypes: documents.map((d) => d.documentType),
      customsStatus: customsStatusFor(shipment.customsStatus, documents),
    });
  }

  /**
   * Customer links (customer, shipper, consignee, principal party) point at customers of the
   * caller's company: an unknown id is refused and a blank one unlinks. The Principal Party
   * also stores the customer's own name.
   */
  private async resolveCustomerLinks(data: Partial<NewShipmentRecord>): Promise<void> {
    const links = [
      ["customerId", "customer"],
      ["shipperId", "shipper"],
      ["consigneeId", "consignee"],
      ["principalPartyId", "principal party"],
    ] as const;
    await Promise.all(
      links.map(async ([key, label]) => {
        if (!(key in data)) return;
        const id = data[key];
        if (!id) {
          data[key] = null;
          return;
        }
        try {
          const { customer } = await customers.customerGet({ id });
          if (key === "principalPartyId") data.principalParty = customer.companyName;
        } catch (err) {
          if (err instanceof APIError && err.code === ErrCode.NotFound) {
            throw APIError.invalidArgument(`Unknown ${label}`);
          }
          throw err;
        }
      }),
    );
  }

  /** The classified documents uploaded to one shipment, with their customs review. */
  private async documentsOf(id: string, companyId: string): Promise<ShipmentDocument[]> {
    const rows = await shipmentAttachmentRepository.documentTypesByShipmentIds([id], companyId);
    return rows.filter((r) => r.documentType);
  }

  async create(companyId: string, data: ShipmentCreateData): Promise<ShipmentItem> {
    const { containers, cargoItems, cargoDimensions, commercialInvoices, ...rest } = data;
    assertValidContainerNumbers(containers);
    const shipmentData = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });
    // A new shipment has no paperwork yet, so its customs status starts where the paperwork does.
    delete shipmentData.customsStatus;
    // The starting status belongs to the shipment's Trade Direction.
    const directionStatus = statusForDirection(shipmentData.status ?? "", shipmentData.tradeDirection ?? "");
    if (directionStatus) shipmentData.status = directionStatus;
    const stored: Record<string, unknown> = shipmentData;
    normalizeCustomsPriority(stored, (key) => stored[key] as string);
    await this.resolveCustomerLinks(shipmentData);
    Object.assign(
      shipmentData,
      exportBolDefaults(shipmentData.tradeDirection ?? "", {
        houseBolType: shipmentData.houseBolType ?? "",
        masterBolType: shipmentData.masterBolType ?? "",
      }),
      startingStateDefaults({
        creditCheck: shipmentData.creditCheck,
        vgm: shipmentData.vgm,
        bookingConfirmation: shipmentData.bookingConfirmation,
        invoicingStatus: shipmentData.invoicingStatus,
      }),
      cfsDefault(shipmentData.hub, shipmentData.cfs),
    );

    // A shipment created against a quote inherits that quote's sales owner.
    const salesNumber = (shipmentData.salesNumber ?? "").trim();
    if (salesNumber && !(shipmentData.salesPerson ?? "").trim()) {
      const owner = await this.quoteSalesOwner(salesNumber);
      if (owner) shipmentData.salesPerson = owner;
    }
    const shipment = await shipmentRepository.createForCompany(companyId, shipmentData);
    await this.syncDetailRows(shipment.id, companyId, { containers, cargoItems, cargoDimensions, commercialInvoices });
    await this.recalcCustomerRollups(shipment.customerId, companyId);
    return (await this.getById(shipment.id, companyId))!;
  }

  // Next CZ job number for this company (a per-company sequence over all rows incl.
  // archived, so a reference is never reused within the company).
  async nextJobNumber(companyId: string): Promise<string> {
    const max = await shipmentRepository.maxCzJobNumber(companyId);
    return `CZ${String(max + 1).padStart(8, "0")}`;
  }

  async update(id: string, companyId: string, data: ShipmentUpdateData, userId: string): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");

    const { containers, cargoItems, cargoDimensions, commercialInvoices, ...rest } = data;
    assertValidContainerNumbers(containers);
    const shipmentData: Partial<NewShipmentRecord> = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });

    // Up to "Paperwork Verified" the customs status follows the paperwork; only the steps
    // after it are set by hand, and only once the paperwork is approved.
    // A write of the status the shipment already shows changes nothing; any other value
    // that is not one of those manual steps is refused rather than silently dropped.
    if ("customsStatus" in shipmentData) {
      const documents = await this.documentsOf(id, companyId);
      const wanted = shipmentData.customsStatus ?? "";
      if (wanted === customsStatusFor(existing.customsStatus, documents)) {
        delete shipmentData.customsStatus;
      } else if (paperworkStatus(documents) !== PAPERWORK_VERIFIED) {
        throw APIError.failedPrecondition("The customs status follows the paperwork until the invoice and packing list are approved");
      } else if (![PAPERWORK_VERIFIED, ...AFTER_VERIFIED].includes(wanted)) {
        throw APIError.invalidArgument(`customsStatus can only be set to: ${[PAPERWORK_VERIFIED, ...AFTER_VERIFIED].join(", ")}`);
      }
    }
    await this.resolveCustomerLinks(shipmentData);

    // ATA / ATD is the tax date; once the job is invoiced it is final (owner decision,
    // 14 Oct 2026) — correct it by crediting the invoice first. A trade-direction switch
    // that changes which of the two is the tax date counts too.
    if (changesTaxDate(existing, shipmentData) && (await this.isInvoiced(id))) {
      throw APIError.failedPrecondition("ATA / ATD and the trade direction can't change once the job is invoiced — credit the invoice first");
    }

    // Seed the export BoL types against the values this update leaves behind, so
    // switching a shipment to Export fills them in — and so an export shipment
    // that never had them (e.g. created before this rule) picks them up. Added
    // before the audit loop below, so the change is recorded like any other.
    const written: Record<string, unknown> = shipmentData;
    const before: Record<string, unknown> = existing;
    const after = (key: string) => (key in written ? written[key] : before[key]) as string;
    normalizeCustomsPriority(written, after);
    // A Trade Direction change carries the shipment status over to the new direction.
    if ("tradeDirection" in shipmentData && after("tradeDirection") !== existing.tradeDirection) {
      const moved = statusForDirection(after("status"), after("tradeDirection"));
      if (moved) shipmentData.status = moved;
    }
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
      cfsDefault(after("hub"), after("cfs")),
    );

    // The plate number belongs to the truck (TCZ…), not to one shipment on it. A shipment
    // put on a truck takes that truck's plate, one taken off loses it, and a plate typed
    // on any shipment of a truck is written to the others once this update is saved.
    const truck = after("warehouseTruck") || "";
    const plateTyped = "plateNumber" in shipmentData;
    if (!plateTyped && truck !== existing.warehouseTruck) {
      const truckPlate = truck ? await shipmentRepository.truckPlate(companyId, truck) : "";
      if (truckPlate || !truck) shipmentData.plateNumber = truckPlate;
    }

    // Approving the credit check records who did it and when. An explicit
    // approvedBy in the same request wins — the stamp only fills the field the
    // approval itself would leave untouched.
    if (isCreditApproval(shipmentData.creditCheck, existing.creditCheck) && !("approvedBy" in shipmentData)) {
      shipmentData.approvedBy = actionStamp(await this.resolveUserName(userId), new Date());
    }

    // Assigning a quote number hands the shipment to whoever sold it: the
    // quote's sales owner becomes the shipment's sales person. Only on a real
    // change, and never over a salesPerson set in the same request.
    const nextSalesNumber = shipmentData.salesNumber?.trim();
    if (nextSalesNumber && nextSalesNumber !== existing.salesNumber && !("salesPerson" in shipmentData)) {
      const owner = await this.quoteSalesOwner(nextSalesNumber);
      if (owner) shipmentData.salesPerson = owner;
    }

    // Write audit entries for changed shipment fields
    for (const [key, newValue] of Object.entries(shipmentData)) {
      const oldValue = before[key];
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

    await this.syncDetailRows(id, companyId, { containers, cargoItems, cargoDimensions, commercialInvoices });

    if (Object.keys(shipmentData).length > 0) {
      await shipmentRepository.updateForCompany(id, companyId, shipmentData);
    }
    if (truck && plateTyped) {
      await shipmentRepository.setTruckPlate(companyId, truck, shipmentData.plateNumber ?? "");
    }

    // Recalc for the new customer, and for the old one when the link moved.
    const newCustomerId = "customerId" in shipmentData ? shipmentData.customerId : existing.customerId;
    await this.recalcCustomerRollups(newCustomerId, companyId);
    if (existing.customerId && existing.customerId !== newCustomerId) {
      await this.recalcCustomerRollups(existing.customerId, companyId);
    }

    return (await this.getById(id, companyId))!;
  }

  // Soft-delete: the row and all its details are kept (only deletedAt is set) so the
  // job reference can never be reused. Recorded in the audit log as a change. Its details
  // drop out of every read with it (they are only reached through a live shipment), and
  // other services are told so they can retire what they keep for it.
  /**
   * Whether the job has an issued, not credited invoice. The company comes from the
   * caller's auth, which Encore passes along on the service call.
   */
  async isInvoiced(id: string): Promise<boolean> {
    const { count } = await invoicing.openInvoiceCount({ shipmentId: id });
    return count > 0;
  }

  async softDelete(id: string, companyId: string, userId?: string): Promise<void> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    // Its invoices would stay open in the queue and the customer's balance with no job.
    if (await this.isInvoiced(id)) {
      throw APIError.failedPrecondition("An invoiced shipment can't be deleted — credit its invoices first");
    }

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

    await shipmentRepository.softDeleteForCompany(id, companyId);
    await this.recalcCustomerRollups(existing.customerId, companyId);
    await shipmentDeleted.publish({ shipmentId: id, companyId });
  }

  // Release the house bill of lading, recording who released it and when.
  // A release is a one-off act: once stamped, the record stands — re-releasing
  // returns the shipment untouched rather than rewriting who did it.
  async releaseHouseBol(id: string, companyId: string, userId: string): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    if (existing.houseBolRelease.trim()) return (await this.getById(id, companyId))!;

    const stamp = actionStamp(await this.resolveUserName(userId), new Date());
    return this.update(id, companyId, { houseBolRelease: stamp }, userId);
  }

  async linkMasterJob(shipmentId: string, companyId: string, mczNumber: string): Promise<ShipmentRecord | null> {
    let masterJob = await masterJobRepository.findByMczNumber(mczNumber, companyId);
    if (!masterJob) {
      masterJob = await masterJobRepository.createForCompany(companyId, { mczNumber });
    }
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: masterJob.id });
  }

  async unlinkMasterJob(shipmentId: string, companyId: string): Promise<ShipmentRecord | null> {
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: null });
  }
}

export const shipmentService = new ShipmentService();
