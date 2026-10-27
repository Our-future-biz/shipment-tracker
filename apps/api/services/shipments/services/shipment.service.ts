import { APIError, ErrCode } from "encore.dev/api";
import type { Actor } from "../../../lib/rbac";
import { canManageSales, shipmentFromQuoteRefusal, shipmentLinkRefusal } from "../../../lib/salesPolicy";
import { isSalesReference } from "../../../lib/salesReference";
import log from "encore.dev/log";
import { customers, invoicing, quotes } from "~encore/clients";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import { shipmentRepository, OVERDUE_DEADLINE_FIELDS, type NewShipmentData } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRefCounterRepository } from "../repositories/shipmentRefCounter.repository";
import { containerRepository } from "../repositories/container.repository";
import { cargoItemRepository } from "../repositories/cargoItem.repository";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { commercialInvoiceRepository } from "../repositories/commercialInvoice.repository";
import { invoiceValueByCurrency, isValidContainerNumber, normalizeContainerNumber, projectCargo } from "../lib/cargoProjection";
import { actionStamp, cfsDefault, exportBolDefaults, isCreditApproval, startingStateDefaults, statusForDirection } from "../lib/fieldDefaults";
import { quoteLinksService } from "./quoteLinks.service";
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
  CostImportOutcome,
  CustomerShipmentFacts,
  PeopleNormalizeResult,
  QuoteLinkOutcome,
  QuoteShipments,
  QuoteSyncResult,
  ShipmentDueItem,
  ShipmentItem,
  ShipmentTileCounts,
  CustomsPriority,
  PalletType,
  AdrPackingGroup,
} from "../interfaces/interfaces";
import { iso } from "../../../lib/db/serialize";
import { isUuid } from "../../../lib/uuid";
import { publicFields } from "../lib/rows";
import { changesTaxDate } from "../lib/taxDate";
import { normalizeCargoDimensions, normalizeStops } from "../lib/roadFreight";
import { partyContact, partyStop, stopKeys, type Party } from "../lib/partyAddress";
import { CONSIGNEE_CONTACT, CUSTOMER_PIC, SHIPPER_CONTACT, linkContact, type ContactMode } from "../lib/contactLinks";
import { shipmentDeleted, shipmentPartiesChanged } from "../topics";
import { companyUsers, matchUser, requireUserEmail, userEmailOf, type CompanyUser } from "../../../lib/companyUsers";
import { PERSON_FIELDS, planPeopleNormalize, requireApprovedBy } from "../lib/people";

// The customers a write links to, by the field holding the link: read once, for the link check
// and for the party fill after it.
type LinkedCustomer = Awaited<ReturnType<typeof customers.customerGet>>["customer"];
type LinkedCustomers = Partial<Record<"customerId" | "shipperId" | "consigneeId" | "principalPartyId", LinkedCustomer>>;

// The contacts of the customers a write names, read at most once each per request: the party
// fill and the contact links share them.
type CustomerContacts = Awaited<ReturnType<typeof customers.contactList>>["data"];
type ContactsOnce = (customerId: string) => Promise<CustomerContacts>;
function contactsOnce(): ContactsOnce {
  const read = new Map<string, Promise<CustomerContacts>>();
  return (customerId) => {
    let contacts = read.get(customerId);
    if (!contacts) {
      contacts = customers.contactList({ customerId }).then((r) => r.data);
      read.set(customerId, contacts);
    }
    return contacts;
  };
}

/**
 * Links the contacts a write names to the Customer Database (lib/contactLinks linkContact): the
 * Customer's PIC (`picMode`: refused or left out when it is no contact of the customer) and the
 * Shipper / Consignee Contact (free text allowed). `pic: false` leaves the PIC for later.
 */
async function linkContacts(
  data: Record<string, unknown>,
  existing: ShipmentRecord | undefined,
  contactsOf: ContactsOnce,
  { picMode, pic = true }: { picMode: ContactMode; pic?: boolean },
): Promise<void> {
  await linkContact(data, existing, SHIPPER_CONTACT, contactsOf, "free");
  await linkContact(data, existing, CONSIGNEE_CONTACT, contactsOf, "free");
  if (pic) await linkContact(data, existing, CUSTOMER_PIC, contactsOf, picMode);
}

// Extra detail rows accepted alongside the shipment's own fields on create/update.
export interface DetailRows {
  containers?: ContainerLine[];
  cargoItems?: CargoItemLine[];
  cargoDimensions?: CargoDimensionLine[];
  commercialInvoices?: CommercialInvoiceLine[];
}

// How a shipment is made from a sales quote, alongside its own fields on create.
interface FromQuote {
  /** The reference of the quote the shipment is created from. */
  fromQuoteNumber?: string;
  /** Create it although a live shipment was already created from that quote. */
  allowSecondShipment?: boolean;
}

/**
 * What a create writes: the shipment's own fields (a blank priority allowed), plus its detail rows.
 * The job number is always the company's next one, given out when the shipment is stored.
 */
export type ShipmentCreateData = Omit<NewShipmentRecord, "companyId" | "jobNumber" | "customsPriority"> & BlankablePriority & DetailRows & FromQuote;

// What a create answers: the shipment, and for one made from a quote how each further step went.
export interface CreatedShipment {
  shipment: ShipmentItem;
  quoteLink?: QuoteLinkOutcome;
  costImport?: CostImportOutcome;
  /** Why containers or cargo lines were not saved although the shipment was created. */
  detailRowsError?: string;
}

// Why a step failed, as the answer of a create reports it: the sentence of whoever refused.
// Any other failure is in the log and not in the answer - a database error carries its whole
// statement and the values that went into it.
const reasonOf = (err: unknown): string => (err instanceof APIError ? err.message : "an unexpected error occurred");
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
    palletType: row.palletType as PalletType | null,
    adrUn: row.adrUn,
    adrClass: row.adrClass,
    adrPackingGroup: row.adrPackingGroup as AdrPackingGroup | null,
    adrLimitedQuantity: row.adrLimitedQuantity,
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
  const ids = containers.map((c) => c.id);
  cargoItems = withOnlyContainer(cargoItems, ids);
  cargoDimensions = withOnlyContainer(cargoDimensions, ids);
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

// Cargo lines may only point at containers of their own shipment. With exactly one
// container every line belongs to it (see withOnlyContainer), also one naming an id that
// is gone - e.g. sent from a screen opened before the only container was replaced, whose
// cargo moved to the new one. Otherwise a line naming another id (a container deleted
// meanwhile, whose cargo went with it; a foreign id) is dropped rather than coming back
// as shipment-level cargo.
function sanitizeContainerLinks<T extends { containerId?: string | null }>(lines: T[], validIds: Set<string>): T[] {
  if (validIds.size === 1) {
    const [only] = validIds;
    return lines.map((l) => (l.containerId === only ? l : { ...l, containerId: only! }));
  }
  return lines.filter((l) => !l.containerId || validIds.has(l.containerId));
}

// The one-container rule: when a shipment has exactly one container, every cargo line
// (dimensions and descriptions) belongs to it, also a line typed or imported before the
// container existed. Applied on every write and when a shipment is read, so Cargo
// Details, the grid's Dimensions dialog and the Matched check all see the same thing.
function withOnlyContainer<T extends { containerId?: string | null }>(lines: T[], containerIds: (string | undefined)[]): T[] {
  const only = containerIds.length === 1 ? containerIds[0] : undefined;
  return only ? lines.map((l) => (l.containerId ? l : { ...l, containerId: only })) : lines;
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
  "actualDeliveryDate",
  "shipmentsDate",
  "equipmentDeliveryDate",
]);
const MONEY_FIELDS = new Set(["selling", "buying"]);
// How many quotes one request may ask the shipments of: a page of the Quotes list at most.
const MAX_QUOTE_REFERENCES = 200;

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

// Refuses a quote no shipment may be linked to yet: one that is not Won. Named by the status it
// is shown with, so an expired quote is refused as Expired, not as the Quoted it is stored as.
function assertLinkable(quote: { quoteNumber: string; effectiveStatus: string }): void {
  const refusal = shipmentLinkRefusal(quote.effectiveStatus);
  if (refusal) throw APIError.failedPrecondition(`${quote.quoteNumber} - ${refusal}`);
}

// The company's users, read at most once per request and only when something needs them.
type UsersOnce = () => Promise<CompanyUser[]>;
function usersOnce(): UsersOnce {
  let users: Promise<CompanyUser[]> | undefined;
  return () => (users ??= companyUsers());
}

// What a sales quote says about its owner.
type QuoteOwner = { ownerUserId?: string | null; ownerName: string };

/**
 * A person a write names is a user of the company, stored by their lower-cased e-mail, or nobody
 * (""); anything else is refused, naming the field. A value the shipment already holds passes as
 * it is, so an old record whose person is no user yet can still be saved. Approved By may also be
 * the stamp a credit approval leaves ("<e-mail> — <when>").
 */
async function checkPeople(data: Record<string, unknown>, users: UsersOnce, existing?: ShipmentRecord): Promise<void> {
  const stored: Record<string, unknown> | undefined = existing;
  const fields: [string, string | null][] = [...Object.entries(PERSON_FIELDS), ["approvedBy", null]];
  for (const [key, label] of fields) {
    const value = data[key];
    if (typeof value !== "string") continue;
    const current = stored ? String(stored[key] ?? "") : null;
    if (current !== null && value.trim() === current.trim()) data[key] = current;
    else if (!value.trim()) data[key] = "";
    else data[key] = label ? requireUserEmail(value, label, await users()) : requireApprovedBy(value, await users());
  }
}

/**
 * The contact person a quote names becomes the Customer's PIC of the shipment made from it - by
 * the contact's id when the quote keeps it - unless the request names another (or nobody).
 */
function customerPicFromQuote(data: Record<string, unknown>, quoteData: unknown): void {
  const quote = (quoteData && typeof quoteData === "object" ? quoteData : {}) as Record<string, unknown>;
  const quoteName = typeof quote.customerContact === "string" ? quote.customerContact : "";
  const quoteId = typeof quote.customerContactId === "string" ? quote.customerContactId : "";
  if ("customerPicContactId" in data) return;
  const sent = data.customerPic;
  if (sent === undefined) {
    if (quoteName) data.customerPic = quoteName;
  } else if (typeof sent !== "string" || sent.trim().toLowerCase() !== quoteName.trim().toLowerCase()) {
    return;
  }
  if (quoteId) data.customerPicContactId = quoteId;
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

  // Who did something, as a stamp records it: the user's e-mail - people are recorded by it,
  // never by a display name. Looked up by id, else found in the company's users list. Users live
  // in the auth service, which this database cannot join against; an unresolvable user must not
  // fail the write - the stamp just records the time without who.
  private async actorOf(userId: string): Promise<string> {
    const email = await userEmailOf(userId);
    if (email) return email;
    try {
      return (await companyUsers()).find((u) => u.id === userId)?.email ?? "";
    } catch (err) {
      log.warn(err, "acting user not resolved", { userId });
      return "";
    }
  }

  // The sales person a shipment takes from its quote: the e-mail of the user who owns the quote.
  // A quote whose owner is no user record (an old one, owned by a typed name) gives the one user
  // that name fits. Empty when the owner is nobody, no user of the company now, or can't be told:
  // a name that is no user is never copied.
  private async quoteOwnerEmail(quote: QuoteOwner, users: UsersOnce): Promise<string> {
    if (quote.ownerUserId) return userEmailOf(quote.ownerUserId);
    if (!quote.ownerName.trim()) return "";
    try {
      return matchUser(quote.ownerName, await users())?.email ?? "";
    } catch (err) {
      log.warn(err, "quote owner not matched to a user");
      return "";
    }
  }

  // The quote a Sales Number names, checked before a shipment is linked to it: its owner, null
  // when the number names no quote - free-text sales numbers are allowed. A quote that is not
  // Won is refused. A quote reference that could not be checked refuses the
  // write as well: it would link the quote unchecked.
  private async linkableQuoteOwner(quoteNumber: string, allowUnfinished = false): Promise<QuoteOwner | null> {
    let quote;
    try {
      ({ quote } = await quotes.salesQuoteGet({ quoteNumber }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) return null;
      if (isSalesReference(quoteNumber) && !allowUnfinished) throw err;
      log.warn(err, "quote sales owner not resolved", { quoteNumber });
      return null;
    }
    if (!allowUnfinished) assertLinkable(quote);
    return quote;
  }

  // Persist the shipment's detail rows. Containers first — cargo lines are
  // validated against the resulting container ids.
  private async syncDetailRows(shipmentId: string, companyId: string, rows: DetailRows): Promise<void> {
    if (rows.containers !== undefined) {
      // With one container all cargo belongs to it, so it is the shipment's cargo: removing
      // or replacing that only container keeps the lines (they move to the new container, or
      // become shipment-level with none left). With two or more, a removed container's own
      // cargo goes with it (ON DELETE CASCADE).
      const before = await containerRepository.listByShipmentId(shipmentId, companyId);
      if (before.length === 1) {
        const lines = rows.containers;
        const keeps = lines.some((l) => l.id === before[0]!.id) || (lines.length > 0 && lines.every((l) => !l.id));
        if (!keeps) {
          await cargoItemRepository.detachFromContainers(shipmentId, companyId, [before[0]!.id]);
          await cargoDimensionRepository.detachFromContainers(shipmentId, companyId, [before[0]!.id]);
        }
      }
      await containerRepository.syncForShipment(shipmentId, companyId, rows.containers);
    }
    if (rows.containers !== undefined || rows.cargoItems !== undefined || rows.cargoDimensions !== undefined) {
      const containerIds = new Set((await containerRepository.listByShipmentId(shipmentId, companyId)).map((c) => c.id));
      if (rows.cargoItems !== undefined) {
        await cargoItemRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoItems, containerIds));
      }
      if (rows.cargoDimensions !== undefined) {
        await cargoDimensionRepository.replaceForShipment(shipmentId, companyId, sanitizeContainerLinks(rows.cargoDimensions, containerIds));
      }
      // Lines that stayed without a container (e.g. the first container was just added)
      // move to it when it is the only one.
      if (containerIds.size === 1) {
        const [only] = containerIds;
        await cargoItemRepository.assignLooseToContainer(shipmentId, companyId, only!);
        await cargoDimensionRepository.assignLooseToContainer(shipmentId, companyId, only!);
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
   * caller's company: an unknown id is refused and a blank one unlinks (the name stays as free
   * text). A linked party stores the customer's current name, whatever text came with the id, so
   * name and id never disagree; later renames reach it through the customer-changed event.
   */
  private async resolveCustomerLinks(data: Partial<NewShipmentRecord>): Promise<LinkedCustomers> {
    const links = [
      ["customerId", "customer", "customer"],
      ["shipperId", "shipper", "shipper"],
      ["consigneeId", "consignee", "consignee"],
      ["principalPartyId", "principalParty", "principal party"],
    ] as const;
    const linked: LinkedCustomers = {};
    await Promise.all(
      links.map(async ([key, nameKey, label]) => {
        if (!(key in data)) return;
        const id = data[key];
        if (!id) {
          data[key] = null;
          return;
        }
        try {
          const { customer } = await customers.customerGet({ id });
          linked[key] = customer;
          data[nameKey] = customer.companyName;
        } catch (err) {
          if (err instanceof APIError && err.code === ErrCode.NotFound) {
            throw APIError.invalidArgument(`Unknown ${label}`);
          }
          throw err;
        }
      }),
    );
    return linked;
  }

  /**
   * A shipper or consignee newly picked from the Customer Database fills its stop - the
   * shipper's pick-up, the consignee's delivery - from that customer's Pickup / Delivery
   * address, else its registered one, and its Contact (Customer Service, else Logistics
   * Manager, else anyone) by name and id. A write that sends the stop or the contact itself keeps
   * that part, as does a customer with no address or no contact.
   */
  private async fillPartyStops(data: Partial<NewShipmentRecord>, linked: LinkedCustomers, contactsOf: ContactsOnce, existing?: ShipmentRecord): Promise<void> {
    const parties = [
      ["shipper", "shipperId", "shipperContact", "shipperContactId"],
      ["consignee", "consigneeId", "consigneeContact", "consigneeContactId"],
    ] as const satisfies readonly (readonly [Party, keyof ShipmentRecord, keyof ShipmentRecord, keyof ShipmentRecord])[];
    const written: Record<string, unknown> = data;
    const sent = (key: string) => !!String(written[key] ?? "").trim();
    await Promise.all(
      parties.map(async ([party, idKey, contactKey, contactIdKey]) => {
        const id = data[idKey];
        const customer = linked[idKey];
        if (!id || !customer || id === existing?.[idKey]) return;
        const keys = stopKeys(party);
        const fillStop = !Object.values(keys).some(sent);
        const fillContact = !sent(contactKey) && !sent(contactIdKey);
        if (!fillStop && !fillContact) return;
        const [{ data: addresses }, contacts] = await Promise.all([
          fillStop ? customers.addressList({ customerId: id }) : { data: [] },
          fillContact ? contactsOf(id) : [],
        ]);
        const stop = fillStop ? partyStop(party, customer, addresses) : null;
        if (stop) for (const field of Object.keys(keys) as (keyof typeof keys)[]) written[keys[field]] = stop[field];
        const contact = partyContact(contacts);
        if (contact) {
          written[contactKey] = contact.name.trim();
          written[contactIdKey] = contact.id;
        }
      }),
    );
  }

  // Tells the services that copied the shipment's Customer / Customer's PIC (the warehouse gate
  // record, …) that either changed. The shipment is saved by then, so a failure is logged and the
  // copy stays as it was until the next change.
  private async tellParties(companyId: string, shipment: ShipmentRecord): Promise<void> {
    try {
      await shipmentPartiesChanged.publish({ companyId, shipmentId: shipment.id, customer: shipment.customer, customerPic: shipment.customerPic });
    } catch (err) {
      log.warn(err, "shipment parties change not published", { companyId, shipmentId: shipment.id });
    }
  }

  /** The classified documents uploaded to one shipment, with their customs review. */
  private async documentsOf(id: string, companyId: string): Promise<ShipmentDocument[]> {
    const rows = await shipmentAttachmentRepository.documentTypesByShipmentIds([id], companyId);
    return rows.filter((r) => r.documentType);
  }

  // Tells the quote a Sales Number names which shipments carry that number now. Called after a
  // shipment write that changed it; such a write must not fail because the quote could not be
  // told, so a failure is logged and the company marked - the next reconcile repairs the link.
  private async tellQuote(companyId: string, salesNumber: string): Promise<void> {
    try {
      await quoteLinksService.syncReference(companyId, salesNumber);
    } catch (err) {
      log.warn(err, "the quote of a shipment could not be told about it", { companyId, salesNumber });
      quoteLinksService.markDirty(companyId);
    }
  }

  // A shipment made from a sales quote: it carries the quote as its Sales Number, the quote
  // becomes Won and its cost lines arrive in Costs Breakdown. Three databases, no transaction
  // across them - so the order is shipment, then quote, then costs, and once the shipment
  // exists nothing fails the request any more: each further step is tried on its own and the
  // answer says which one did not work, so it can be done again by itself.
  private async createFromQuote(
    companyId: string,
    quoteNumber: string,
    allowSecond: boolean,
    shipmentData: NewShipmentData,
    rows: DetailRows,
    users: UsersOnce,
    contactsOf: ContactsOnce,
  ): Promise<CreatedShipment> {
    let quote;
    try {
      ({ quote } = await quotes.salesQuoteGet({ quoteNumber }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw APIError.invalidArgument(`quote ${quoteNumber} not found`);
      throw err;
    }
    // An open or expired quote is made Won by the shipment created from it (below); a Lost or
    // Replaced one would stay as it is, so none is made from it.
    const refusal = shipmentFromQuoteRefusal(quote.effectiveStatus);
    if (refusal) throw APIError.failedPrecondition(`${quote.quoteNumber} - ${refusal}`);
    customerPicFromQuote(shipmentData, quote.data);
    await linkContact(shipmentData, undefined, CUSTOMER_PIC, contactsOf, "lenient");
    const reference = quote.quoteNumber;
    // Whoever owns the quote sold the shipment - unless the request names somebody itself.
    if (!(shipmentData.salesPerson ?? "").trim()) {
      const owner = await this.quoteOwnerEmail(quote, users);
      if (owner) shipmentData.salesPerson = owner;
    }

    const made = await shipmentRepository.createFromQuote(companyId, reference, shipmentData, allowSecond);
    if ("existing" in made) {
      const { id, jobNumber } = made.existing;
      throw APIError.alreadyExists(`shipment ${jobNumber} was already created from quote ${reference}`).withDetails({ shipmentId: id, jobNumber });
    }
    const shipment = made.created;

    let detailRowsError: string | undefined;
    try {
      await this.syncDetailRows(shipment.id, companyId, rows);
    } catch (err) {
      log.warn(err, "the cargo lines of a shipment created from a quote were not saved", { companyId, shipmentId: shipment.id });
      detailRowsError = reasonOf(err);
    }
    await this.recalcCustomerRollups(shipment.customerId, companyId);

    let quoteLink: QuoteLinkOutcome;
    try {
      const synced = await quoteLinksService.syncReference(companyId, reference, { wonByShipmentId: shipment.id });
      quoteLink = synced?.found
        ? { linked: synced.shipmentId !== null, becameWon: synced.becameWon, quoteStatus: synced.status, note: synced.note ?? undefined }
        : { linked: false, becameWon: false, quoteStatus: null, error: `quote ${reference} could not be linked` };
    } catch (err) {
      log.warn(err, "the quote a shipment was created from could not be told about it", { companyId, shipmentId: shipment.id, reference });
      quoteLinksService.markDirty(companyId);
      quoteLink = { linked: false, becameWon: false, quoteStatus: null, error: reasonOf(err) };
    }

    let costImport: CostImportOutcome;
    try {
      costImport = await invoicing.invoicingImportQuote({ shipmentId: shipment.id, quoteNumber: reference, target: "both" });
    } catch (err) {
      log.warn(err, "the costs of a quote were not copied to the shipment created from it", { companyId, shipmentId: shipment.id, reference });
      costImport = { buying: 0, selling: 0, error: reasonOf(err) };
    }

    return { shipment: (await this.getById(shipment.id, companyId))!, quoteLink, costImport, detailRowsError };
  }

  /**
   * `creatorUserId` is the signed-in user creating the shipment: Created By is then stamped
   * here from that user. Without it (a caller inside the backend, e.g. Trucking's road jobs)
   * the caller's own createdBy is kept. `allowUnfinishedQuote`: the Sales Number may name a quote
   * that is not Won - Trucking's road jobs, made for an order as it comes.
   */
  async create(companyId: string, data: ShipmentCreateData, creatorUserId?: string, { allowUnfinishedQuote = false } = {}): Promise<CreatedShipment> {
    const { containers, cargoItems, cargoDimensions: sentDimensions, commercialInvoices, fromQuoteNumber, allowSecondShipment, ...rest } = data;
    assertValidContainerNumbers(containers);
    const cargoDimensions = normalizeCargoDimensions(sentDimensions);
    const shipmentData = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });
    const users = usersOnce();
    await checkPeople(shipmentData, users);
    // Who created it, by e-mail ("" when nobody can tell); when is the row's createdAt ("Created on").
    if (creatorUserId) shipmentData.createdBy = (await this.actorOf(creatorUserId)).trim();
    Object.assign(shipmentData, normalizeStops(shipmentData));
    // A new shipment has no paperwork yet, so its customs status starts where the paperwork does.
    delete shipmentData.customsStatus;
    // The starting status belongs to the shipment's Trade Direction.
    const directionStatus = statusForDirection(shipmentData.status ?? "", shipmentData.tradeDirection ?? "");
    if (directionStatus) shipmentData.status = directionStatus;
    const stored: Record<string, unknown> = shipmentData;
    normalizeCustomsPriority(stored, (key) => stored[key] as string);
    const linked = await this.resolveCustomerLinks(shipmentData);
    const contactsOf = contactsOnce();
    await this.fillPartyStops(shipmentData, linked, contactsOf);
    const fromQuote = fromQuoteNumber?.trim();
    // On create a Customer's PIC that is no contact of the customer is left out, not refused. One
    // made from a quote is settled once the quote is read (it may name the contact).
    await linkContacts(shipmentData, undefined, contactsOf, { picMode: "lenient", pic: !fromQuote });
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

    if (fromQuote) {
      return this.createFromQuote(companyId, fromQuote, allowSecondShipment === true, shipmentData, { containers, cargoItems, cargoDimensions, commercialInvoices }, users, contactsOf);
    }

    // The Sales Number is stored trimmed: it is what a quote finds its shipments by.
    const salesNumber = (shipmentData.salesNumber ?? "").trim();
    if ("salesNumber" in shipmentData) shipmentData.salesNumber = salesNumber;
    // A shipment created against a quote inherits that quote's sales owner.
    if (salesNumber) {
      const quote = await this.linkableQuoteOwner(salesNumber, allowUnfinishedQuote);
      const owner = quote && !(shipmentData.salesPerson ?? "").trim() ? await this.quoteOwnerEmail(quote, users) : "";
      if (owner) shipmentData.salesPerson = owner;
    }
    const shipment = await shipmentRepository.createWithJobNumber(companyId, shipmentData);
    await this.syncDetailRows(shipment.id, companyId, { containers, cargoItems, cargoDimensions, commercialInvoices });
    await this.recalcCustomerRollups(shipment.customerId, companyId);
    // A quote number typed as Sales Number links that quote to the shipment, without marking it Won.
    await this.tellQuote(companyId, salesNumber);
    return { shipment: (await this.getById(shipment.id, companyId))! };
  }

  // The CZ job number the next shipment of this company would get (a per-company sequence over
  // all rows incl. archived, so a reference is never reused within the company). Only a preview:
  // the number is taken when the shipment is stored, so a parallel create may get this one first.
  async nextJobNumber(companyId: string): Promise<string> {
    return shipmentRefCounterRepository.peek(companyId, "CZ");
  }

  async update(id: string, companyId: string, data: ShipmentUpdateData, userId: string): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");

    const { containers, cargoItems, cargoDimensions: sentDimensions, commercialInvoices, ...rest } = data;
    assertValidContainerNumbers(containers);
    const cargoDimensions = normalizeCargoDimensions(sentDimensions);
    const shipmentData: Partial<NewShipmentRecord> = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });
    const users = usersOnce();
    await checkPeople(shipmentData, users, existing);
    Object.assign(shipmentData, normalizeStops(shipmentData, existing));

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
    const linked = await this.resolveCustomerLinks(shipmentData);
    const contactsOf = contactsOnce();
    await this.fillPartyStops(shipmentData, linked, contactsOf, existing);
    // An edit naming a Customer's PIC that is no contact of the customer is refused.
    await linkContacts(shipmentData, existing, contactsOf, { picMode: "strict" });

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
      shipmentData.approvedBy = actionStamp(await this.actorOf(userId), new Date());
    }

    // Assigning a quote number hands the shipment to whoever sold it: the
    // quote's sales owner becomes the shipment's sales person. Only on a real
    // change, and never over a salesPerson set in the same request.
    // The Sales Number is stored trimmed: it is what a quote finds its shipments by.
    if (typeof shipmentData.salesNumber === "string") shipmentData.salesNumber = shipmentData.salesNumber.trim();
    const previousSalesNumber = existing.salesNumber.trim();
    const nextSalesNumber = shipmentData.salesNumber;
    const salesNumberChanged = nextSalesNumber !== undefined && nextSalesNumber !== previousSalesNumber;
    if (salesNumberChanged && nextSalesNumber) {
      const quote = await this.linkableQuoteOwner(nextSalesNumber);
      const owner = quote && !("salesPerson" in shipmentData) ? await this.quoteOwnerEmail(quote, users) : "";
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

    const updated = Object.keys(shipmentData).length > 0 ? await shipmentRepository.updateForCompany(id, companyId, shipmentData) : null;
    if (truck && plateTyped) {
      await shipmentRepository.setTruckPlate(companyId, truck, shipmentData.plateNumber ?? "");
    }

    // Recalc for the new customer, and for the old one when the link moved.
    const newCustomerId = "customerId" in shipmentData ? shipmentData.customerId : existing.customerId;
    await this.recalcCustomerRollups(newCustomerId, companyId);
    if (existing.customerId && existing.customerId !== newCustomerId) {
      await this.recalcCustomerRollups(existing.customerId, companyId);
    }
    if (updated && (updated.customer !== existing.customer || updated.customerPic !== existing.customerPic)) {
      await this.tellParties(companyId, updated);
    }

    // A changed Sales Number takes the shipment from one quote and gives it to another: both
    // are told, the new one without being marked Won.
    if (salesNumberChanged) {
      await this.tellQuote(companyId, nextSalesNumber ?? "");
      await this.tellQuote(companyId, previousSalesNumber);
    }

    return (await this.getById(id, companyId))!;
  }

  // What the company's shipments say about its customers, for the pipeline of the sales service:
  // for each customer its first shipment - what "ordered" means there - its newest, and how many.
  /** The live shipments that name a quote reference in their Sales Number, the oldest first. */
  /** Of the given ids, the live shipments of this customer (bad ids are simply not theirs). */
  async idsOfCustomer(companyId: string, customerId: string, ids: string[]): Promise<string[]> {
    if (!isUuid(customerId)) return [];
    return shipmentRepository.idsOfCustomer(companyId, customerId, ids.filter(isUuid));
  }

  async shipmentsNamingQuote(companyId: string, reference: string): Promise<{ id: string; jobNumber: string }[]> {
    return shipmentRepository.liveBySalesNumber(companyId, reference.trim());
  }

  /**
   * A Won quote was revised: the live shipments that name `from` in their Sales Number name its
   * revision `to` instead, each with a line in its history, and both quotes are told (the one
   * gives the shipments up, the other takes them). Returns the job numbers moved.
   */
  async moveQuoteReference(companyId: string, userId: string, from: string, to: string): Promise<string[]> {
    const previous = from.trim();
    const next = to.trim();
    if (!previous || !next || previous === next) return [];
    const naming = await shipmentRepository.liveBySalesNumber(companyId, previous);
    for (const shipment of naming) {
      await shipmentAuditRepository.create({ companyId, shipmentId: shipment.id, userId, field: "salesNumber", oldValue: previous, newValue: next });
      await shipmentRepository.updateForCompany(shipment.id, companyId, { salesNumber: next });
    }
    if (naming.length > 0) {
      await this.tellQuote(companyId, next);
      await this.tellQuote(companyId, previous);
    }
    return naming.map((shipment) => shipment.jobNumber);
  }

  /**
   * The live shipments that name each of `references` as their Sales Number, the oldest first:
   * what the Quotes list counts and lists per quote. Every reference asked for is answered, one
   * no shipment names with none.
   */
  async shipmentsNamingQuotes(companyId: string, references: string[]): Promise<QuoteShipments[]> {
    // Counted as sent, before any of them is looked at.
    if (references.length > MAX_QUOTE_REFERENCES) throw APIError.invalidArgument(`At most ${MAX_QUOTE_REFERENCES} quotes at once`);
    const wanted = [...new Set(references.map((reference) => reference.trim()).filter(Boolean))];
    const byReference = new Map(wanted.map((reference): [string, QuoteShipments["shipments"]] => [reference, []]));
    for (const { reference, ...shipment } of await shipmentRepository.liveBySalesNumbers(companyId, wanted)) {
      byReference.get(reference)?.push(shipment);
    }
    return [...byReference].map(([reference, shipments]) => ({ reference, shipments }));
  }

  async customerFacts(companyId: string): Promise<{ customers: CustomerShipmentFacts[]; shipmentsWithoutCustomer: number }> {
    const facts = await shipmentRepository.customerFacts(companyId);
    return {
      customers: facts.customers.map((customer) => ({
        ...customer,
        firstShipmentAt: iso(customer.firstShipmentAt),
        lastShipmentAt: iso(customer.lastShipmentAt),
      })),
      shipmentsWithoutCustomer: facts.shipmentsWithoutCustomer,
    };
  }

  // Tells the quote the shipment names about it once more, and passes on what the quote
  // answers or why it could not be asked: the retry after a create that could not tell the
  // quote (`markWon`: the shipment was created from it), and "Link now" on a shipment whose
  // quote does not know it.
  /**
   * markWon - "the shipment was created from the quote, make it Won" - is taken only when that is
   * a fact: the server created this shipment from its Sales Number quote, or a sales manager says
   * so. Anyone else gets the link alone, so nobody can decide a colleague's quote by naming it.
   */
  async linkQuote(id: string, actor: Actor, markWon: boolean): Promise<QuoteSyncResult> {
    const companyId = actor.companyID;
    // What is not an id names no shipment, and is kept from SQL.
    const existing = isUuid(id) ? await shipmentRepository.getByIdForCompany(id, companyId) : null;
    if (!existing) throw APIError.notFound("Shipment not found");
    const won = markWon && (existing.createdFromQuote || canManageSales(actor.role));
    const synced = await quoteLinksService.syncReference(companyId, existing.salesNumber.trim(), won ? { wonByShipmentId: id } : {});
    if (!synced) throw APIError.failedPrecondition("the Sales Reference of this shipment is not the reference of a sales quote");
    return synced;
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
    // The quote the shipment named loses it - and with its last shipment a Won it owed to one.
    await this.tellQuote(companyId, existing.salesNumber.trim());
  }

  // Release the house bill of lading, recording who released it and when.
  // A release is a one-off act: once stamped, the record stands — re-releasing
  // returns the shipment untouched rather than rewriting who did it.
  async releaseHouseBol(id: string, companyId: string, userId: string): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    if (existing.houseBolRelease.trim()) return (await this.getById(id, companyId))!;

    const stamp = actionStamp(await this.actorOf(userId), new Date());
    return this.update(id, companyId, { houseBolRelease: stamp }, userId);
  }

  /**
   * The backfill after people became users picked by e-mail (owner decision, 26 Oct 2026): a name
   * typed into the company's live shipments before - in a person field or in the Created By,
   * Approved By or House BoL Release stamp - becomes the e-mail of the one user it fits. A name
   * that fits nobody or more than one user stays and is reported. Running it again changes
   * nothing more. No history lines: the values mean the same person as before.
   */
  async normalizePeople(companyId: string): Promise<PeopleNormalizeResult> {
    const users = await companyUsers();
    const plan = planPeopleNormalize(await shipmentRepository.peopleOf(companyId), users);
    const changed = await shipmentRepository.rewritePeople(companyId, plan.rewrites);
    return { checked: plan.checked, changed, unmatched: plan.unmatched };
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
