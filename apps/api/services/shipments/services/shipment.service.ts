import { APIError, ErrCode } from "encore.dev/api";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import type { Actor } from "../../../lib/rbac";
import { canManageSales, shipmentFromQuoteBlocked, shipmentFromQuoteRefusal, shipmentLinkRefusal } from "../../../lib/salesPolicy";
import { isSalesReference, plainSalesReference, sameSalesReference } from "../../../lib/salesReference";
import log from "encore.dev/log";
import { auth, customers, invoicing, quotes, warehouse } from "~encore/clients";
import { shipmentAttachmentRepository } from "../repositories/shipmentAttachment.repository";
import type { Tx } from "../db/db";
import { shipmentRepository, ATTENTION_TILE, type NewShipmentData, type ShipmentReference } from "../repositories/shipment.repository";
import { shipmentAuditRepository } from "../repositories/shipmentAudit.repository";
import { masterJobRepository } from "../repositories/masterJob.repository";
import { shipmentRefCounterRepository } from "../repositories/shipmentRefCounter.repository";
import { containerRepository } from "../repositories/container.repository";
import { cargoItemRepository } from "../repositories/cargoItem.repository";
import { cargoDimensionRepository } from "../repositories/cargoDimension.repository";
import { commercialInvoiceRepository } from "../repositories/commercialInvoice.repository";
import { carrierCodeOf } from "../lib/carriers";
import { EXCEPTIONS_CLOSED_BY, eventsFromChanges, heldFieldChanges, lastEventOf, ticksFromChanges, type TrackingSource } from "../lib/trackingEvents";
import { shipmentTaskRepository } from "../repositories/shipmentTask.repository";
import { shipmentTrackingEventRepository } from "../repositories/shipmentTrackingEvent.repository";
import { invalidContainerNumber, invoiceValueByCurrency, isValidContainerNumber, matchContainerRows, normalizeContainerNumber, projectCargo } from "../lib/cargoProjection";
import { CANCELLED_STATUS, actionStamp, cancelReasonRefusal, isCancelling, cfsDefault, exportBolDefaults, isCreditApproval, isCreditApproved, startingStateDefaults, startingStatusFor, statusForDirection } from "../lib/fieldDefaults";
import { USER_ID_COLUMNS, USER_ID_FIELDS, linkedUser, mayNameUser } from "../lib/userLinks";
import { quoteLinksService } from "./quoteLinks.service";
import { needsAttentionService } from "./needsAttention.service";
import type { NamingShipment, ShipmentListFilters } from "../repositories/shipment.repository";
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
  ReferenceNormalizeResult,
  QuoteLinkOutcome,
  QuoteShipments,
  QuoteSyncResult,
  ShipmentsNeedingAttention,
  ShipmentItem,
  ShipmentTileCounts,
  RemeasureAcceptance,
  CustomsPriority,
  PalletType,
  AdrPackingGroup,
  SearchShipmentsResponse,
  SearchContainersResponse,
} from "../interfaces/interfaces";
import { mainSearchNumber } from "../../../lib/mainSearch";
import { iso } from "../../../lib/db/serialize";
import { constraintOf, isUniqueViolation } from "../../../lib/db/errors";
import { billOfLadingKey } from "../../../lib/billOfLading";
import { deliverShipmentPushes, owePushes } from "./shipmentPush.service";
import { isUuid } from "../../../lib/uuid";
import { publicFields } from "../lib/rows";
import { changesTaxDate } from "../lib/taxDate";
import { masterJobNumberFor } from "../lib/masterJobNumber";
import { houseLoadTypeProblem } from "../lib/masterJobKind";
import { customsOfficeForProcedure, customsOfficeLockRefusal, customsOfficeRefusal } from "../lib/customsOffice";
import {
  approvedByLockRefusal,
  blDateRefusal,
  cancelInvoicedRefusal,
  INVOICED_STATUS_LOCKED,
  INVOICED_UNCHECKED,
  leavesInvoicedStatus,
  COSTS_CHECK_REFUSAL,
  creditCheckLockRefusal,
  customerRoleRefusal,
  DETAILS_REFUSAL,
  isInvoicingDepartment,
  SALES_REFERENCE_INVOICED,
  invoicedRefusal,
  isDetailsManager,
  isInvoicedStatus,
  isOpenToPerson,
  touchesDetails,
  warehouseReceivedRefusal,
  warehouseReleaseRefusal,
} from "../lib/shipmentEditRule";
import { dangerousFromAdr, normalizeCargoDimensions, normalizeStops } from "../lib/roadFreight";
import { detailRowChanges, type DetailRowLists } from "../lib/detailRowsAudit";
import { partyContact, partyStop, stopKeys, type Party } from "../lib/partyAddress";
import { AGENT_CONTACT, CONSIGNEE_CONTACT, CUSTOMER_PIC, SHIPPER_CONTACT, linkContact, type ContactMode } from "../lib/contactLinks";
import { shipmentPartiesChanged } from "../topics";
import { deliverShipmentEvents } from "./shipmentEvents.service";
import { INVOICED_STATUS, jobNumberFor, referenceIsFinal } from "../lib/jobNumber";
import { jobNumberDigits } from "../../../lib/jobNumber";
import { companyUsers, matchUser, requireUserEmail, userEmailOf, type CompanyUser } from "../../../lib/companyUsers";
import { PERSON_FIELDS, planPeopleNormalize, requireApprovedBy } from "../lib/people";
import { assertTimes, clearStaleTimes } from "../lib/dateTimes";
import { dropSharesOfLeftShipments } from "../lib/masterJobCosts";
import { startShipmentBilling } from "../lib/shipmentBilling";
import { overrideLine, passOverride, prepaymentStop, RELEASE_CHANGED_MEANWHILE, setsWarehouseRelease, type PaymentCheck, type ReleaseKind, type ReleaseOverride } from "../lib/prepaymentStop";
import { RELEASE_REQUEST_FIELD, WHAT_OF_KIND, approvedReason, closedLine, passDecidedSince, unusedLine } from "../lib/releaseRequest";
import { shipmentReleaseOverrideRepository } from "../repositories/shipmentReleaseOverride.repository";
import { shipmentReleaseRequestRepository } from "../repositories/shipmentReleaseRequest.repository";
import {
  ALREADY_ACCEPTED,
  CARGO_DETAILS_CHANGED,
  REMEASURE_ACCEPTED,
  REMEASURE_COSTS_CHECKED,
  acceptByHandRefusal,
  acceptRefusal,
  alreadyAccepted,
  acceptedContainerFigures,
  acceptedDimensionLines,
  acceptedLinesOf,
  acceptedTotals,
  exactFiguresOf,
  parseRemeasuredLines,
  readFigures,
  roundedFigures,
  sameCargoDetails,
  type CargoDetailsRead,
  type RemeasuredLine,
} from "../lib/remeasureAccept";
import { CARGO_LINES_CHANGED, sameCargoLines } from "../lib/cargoLinesGuard";
import { keepsReleasedDay } from "../lib/gateReleasedDay";
import { PREPAYMENT_UNCHECKED_FIELD, PREPAYMENT_UNCHECKED_LINE } from "../lib/releaseUnchecked";
import { dimensionFiguresFilled } from "../lib/remeasureNotice";

// The customers a write links to, by the field holding the link: read once, for the link check
// and for the party fill after it.
type LinkedCustomer = Awaited<ReturnType<typeof customers.customerGet>>["customer"];
type LinkedCustomers = Partial<Record<"customerId" | "shipperId" | "consigneeId" | "agentId" | "principalPartyId", LinkedCustomer>>;

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
  await linkContact(data, existing, AGENT_CONTACT, contactsOf, "free");
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
  /** The House B/L a document reading creates the shipment for: each House B/L once (createForHouseBol). */
  fromHouseBol?: string;
}

/**
 * What a create writes: the shipment's own fields (a blank priority allowed), plus its detail rows.
 * The job number is always the company's next one, given out when the shipment is stored.
 */
export type ShipmentCreateData = Omit<NewShipmentRecord, "companyId" | "jobNumber" | "jobNumberFinal" | "customsPriority"> & BlankablePriority & DetailRows & FromQuote;

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
/**
 * What an update may write: any of the shipment's own fields, plus its detail rows. Whether the
 * reference is final is not one of them: only Invoicing marks it (finalizeReference).
 */
export type ShipmentUpdateData = Partial<Omit<NewShipmentRecord, "customsPriority" | "jobNumberFinal">> & BlankablePriority & DetailRows;

/**
 * What an update was decided on, checked again on the shipment as its write turn finds it, before
 * anything is written: it throws to refuse the write, and then nothing of it is stored. For an
 * action that reads the shipment, decides and only then writes (releasing the House BoL, an
 * approved Customs Office): a write of the shipment made in between is seen here.
 */
export type StillHolds = (current: ShipmentRecord) => void;

/** What a release brings along to an update (the prepayment stop, lib/prepaymentStop). */
export interface ReleaseExtras {
  /** A manager's reason to set Warehouse Released on a job on prepayment that is not paid. */
  paymentOverrideReason?: string;
  /** The House BoL release's override, decided before the write (releaseHouseBol): recorded in its write turn. */
  houseBolOverride?: ReleaseOverride;
  /**
   * The app's own write of Warehouse Released (the gate's outbox, council round 4): the day is set only while the
   * shipment's day is empty or one of these (the days the gate's own releases wrote), checked in the write turn - a
   * day a person set in Shipments between the gate's read and this write stays. Left out, the day is written as sent.
   */
  warehouseReleasedReplaces?: readonly string[];
  /** Lines of the shipment's history the write adds in its own turn (an accepted remeasurement). */
  history?: { field: string; oldValue: string | null; newValue: string | null }[];
  /**
   * The caller's own write, done in the shipment's write turn once its row is saved, so the two land
   * together or not at all (the cover job marking the Holiday Cover it sets). It throws to refuse the write.
   */
  alongside?: (tx: Tx) => Promise<void>;
  /**
   * What the caller decided on besides the shipment's row (its containers and cargo lines, an
   * acceptance's history), checked again first in the write turn, before anything is written - the
   * async, in-transaction kin of StillHolds. It throws to refuse the write.
   */
  stillHoldsInTurn?: (tx: Tx) => Promise<void>;
  /**
   * The cargo dimension lines the page saving them started from (Cargo Details, mock test council
   * Y10): the write's lines are saved only while the shipment still holds these, else it is refused
   * (CARGO_LINES_CHANGED) - a page opened before an accepted remeasurement or a colleague's save
   * would write its old lines back over theirs. Left out, the lines are saved as sent.
   */
  expectedCargoDimensions?: CargoDimensionLine[];
}

// The most open jobs of a customer one answer lists (Accounts Receivable's work not yet invoiced).
const MAX_OPEN_JOBS = 5000;

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
    dimensionUnit: row.dimensionUnit === "in" ? "in" : "cm",
    weightPerPcKg: row.weightPerPcKg,
    volumePerPcM3: row.volumePerPcM3,
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
  licensePlate: string;
  documentTypes: string[];
  customsStatus: string;
  lastEvent: string;
};

// The Pick-up tab's License Plates, by shipment. A column of the grids: when the warehouse service
// doesn't answer, the column stays empty rather than the whole list failing.
async function pickupPlates(shipmentIds: string[], companyId: string): Promise<Map<string, string>> {
  if (shipmentIds.length === 0) return new Map();
  try {
    const { plates } = await warehouse._internalPickupPlates({ companyId, shipmentIds });
    return new Map(plates.map((p) => [p.shipmentId, p.licensePlate]));
  } catch (err) {
    log.warn(err, "pick-up license plates not read");
    return new Map();
  }
}

// The API shape of an enriched shipment: dates as ISO strings, no tenant/soft-delete columns.
function toShipmentItem(s: EnrichedShipment): ShipmentItem {
  const { createdAt, updatedAt, ...rest } = publicFields(s);
  return { ...rest, createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
}

// Checked before anything is written, so a bad number never leaves a half-saved shipment. `stored`:
// the shipment's containers as they are - a number one already has is not asked again (n19).
function assertValidContainerNumbers(containers: ContainerLine[] | undefined, stored: readonly ContainerLine[] = []) {
  const bad = invalidContainerNumber(containers, stored);
  if (bad !== undefined) {
    throw APIError.invalidArgument(`Container number "${bad}" must be 4 letters followed by 7 digits (e.g. MSKU1234567)`);
  }
}

// Cargo lines may only point at containers of their own shipment. With exactly one
// container every line belongs to it (see withOnlyContainer), also one naming an id that
// is gone - e.g. sent from a screen opened before the only container was replaced, whose
// cargo moved to the new one. Otherwise a line naming another id (a container deleted
// meanwhile, whose cargo went with it; a foreign id) is dropped rather than coming back
// as shipment-level cargo - except a line naming `keptCargoOf`, the only container the
// same write removed: its cargo stays with the shipment, so the line becomes shipment-level.
function sanitizeContainerLinks<T extends { containerId?: string | null }>(lines: T[], validIds: Set<string>, keptCargoOf?: string): T[] {
  if (validIds.size === 1) {
    const [only] = validIds;
    return lines.map((l) => (l.containerId === only ? l : { ...l, containerId: only! }));
  }
  return lines.flatMap((l) => {
    if (!l.containerId || validIds.has(l.containerId)) return [l];
    return l.containerId === keptCargoOf ? [{ ...l, containerId: null }] : [];
  });
}

// A cargo line naming a client-made container id the stored container could not keep (another
// container already had it) names the id the container got instead.
function followRenamed<T extends { containerId?: string | null }>(lines: T[], renamed: Map<string, string>): T[] {
  if (!renamed.size) return lines;
  return lines.map((l) => {
    const id = l.containerId ? renamed.get(l.containerId) : undefined;
    return id ? { ...l, containerId: id } : l;
  });
}

const hasDetailRows = ({ containers, cargoItems, cargoDimensions, commercialInvoices }: DetailRows) =>
  containers !== undefined || cargoItems !== undefined || cargoDimensions !== undefined || commercialInvoices !== undefined;

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
  "amsDeadline",
  "isfDeadline",
  "etaWarehouse",
  "warehouseReceivedDate",
  "warehouseReleasedDate",
  "plannedDeliveryDate",
  "actualDeliveryDate",
  "shipmentsDate",
  "equipmentDeliveryDate",
  "originalsReceivedDate",
  "telexReleaseReceivedDate",
  "deliveryOrderDate",
]);
const MONEY_FIELDS = new Set(["selling", "buying"]);
// How many quotes one request may ask the shipments of: a page of the Quotes list at most.
const MAX_QUOTE_REFERENCES = 200;
// The most quote references a job number filter finds: a few letters of a job number match many shipments.
const MAX_REFERENCES_BY_JOB = 1000;
// The reference backfill asks Invoicing about this many shipments at a time, right before it
// renames them: the answer is the fresher for it (a job may be invoiced while the backfill runs).
const NORMALIZE_CHUNK = 50;

// Requests may send "" for the customs priority; it is stored as Standard.
type BlankablePriority = { customsPriority?: CustomsPriority | "" };

function sanitizeTypedFields<T extends BlankablePriority>(
  data: T,
): Omit<T, "customsPriority"> & { customsPriority?: CustomsPriority } {
  const out: Record<string, unknown> = { ...data };
  assertTimes(out);
  for (const key of Object.keys(out)) {
    if (out[key] !== "") continue;
    if (DATE_FIELDS.has(key)) out[key] = null;
    else if (MONEY_FIELDS.has(key)) out[key] = "0";
    // Customs Priority is never blank: a shipment is Standard until someone marks it Urgent.
    else if (key === "customsPriority") out[key] = "Standard";
  }
  return out as Omit<T, "customsPriority"> & { customsPriority?: CustomsPriority };
}

// The import's B/L in hand (D31): each a real day, stored trimmed - Postgres would refuse anything
// else with an error the user can't read - and never a day still to come (lib/shipmentEditRule
// blDateRefusal). `existing`: the job as it is, none for one being created.
const BL_DATES = { originalsReceivedDate: "Originals Received", telexReleaseReceivedDate: "Telex Release Received", deliveryOrderDate: "Delivery Order" } as const;

function assertBlDates(data: Record<string, unknown>, existing?: Partial<Record<keyof typeof BL_DATES, string | null>>): void {
  const today = businessDay(new Date());
  for (const key of Object.keys(BL_DATES) as (keyof typeof BL_DATES)[]) {
    const value = data[key];
    if (typeof value !== "string") continue;
    const day = value.trim();
    if (day && !isRealYmd(day)) throw APIError.invalidArgument(`${BL_DATES[key]} must be a date as "YYYY-MM-DD"`);
    const future = blDateRefusal(BL_DATES[key], day, existing?.[key], today);
    if (future) throw APIError.invalidArgument(future);
    data[key] = day || null;
  }
}

/**
 * Why the write may not cancel the job (lib/fieldDefaults cancelReasonRefusal), checked before
 * anything else is asked; the reason is stored trimmed. `existing`: the job as it is, none for a
 * job being created - which, created already Cancelled Shipment, needs a reason as well.
 */
function assertCancelReason(data: Record<string, unknown>, existing?: Pick<ShipmentRecord, "status">): void {
  if (typeof data.cancelReason === "string") data.cancelReason = data.cancelReason.trim();
  if (!("status" in data)) return;
  const refusal = cancelReasonRefusal(existing?.status ?? "", data.status as string | null | undefined, data.cancelReason);
  if (refusal) throw APIError.invalidArgument(refusal);
}

/**
 * The history line of a job created already cancelled: its reason, as an edit that cancels writes
 * it (field cancelReason). Null when it is not created cancelled, or nobody signed in creates it
 * (the line needs a user; no app write creates a cancelled job).
 */
function cancelLineOfNew(data: { status?: string | null; cancelReason?: string | null }, creatorUserId: string | undefined): { userId: string; reason: string } | null {
  const cancelled = (data.status ?? "").trim() === CANCELLED_STATUS;
  return cancelled && creatorUserId && data.cancelReason ? { userId: creatorUserId, reason: data.cancelReason } : null;
}

const WAREHOUSE_DATES = { warehouseReceivedDate: "Warehouse Received", warehouseReleasedDate: "Warehouse Released" } as const;

// A person's write of the warehouse dates (lib/shipmentEditRule): each a real day, trimmed so a
// padded one can't slip past the check of today; Warehouse Received under the warehouse's rule,
// Warehouse Released only after it. The app's own writes aren't asked: their stamps keep their rules.
function assertWarehouseDates(existing: ShipmentRecord, data: Partial<NewShipmentRecord>, role: string): void {
  for (const key of Object.keys(WAREHOUSE_DATES) as (keyof typeof WAREHOUSE_DATES)[]) {
    const value = data[key];
    if (typeof value !== "string") continue;
    const day = value.trim();
    if (day && !isRealYmd(day)) throw APIError.invalidArgument(`${WAREHOUSE_DATES[key]} must be a date as "YYYY-MM-DD"`);
    data[key] = day || null;
  }
  const received = warehouseReceivedRefusal(existing, data, role, businessDay(new Date()));
  if (received) throw APIError.permissionDenied(received);
  const release = warehouseReleaseRefusal(existing, data);
  if (release) throw APIError.failedPrecondition(release);
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
// The quote a Sales Number names, as far as a shipment write needs it; `quoteNumber` is its reference
// as it is now (with the letters of its Freight Mode, lib/salesReference).
type QuoteOwner = { ownerUserId?: string | null; ownerName: string; quoteNumber?: string };

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
 * The users Handled By and Holiday Cover name, by id (lib/userLinks), set in the same write as the
 * e-mails, after checkPeople: a new e-mail is a user's (checkPeople refused anything else, with the
 * users read), so it takes that user's id - nobody takes none. A value the shipment already holds
 * keeps the id it has; without one, an e-mail gets the id of the user it names when the users can be
 * read (a write that could not read them is not refused for it - the daily backfill fills it). An id
 * sent by a caller is never taken: only this sets them.
 */
async function linkUsers(data: Record<string, unknown>, users: UsersOnce, existing?: ShipmentRecord): Promise<void> {
  for (const column of USER_ID_COLUMNS) delete data[column];
  const stored: Record<string, unknown> | undefined = existing;
  for (const [field, idField] of Object.entries(USER_ID_FIELDS)) {
    const value = data[field];
    if (typeof value !== "string") continue;
    if (!stored || value !== stored[field]) {
      data[idField] = value.trim() ? (linkedUser(value, await users())?.id ?? null) : null;
      continue;
    }
    if (stored[idField] || !mayNameUser(value)) continue;
    try {
      const id = linkedUser(value, await users())?.id;
      if (id) data[idField] = id;
    } catch (err) {
      log.warn(err, "the user of a person field was not linked: the users could not be read", { field });
    }
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

// The statuses of a quote that has not gone out to the customer (a shipment makes it Won). Not
// Expired: that is a quote that was sent, its validity over since - it passed the gate when sent.
const UNSENT_FOR_SHIPMENT: readonly string[] = ["draft", "ready_to_send", "revised"];

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
    const email = await userEmailOf(userId).catch(() => "");
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
    if (quote.ownerUserId) return userEmailOf(quote.ownerUserId).catch(() => "");
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

  // Persist the detail rows of a shipment just created, in its write turn (see writeDetailRows).
  // The cancel reason of a job created cancelled, as a line in its history (cancelLineOfNew).
  private async recordCancelLine(companyId: string, shipmentId: string, line: { userId: string; reason: string }, tx?: Tx): Promise<void> {
    await shipmentAuditRepository.create({ companyId, shipmentId, userId: line.userId, field: "cancelReason", oldValue: null, newValue: line.reason }, tx);
  }

  private async syncDetailRows(shipmentId: string, companyId: string, rows: DetailRows): Promise<void> {
    if (!hasDetailRows(rows)) return;
    await shipmentRepository.writeTurn(shipmentId, companyId, (tx) => this.writeDetailRows(tx, shipmentId, companyId, rows));
  }

  // Write the shipment's detail rows in `tx`, a transaction that holds the shipment's write
  // turn (shipmentRepository.writeTurn): a failed write leaves them as they were, and two
  // writes never interleave. Containers first — cargo lines are validated against the
  // resulting container ids.
  private async writeDetailRows(tx: Tx, shipmentId: string, companyId: string, rows: DetailRows): Promise<void> {
    const { containers, cargoItems, cargoDimensions, commercialInvoices } = rows;
    let removedOnly: string | undefined;
    let renamed = new Map<string, string>();
    if (containers !== undefined) {
      // With one container all cargo belongs to it, so it is the shipment's cargo: removing
      // or replacing that only container keeps the lines (they move to the new container, or
      // become shipment-level with none left). With two or more, a removed container's own
      // cargo goes with it (ON DELETE CASCADE). Whether the sync removes it is decided by the
      // same matching the sync itself does.
      const before = (await containerRepository.listByShipmentId(shipmentId, companyId, tx)).map((c) => c.id);
      const only = before.length === 1 ? before[0] : undefined;
      if (only && !matchContainerRows(before, containers).some((m) => m.id === only)) {
        removedOnly = only;
        await cargoItemRepository.detachFromContainers(shipmentId, companyId, [only], tx);
        await cargoDimensionRepository.detachFromContainers(shipmentId, companyId, [only], tx);
      }
      renamed = await containerRepository.syncForShipment(shipmentId, companyId, containers, tx);
    }
    if (containers !== undefined || cargoItems !== undefined || cargoDimensions !== undefined) {
      const containerIds = new Set((await containerRepository.listByShipmentId(shipmentId, companyId, tx)).map((c) => c.id));
      const linked = <T extends { containerId?: string | null }>(lines: T[]) => sanitizeContainerLinks(followRenamed(lines, renamed), containerIds, removedOnly);
      if (cargoItems !== undefined) {
        await cargoItemRepository.replaceForShipment(shipmentId, companyId, linked(cargoItems), tx);
      }
      if (cargoDimensions !== undefined) {
        await cargoDimensionRepository.replaceForShipment(shipmentId, companyId, linked(cargoDimensions), tx);
      }
      // Lines that stayed without a container (e.g. the first container was just added)
      // move to it when it is the only one.
      if (containerIds.size === 1) {
        const [only] = containerIds;
        await cargoItemRepository.assignLooseToContainer(shipmentId, companyId, only!, tx);
        await cargoDimensionRepository.assignLooseToContainer(shipmentId, companyId, only!, tx);
      }
    }
    if (commercialInvoices !== undefined) {
      await commercialInvoiceRepository.replaceForShipment(shipmentId, companyId, commercialInvoices, tx);
    }
  }

  // The shipment's detail rows as its API shows them, read in `tx`: what the audit log compares.
  private async detailRowLists(tx: Tx, shipmentId: string, companyId: string): Promise<DetailRowLists> {
    return {
      containers: (await containerRepository.listByShipmentId(shipmentId, companyId, tx)).map(toContainerLine),
      cargoItems: (await cargoItemRepository.listByShipmentId(shipmentId, companyId, tx)).map(toCargoItemLine),
      cargoDimensions: (await cargoDimensionRepository.listByShipmentId(shipmentId, companyId, tx)).map(toCargoDimensionLine),
      commercialInvoices: (await commercialInvoiceRepository.listByShipmentId(shipmentId, companyId, tx)).map(toCommercialInvoiceLine),
    };
  }

  async list(
    companyId: string,
    filters: ShipmentListFilters,
    /** The instant tile=attention is judged on, for a caller that names it (tests); now, without it. */
    now?: Date,
  ): Promise<{ pagination: { total: number; offset: number; limit: number }; data: ShipmentItem[] }> {
    // The Overview tile "Needs Attention" opens the jobs of the URGENT card: the rule names them
    // once for this page of the list (lib/needsAttention), and the query filters by their ids.
    const attentionIds = filters.tile === ATTENTION_TILE ? await needsAttentionService.urgentIds(companyId, now) : undefined;
    const result = await shipmentRepository.listFiltered(companyId, { ...filters, attentionIds });

    // The MCZ numbers of the page's master jobs, read in one query.
    const masterJobIds = [...new Set(result.data.flatMap((s) => (s.masterJobId ? [s.masterJobId] : [])))];
    const mczMap = await masterJobRepository.mczNumbersByIds(masterJobIds, companyId);

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
    const platesByShipment = await pickupPlates(shipmentIds, companyId);

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

    const latestEvents = await shipmentTrackingEventRepository.latestPerShipment(shipmentIds, companyId);

    const enriched = result.data.map((s) => toShipmentItem({
      ...enrich(
        s,
        containersByShipment.get(s.id) ?? [],
        itemsByShipment.get(s.id) ?? [],
        dimensionsByShipment.get(s.id) ?? [],
        invoicesByShipment.get(s.id) ?? [],
      ),
      masterJobMczNumber: s.masterJobId ? mczMap.get(s.masterJobId) || null : null,
      licensePlate: platesByShipment.get(s.id) ?? "",
      documentTypes: (docsByShipment.get(s.id) ?? []).map((d) => d.documentType),
      customsStatus: customsStatusFor(s.customsStatus, docsByShipment.get(s.id) ?? []),
      lastEvent: lastEventOf(s, latestEvents.get(s.id) ?? null),
    }));

    return {
      pagination: { total: result.total, offset: filters.offset, limit: filters.limit },
      data: enriched,
    };
  }

  /** The main search (the top bar): the newest live shipments the Shipments search finds, and how many in all. */
  async searchMain(companyId: string, search: string, limit: number): Promise<SearchShipmentsResponse> {
    const { rows, total } = await shipmentRepository.searchMain(companyId, search, limit);
    return {
      items: rows.map((r) => ({
        id: r.id,
        jobNumber: r.jobNumber,
        customer: r.customer ?? "",
        customerId: r.customerId ?? null,
        pol: r.pol ?? "",
        pod: r.pod ?? "",
        status: r.status ?? "",
        tradeDirection: r.tradeDirection ?? "",
        freightMode: r.freightMode ?? "",
        etd: r.etd ?? null,
        eta: r.eta ?? null,
      })),
      total,
    };
  }

  /**
   * The main search in containers: those of the company's live jobs whose number holds what was
   * typed (lib/mainSearch, mainSearchNumber), with the job and its master job; nothing for text
   * that can't be part of a container number.
   */
  async searchContainers(companyId: string, q: string, limit: number): Promise<SearchContainersResponse> {
    const text = mainSearchNumber(q);
    if (!text) return { items: [], total: 0 };
    const { rows, total } = await containerRepository.searchMain(companyId, text, limit);
    return {
      items: rows.map((r) => ({
        id: r.id,
        containerNumber: r.containerNumber,
        type: r.type,
        shipmentId: r.shipmentId,
        jobNumber: r.jobNumber,
        masterJobId: r.masterJobId ?? null,
        mczNumber: r.mczNumber ?? null,
      })),
      total,
    };
  }

  // The Overview tiles' counts. "Needs Attention" is the number of jobs on the URGENT card, from
  // the same rule as the card and as the list the tile opens (lib/needsAttention): one more read
  // of that rule beside the counting query, both at once.
  // `now` is for a caller that names its instant (tests); without it the rule's answer is shared
  // with whoever asked for the company's cards a moment ago (needsAttention.service).
  async tileCounts(companyId: string, now?: Date): Promise<ShipmentTileCounts> {
    const [counts, attention] = await Promise.all([shipmentRepository.tileCounts(companyId), needsAttentionService.urgentIds(companyId, now)]);
    return { ...counts, attention: attention.length };
  }

  // Active shipments with something due, split by how soon, in working days as on Shipments →
  // Managers: URGENT (`within24h`) is today or the next working day, plus every cut-off missed or
  // overdue; ATTENTION (`within48h`) the two working days after. A shipment with dates in both
  // windows is listed in both, each time with just that window's dates.
  async needsAttention(companyId: string, now?: Date): Promise<ShipmentsNeedingAttention> {
    return needsAttentionService.lists(companyId, now);
  }

  /** Whether this is a live shipment of the company. What is not an id is none, and is kept from SQL. */
  async isLive(id: string, companyId: string): Promise<boolean> {
    return isUuid(id) && !!(await shipmentRepository.getByIdForCompany(id, companyId));
  }

  /** Refuses work on a shipment that isn't a live shipment of the company (child rows hang off it). */
  async requireLive(id: string, companyId: string): Promise<void> {
    if (!(await this.isLive(id, companyId))) throw APIError.notFound("Shipment not found");
  }

  // What a change of the shipment is worth on the Tracking tab, in its write turn, whoever wrote it:
  // an actual date set, corrected or cleared sets aside the facts of the old day and confirms what
  // a source proposed of the new one; the fact as an event (once: one standing for that day is it);
  // the exceptions it closes; the ticks it makes true. The turn's lock on the shipment keeps two
  // writes of it from both finding no event and both adding one.
  private async writeTrackingFacts(tx: Tx, existing: ShipmentRecord, changes: Partial<NewShipmentRecord>, userId: string, byPerson: boolean, origin?: TrackingSource): Promise<void> {
    const { companyId, id: shipmentId } = existing;
    for (const { field, value } of heldFieldChanges(existing, changes)) {
      await shipmentTrackingEventRepository.supersede(shipmentId, companyId, field, value, userId, tx);
      if (value) await shipmentTrackingEventRepository.settle(shipmentId, companyId, field, value, userId, tx);
    }
    for (const fact of eventsFromChanges(existing, changes, { byPerson, origin, today: businessDay(new Date()) })) {
      if (!(await shipmentTrackingEventRepository.findSameDay(shipmentId, companyId, fact.kind, fact.occurredOn, tx))) {
        await shipmentTrackingEventRepository.add({ ...fact, companyId, shipmentId, recordedById: userId }, tx);
      }
      const closes = EXCEPTIONS_CLOSED_BY[fact.kind];
      if (closes) await shipmentTrackingEventRepository.resolveOpen(shipmentId, companyId, closes, userId, tx);
    }
    for (const taskKey of ticksFromChanges(existing, changes, changes.tradeDirection ?? existing.tradeDirection)) {
      await shipmentTaskRepository.upsert(shipmentId, companyId, taskKey, true, userId, tx);
    }
  }

  /** The customs status the shipment shows, which follows its paperwork. */
  async customsStatusOf(shipment: { id: string; customsStatus: string }, companyId: string): Promise<string> {
    return (await this.customsStatusesOf([shipment], companyId)).get(shipment.id)!;
  }

  /** The customs status each of these shipments shows, by id: their paperwork read in one query. */
  async customsStatusesOf(shipments: readonly { id: string; customsStatus: string }[], companyId: string): Promise<Map<string, string>> {
    const documents = await shipmentAttachmentRepository.documentTypesByShipmentIds(shipments.map((s) => s.id), companyId);
    return new Map(shipments.map((s) => [s.id, customsStatusFor(s.customsStatus, documents.filter((d) => d.shipmentId === s.id && d.documentType))]));
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
    const plates = await pickupPlates([id], companyId);
    return toShipmentItem({
      ...enrich(shipment, containers, cargoItems, cargoDimensions, commercialInvoices),
      masterJobMczNumber,
      licensePlate: plates.get(id) ?? "",
      documentTypes: documents.map((d) => d.documentType),
      customsStatus: customsStatusFor(shipment.customsStatus, documents),
      lastEvent: lastEventOf(shipment, (await shipmentTrackingEventRepository.latestPerShipment([id], companyId)).get(id) ?? null),
    });
  }

  /**
   * Customer links (customer, shipper, consignee, principal party) point at customers of the
   * caller's company: an unknown id is refused and a blank one unlinks (the name stays as free
   * text). A linked party stores the customer's current name, whatever text came with the id, so
   * name and id never disagree; later renames reach it through the customer-changed event.
   * `byPerson`: a person picks the shipment's Customer, and gets only a company with the Customer
   * role (customerRoleRefusal); the link the shipment has already is kept.
   */
  private async resolveCustomerLinks(data: Partial<NewShipmentRecord>, byPerson: boolean, existing?: ShipmentRecord): Promise<LinkedCustomers> {
    const links = [
      ["customerId", "customer", "customer"],
      ["shipperId", "shipper", "shipper"],
      ["consigneeId", "consignee", "consignee"],
      ["agentId", "agent", "agent"],
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
          const refused = key === "customerId" && byPerson && id !== existing?.customerId ? customerRoleRefusal(customer) : null;
          if (refused) throw APIError.invalidArgument(refused);
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
    await this.fillAgentContact(written, linked, contactsOf, existing);
  }

  /**
   * An Agent newly picked from the Customer Database brings its main contact as the Agent's
   * Contact (Martin, 2026-11-10). With no main contact, the previous agent's contact is taken away:
   * it belongs to another company. A write that sends the Agent's Contact itself keeps it.
   */
  private async fillAgentContact(written: Record<string, unknown>, linked: LinkedCustomers, contactsOf: ContactsOnce, existing?: ShipmentRecord): Promise<void> {
    const id = written.agentId as string | null | undefined;
    if (!id || !linked.agentId || id === existing?.agentId) return;
    if (String(written.agentPic ?? "").trim() || String(written.agentPicContactId ?? "").trim()) return;
    const main = (await contactsOf(id)).find((c) => c.isMain);
    written.agentPic = main ? main.name.trim() : "";
    written.agentPicContactId = main ? main.id : null;
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
    cancelLine: { userId: string; reason: string } | null = null,
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
    // A quote that never went out becomes Won by this shipment without passing the send gate: it
    // has to pass it here - a margin below its floor approved, heavy pieces approved (Council Outlay 6 D11).
    // The gate's sentence speaks of sending; here it is the shipment that waits.
    if (UNSENT_FOR_SHIPMENT.includes(quote.effectiveStatus) && quote.sendBlocked) {
      throw APIError.failedPrecondition(`${quote.quoteNumber} - ${shipmentFromQuoteBlocked(quote.sendBlocked)}`);
    }
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
    // The shipment exists by now: like its cargo lines, a history line that can't be written is logged, not thrown.
    if (cancelLine) {
      try {
        await this.recordCancelLine(companyId, shipment.id, cancelLine);
      } catch (err) {
        log.warn(err, "the cancel reason of a shipment created from a quote was not written to its history", { companyId, shipmentId: shipment.id });
      }
    }

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
  async create(
    companyId: string,
    data: ShipmentCreateData,
    creatorUserId?: string,
    { allowUnfinishedQuote = false, creatorRole }: { allowUnfinishedQuote?: boolean; creatorRole?: string } = {},
  ): Promise<CreatedShipment> {
    const { containers, cargoItems, cargoDimensions: sentDimensions, commercialInvoices, fromQuoteNumber, allowSecondShipment, fromHouseBol, ...rest } = data;
    const houseBol = (fromHouseBol ?? "").trim();
    if (houseBol && fromQuoteNumber?.trim()) throw APIError.invalidArgument("A shipment is created from a quote or from a House B/L, not from both");
    if (houseBol && !billOfLadingKey(houseBol)) throw APIError.invalidArgument("The House B/L number has no letters or digits");
    // The reading's House B/L is the shipment's House BoL Number from the start: the check below finds it.
    if (houseBol) rest.houseBolNumber = houseBol;
    const badOffice = customsOfficeRefusal(rest.customsOffice);
    if (badOffice) throw APIError.invalidArgument(badOffice);
    // A new shipment has no charges yet, so none of them is invoiced.
    if (isInvoicedStatus(rest.invoicingStatus)) throw APIError.failedPrecondition(invoicedRefusal({ invoiced: 0, total: 0 })!);
    assertValidContainerNumbers(containers);
    const cargoDimensions = normalizeCargoDimensions(sentDimensions);
    const shipmentData = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });
    shipmentData.carrierCode = carrierCodeOf(shipmentData.shippingLine);
    assertCancelReason(shipmentData);
    assertBlDates(shipmentData);
    const users = usersOnce();
    await checkPeople(shipmentData, users);
    await linkUsers(shipmentData, users);
    // Who created it, by e-mail ("" when nobody can tell); when is the row's createdAt ("Created on").
    if (creatorUserId) shipmentData.createdBy = (await this.actorOf(creatorUserId)).trim();
    // Created with the credit check approved by a user: the approval is theirs, as on an update.
    if (creatorUserId && creatorRole !== undefined && !isDetailsManager(creatorRole) && isCreditApproved(shipmentData.creditCheck)) {
      shipmentData.approvedBy = actionStamp(await this.actorOf(creatorUserId), new Date());
    }
    Object.assign(shipmentData, normalizeStops(shipmentData));
    // A new shipment has no paperwork yet, so its customs status starts where the paperwork does.
    delete shipmentData.customsStatus;
    // The starting status belongs to the shipment's Trade Direction.
    const directionStatus = statusForDirection(shipmentData.status ?? "", shipmentData.tradeDirection ?? "");
    if (directionStatus) shipmentData.status = directionStatus;
    const stored: Record<string, unknown> = shipmentData;
    normalizeCustomsPriority(stored, (key) => stored[key] as string);
    const fromQuote = fromQuoteNumber?.trim();
    const cancelLine = cancelLineOfNew(shipmentData, creatorUserId);
    // A person's create holds its Customer to the Customer role; one from a quote takes the quote's
    // customer, and the app's own (a Trucking road job) the customer it was asked for.
    const linked = await this.resolveCustomerLinks(shipmentData, creatorRole !== undefined && !fromQuote);
    const contactsOf = contactsOnce();
    await this.fillPartyStops(shipmentData, linked, contactsOf);
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
        shippingInstructions: shipmentData.shippingInstructions,
        insurance: shipmentData.insurance,
        ams: shipmentData.ams,
        isf: shipmentData.isf,
        bolDraft: shipmentData.bolDraft,
      }),
      cfsDefault(shipmentData.hub, shipmentData.cfs),
      dangerousFromAdr(cargoDimensions, shipmentData.dangerous),
      customsOfficeForProcedure(shipmentData.customsProcedure, shipmentData.customsOffice),
    );

    if (fromQuote) {
      return this.createFromQuote(companyId, fromQuote, allowSecondShipment === true, shipmentData, { containers, cargoItems, cargoDimensions, commercialInvoices }, users, contactsOf, cancelLine);
    }

    // The Sales Number is stored trimmed: it is what a quote finds its shipments by.
    const salesNumber = (shipmentData.salesNumber ?? "").trim();
    if ("salesNumber" in shipmentData) shipmentData.salesNumber = salesNumber;
    // A shipment created against a quote inherits that quote's sales owner.
    if (salesNumber) {
      const quote = await this.linkableQuoteOwner(salesNumber, allowUnfinishedQuote);
      // A quote's number typed from before its letters changed is kept as the quote's number now.
      if (quote?.quoteNumber && sameSalesReference(quote.quoteNumber, salesNumber)) shipmentData.salesNumber = quote.quoteNumber;
      const owner = quote && !(shipmentData.salesPerson ?? "").trim() ? await this.quoteOwnerEmail(quote, users) : "";
      if (owner) shipmentData.salesPerson = owner;
    }
    // The shipment and its containers and cargo lines are one transaction: a line that can't be
    // written leaves no shipment behind, so the request fails as a whole and a retry can't make a
    // second one. (One made from a quote reports such a failure instead - see createFromQuote.)
    const rows: DetailRows = { containers, cargoItems, cargoDimensions, commercialInvoices };
    // The history line of a job created cancelled lands with it, in the same transaction.
    const alongside =
      hasDetailRows(rows) || cancelLine
        ? async (tx: Tx, created: ShipmentRecord) => {
            if (hasDetailRows(rows)) await this.writeDetailRows(tx, created.id, companyId, rows);
            if (cancelLine) await this.recordCancelLine(companyId, created.id, cancelLine, tx);
          }
        : undefined;
    let shipment: ShipmentRecord;
    if (houseBol) {
      // A reading sent again (or twice at once) finds the shipment it made: a House B/L is one shipment.
      const made = await shipmentRepository.createForHouseBol(companyId, houseBol, shipmentData, alongside);
      if ("existing" in made) {
        const { id, jobNumber } = made.existing;
        throw APIError.alreadyExists(`House B/L ${houseBol} is already on shipment ${jobNumber}, so it is not created again`).withDetails({ shipmentId: id, jobNumber });
      }
      shipment = made.created;
    } else {
      shipment = await shipmentRepository.createWithJobNumber(companyId, shipmentData, alongside);
    }
    await this.recalcCustomerRollups(shipment.customerId, companyId);
    // Billed in its customer's default currency from the start.
    if (shipment.customerId) await startShipmentBilling(shipment.id);
    // A quote number typed as Sales Number links that quote to the shipment, without marking it Won.
    await this.tellQuote(companyId, salesNumber);
    return { shipment: (await this.getById(shipment.id, companyId))! };
  }

  // The CZ job number the next shipment of this company would get (a per-company sequence over
  // all rows incl. archived, so a reference is never reused within the company). Only a preview:
  // the number is taken when the shipment is stored, so a parallel create may get this one first.
  // It has no letters: a new job's Load Type is not known yet (lib/jobNumber).
  async nextJobNumber(companyId: string): Promise<string> {
    return shipmentRefCounterRepository.peek(companyId, "CZ");
  }

  // At user level only the Person in Charge and the Holiday Cover change a shipment's details
  // (lib/shipmentEditRule). An e-mail that can't be looked up is refused rather than guessed.
  private async assertMayChangeDetails(shipment: { personInCharge: string; holidayCover: string }, userId: string, role: string): Promise<void> {
    if (!(await this.mayChangeDetails(shipment, userId, role))) throw APIError.permissionDenied(DETAILS_REFUSAL);
  }

  /** Whether this person may change the shipment's details (lib/shipmentEditRule). */
  async mayChangeDetails(shipment: { personInCharge: string; holidayCover: string }, userId: string, role: string): Promise<boolean> {
    return isDetailsManager(role) || isOpenToPerson(shipment, "") || isOpenToPerson(shipment, await userEmailOf(userId).catch(() => ""));
  }

  /** For the actions that aren't a field edit but change the shipment: its master job, releasing its BoL. */
  async requireDetailsEditor(id: string, actor: { companyID: string; userID: string; role: string }): Promise<void> {
    if (!isUuid(id)) throw APIError.notFound("Shipment not found");
    const shipment = await shipmentRepository.getByIdForCompany(id, actor.companyID);
    if (shipment) await this.assertMayChangeDetails(shipment, actor.userID, actor.role);
  }

  // `role`: of the person editing, whose edit is held to what their role may change. Left out by
  // the app's own writes (a master job's sync, an approved request). `origin`: where the write comes
  // from, when the fields alone don't say, for the tracking events it causes. `stillHolds`: what the
  // write was decided on, checked again in the write turn (StillHolds). `extras`: what a release brings
  // along (ReleaseExtras).
  async update(
    id: string,
    companyId: string,
    data: ShipmentUpdateData,
    userId: string,
    role?: string,
    origin?: TrackingSource,
    stillHolds?: StillHolds,
    extras: ReleaseExtras = {},
  ): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    const locked = role === undefined ? null : (customsOfficeLockRefusal(existing, data, role) ?? creditCheckLockRefusal(existing, data, role) ?? approvedByLockRefusal(existing, data, role));
    if (locked) throw APIError.permissionDenied(locked);
    const badOffice = customsOfficeRefusal(data.customsOffice, existing.customsOffice);
    if (badOffice) throw APIError.invalidArgument(badOffice);
    if (role !== undefined && touchesDetails(data)) await this.assertMayChangeDetails(existing, userId, role);
    // Invoiced only once all the charges are, whoever asks (the app's own follow-up of an invoice too).
    if (isInvoicedStatus(data.invoicingStatus) && !isInvoicedStatus(existing.invoicingStatus)) {
      const refusal = invoicedRefusal(await invoicing._internalChargeCount({ shipmentId: id }));
      if (refusal) throw APIError.failedPrecondition(refusal);
    }

    const { containers, cargoItems, cargoDimensions: sentDimensions, commercialInvoices, ...rest } = data;
    // A number a container already has is not asked again (n19): the containers are read only for a
    // write that sends a number which is no container number.
    const oddNumber = !!containers?.some((c) => !isValidContainerNumber(c.containerNumber));
    assertValidContainerNumbers(containers, oddNumber ? (await containerRepository.listByShipmentId(id, companyId)).map(toContainerLine) : []);
    const cargoDimensions = normalizeCargoDimensions(sentDimensions);
    const shipmentData: Partial<NewShipmentRecord> = sanitizeTypedFields({ ...rest, ...legacyInvoiceFields(commercialInvoices) });
    assertCancelReason(shipmentData, existing);
    // A person's cancel of an invoiced job is a manager's, and so is taking Invoicing Status off
    // Invoiced while an invoice is open (lib/shipmentEditRule).
    if (role !== undefined && !isDetailsManager(role)) await this.assertInvoicedJobRules(id, role, existing, shipmentData);
    assertBlDates(shipmentData, existing);
    await this.assertLoadTypeFitsMasterJob(existing, shipmentData);
    if (role !== undefined) assertWarehouseDates(existing, shipmentData, role);
    if (shipmentData.shippingLine !== undefined) shipmentData.carrierCode = carrierCodeOf(shipmentData.shippingLine);
    clearStaleTimes(shipmentData, existing);
    const users = usersOnce();
    await checkPeople(shipmentData, users, existing);
    await linkUsers(shipmentData, users, existing);
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
    // A person's edit (role given) links the Customer only to a company with the Customer role.
    const linked = await this.resolveCustomerLinks(shipmentData, role !== undefined, existing);
    const contactsOf = contactsOnce();
    await this.fillPartyStops(shipmentData, linked, contactsOf, existing);
    // An edit naming a Customer's PIC that is no contact of the customer is refused.
    await linkContacts(shipmentData, existing, contactsOf, { picMode: "strict" });

    // ATA / ATD is the tax date; once the job is invoiced it is final (owner decision,
    // 14 Oct 2026) — correct it by crediting the invoice first. A trade-direction switch
    // that changes which of the two is the tax date counts too.
    if (changesTaxDate(existing, shipmentData) && (await this.isInvoiced(id))) {
      throw APIError.failedPrecondition("The tax date (ATA / ATD, or a road job's delivery) and the trade direction can't change once the job is invoiced — credit the invoice first");
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
      const moved = after("status").trim() ? statusForDirection(after("status"), after("tradeDirection")) : startingStatusFor(after("tradeDirection"));
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
        shippingInstructions: after("shippingInstructions"),
        insurance: after("insurance"),
        ams: after("ams"),
        isf: after("isf"),
        bolDraft: after("bolDraft"),
      }),
      cfsDefault(after("hub"), after("cfs")),
      dangerousFromAdr(cargoDimensions, after("dangerous")),
      customsOfficeForProcedure(after("customsProcedure"), after("customsOffice")),
    );

    // The Internal Reference's letters follow the Freight Mode and Load Type, the number kept
    // (CZFCL00000023 → CZLCL00000023) - until the reference is final: invoice numbers carry it
    // (owner decision, 3 Nov 2026). Invoicing is asked here, before the write turn, about a job it
    // invoiced before the shipment kept its own flag; the letters are worked out in the turn, from
    // the row as this write leaves it (followLetters).
    const lettersMayFollow =
      ("freightMode" in shipmentData || "loadType" in shipmentData) &&
      jobNumberDigits(existing.jobNumber) !== null &&
      !referenceIsFinal(existing) &&
      !(await this.hasHadInvoice(id));

    // The plate number belongs to the truck (TCZ…), not to one shipment on it. A shipment
    // put on a truck takes that truck's plate, one taken off loses it, and a plate typed
    // on any shipment of a truck is written to the others once this update is saved.
    const truck = after("warehouseTruck") || "";
    const plateTyped = "plateNumber" in shipmentData;
    if (!plateTyped && truck !== existing.warehouseTruck) {
      const truckPlate = truck ? await shipmentRepository.truckPlate(companyId, truck) : "";
      if (truckPlate || !truck) shipmentData.plateNumber = truckPlate;
    }

    // Approving the credit check records who did it and when. A manager's explicit approvedBy in
    // the same request wins - the stamp only fills the field the approval would leave untouched. A
    // user's approval is always their own: once Green, Approved By is locked to them
    // (approvedByLockRefusal), so it can't name someone else.
    const userApproves = role !== undefined && !isDetailsManager(role);
    if (isCreditApproval(shipmentData.creditCheck, existing.creditCheck) && (userApproves || !("approvedBy" in shipmentData))) {
      shipmentData.approvedBy = actionStamp(await this.actorOf(userId), new Date());
    }

    // Assigning a quote number hands the shipment to whoever sold it: the
    // quote's sales owner becomes the shipment's sales person. Only on a real
    // change, and never over a salesPerson set in the same request.
    // The Sales Number is stored trimmed: it is what a quote finds its shipments by.
    if (typeof shipmentData.salesNumber === "string") shipmentData.salesNumber = shipmentData.salesNumber.trim();
    const previousSalesNumber = existing.salesNumber.trim();
    // The quote it already names, written with other letters (from before a change of its Freight
    // Mode, lib/salesReference), is no change.
    if (
      typeof shipmentData.salesNumber === "string" &&
      isSalesReference(shipmentData.salesNumber) &&
      sameSalesReference(shipmentData.salesNumber, previousSalesNumber)
    ) {
      shipmentData.salesNumber = previousSalesNumber;
    }
    const nextSalesNumber = shipmentData.salesNumber;
    const salesNumberChanged = nextSalesNumber !== undefined && nextSalesNumber !== previousSalesNumber;
    // Invoiced: marked so (by hand too), or with an issued invoice not credited, whatever the status says.
    if (salesNumberChanged && (existing.invoicingStatus === INVOICED_STATUS || (await this.isInvoiced(id)))) throw APIError.failedPrecondition(SALES_REFERENCE_INVOICED);
    if (salesNumberChanged && nextSalesNumber) {
      const quote = await this.linkableQuoteOwner(nextSalesNumber);
      // Kept as the quote's number now, whatever letters it was typed with.
      if (quote?.quoteNumber && sameSalesReference(quote.quoteNumber, nextSalesNumber)) shipmentData.salesNumber = quote.quoteNumber;
      const owner = quote && !("salesPerson" in shipmentData) ? await this.quoteOwnerEmail(quote, users) : "";
      if (owner) shipmentData.salesPerson = owner;
    }

    // One write turn (shipmentRepository.writeTurn): the audit entries of the changed fields
    // and detail-row lists, the detail rows and the shipment row land together or not at all.
    const rows: DetailRows = { containers, cargoItems, cargoDimensions, commercialInvoices };
    // A person's write - an edit, or the master job's values a person saved - owes Trucking and the
    // gate the fields they keep (lib/shipmentPush); the app's own writes (theirs) owe nothing.
    const byPerson = role !== undefined || origin === "master_job";

    // The prepayment stop (lib/prepaymentStop): a person's write that sets Warehouse Released from empty asks
    // Invoicing whether the job is paid - only that write, so no other edit waits for it. A user is refused for a
    // job on prepayment not paid; a manager's reason lets it through, recorded in the write's turn - and so does a
    // release a manager approved on request (lib/releaseRequest), for whoever makes it. The app's own writes (no
    // role: Trucking, the gate, Invoicing) are never stopped.
    const releaseChecked = role !== undefined && setsWarehouseRelease(existing, shipmentData);
    const releaseGate = role !== undefined && releaseChecked ? await this.releaseGate(id, companyId, "warehouse_released", role, extras.paymentOverrideReason) : null;
    const releaseOverride = releaseGate?.override ?? null;
    // Whether the turn looks at Warehouse Released again: a person's write of a date into it.
    const watchesRelease = role !== undefined && !!(shipmentData.warehouseReleasedDate ?? "").trim();
    const overrideBy = releaseOverride || extras.houseBolOverride ? await this.actorOf(userId) : "";

    let pushesOwed = false;
    const updated = await shipmentRepository.writeTurn(id, companyId, async (tx) => {
      let setsRelease = false;
      if (stillHolds || watchesRelease) {
        const current = await shipmentRepository.getInTurn(tx, id, companyId);
        if (!current) throw APIError.notFound("Shipment not found");
        stillHolds?.(current);
        // Decided on the row as it was read: one emptied in between would be released unasked - asked again instead.
        setsRelease = watchesRelease && setsWarehouseRelease(current, shipmentData);
        if (setsRelease && !releaseChecked) throw APIError.failedPrecondition(RELEASE_CHANGED_MEANWHILE);
      }
      if (extras.stillHoldsInTurn) await extras.stillHoldsInTurn(tx);
      // The gate's day goes only over an empty day or one the gate wrote itself: a person's day set meanwhile stays
      // (the rest of the write - the plate - still goes). Checked here, under the shipment's write lock.
      if (role === undefined && extras.warehouseReleasedReplaces && (shipmentData.warehouseReleasedDate ?? "").trim()) {
        const current = await shipmentRepository.getInTurn(tx, id, companyId);
        if (!keepsReleasedDay(current?.warehouseReleasedDate, extras.warehouseReleasedReplaces)) delete shipmentData.warehouseReleasedDate;
      }
      // Cargo Details' lines saved from a page that started from other lines than the shipment holds
      // now (an accepted remeasurement, a colleague's save in between): refused, not written over them.
      if (extras.expectedCargoDimensions && cargoDimensions !== undefined) {
        const now = await this.cargoDetailsOf(id, companyId, tx);
        if (!sameCargoLines(extras.expectedCargoDimensions, now.lines, now.containers.length)) throw APIError.aborted(CARGO_LINES_CHANGED);
      }
      const audit = (field: string, oldValue: string | null, newValue: string | null) =>
        shipmentAuditRepository.create({ companyId, shipmentId: id, userId, field, oldValue, newValue }, tx);
      for (const [key, newValue] of Object.entries(shipmentData)) {
        // The users' ids follow the e-mails beside them, whose change is the line in the history.
        if (USER_ID_COLUMNS.has(key)) continue;
        const oldValue = before[key];
        if (oldValue !== newValue) await audit(key, oldValue != null ? String(oldValue) : null, newValue != null ? String(newValue) : null);
      }
      if (hasDetailRows(rows)) {
        const listsBefore = await this.detailRowLists(tx, id, companyId);
        await this.writeDetailRows(tx, id, companyId, rows);
        for (const change of detailRowChanges(listsBefore, await this.detailRowLists(tx, id, companyId))) {
          await audit(change.field, change.oldValue, change.newValue);
        }
      }
      await this.writeTrackingFacts(tx, existing, shipmentData, userId, role !== undefined, origin);
      if (Object.keys(shipmentData).length === 0) return null;
      const saved = await shipmentRepository.updateForCompany(id, companyId, shipmentData, tx);
      // A manager's release of an unpaid prepayment job is recorded with the release, or not at all.
      if (saved && setsRelease && releaseOverride) await this.recordOverride(tx, saved, "warehouse_released", releaseOverride, userId, overrideBy);
      // Released with the work not yet invoiced left unchecked (P10): said in the job's history, with the release.
      if (saved && setsRelease && releaseGate?.uninvoicedUnchecked) await audit(PREPAYMENT_UNCHECKED_FIELD, null, PREPAYMENT_UNCHECKED_LINE);
      if (saved && extras.houseBolOverride) await this.recordOverride(tx, saved, "house_bol", extras.houseBolOverride, userId, overrideBy);
      // A request to a manager still waiting for a release this write makes - by whoever, the app too - has
      // nothing left to ask, and an approval of it nobody used must not let a later release through (a Warehouse
      // Released cleared and set again): both closed in the same turn (lib/releaseRequest), with a line saying
      // so. The approval this very release used was marked used above, and stays that.
      if (saved) {
        const released: ReleaseKind[] = [];
        if ((shipmentData.houseBolRelease ?? "").trim() && !(existing.houseBolRelease ?? "").trim()) released.push("house_bol");
        if (role !== undefined ? setsRelease : setsWarehouseRelease(existing, shipmentData)) released.push("warehouse_released");
        for (const kind of released) {
          const closed = await shipmentReleaseRequestRepository.closeUnused(tx, companyId, id, WHAT_OF_KIND[kind], new Date());
          if (closed.waiting) await audit(RELEASE_REQUEST_FIELD, null, closedLine(WHAT_OF_KIND[kind]));
          if (closed.approved) await audit(RELEASE_REQUEST_FIELD, null, unusedLine(WHAT_OF_KIND[kind]));
        }
      }
      for (const h of extras.history ?? []) await audit(h.field, h.oldValue, h.newValue);
      if (saved && extras.alongside) await extras.alongside(tx);
      if (saved) pushesOwed = await owePushes(tx, { companyId, shipmentId: id, userId, role }, existing, saved, Object.keys(shipmentData), byPerson);
      return saved && lettersMayFollow ? this.followLetters(tx, companyId, userId, saved) : saved;
    });
    // Sent after the commit; what can't go now is retried by the push outbox's cron. Never throws.
    if (pushesOwed) await deliverShipmentPushes(id);
    // The truck's other shipments take a typed plate after the write, on their own: inside the
    // turn, two shipments of one truck saved at once could each wait for the other's row.
    if (truck && plateTyped) {
      await shipmentRepository.setTruckPlate(companyId, truck, shipmentData.plateNumber ?? "");
    }

    // Recalc for the new customer, and for the old one when the link moved.
    const newCustomerId = "customerId" in shipmentData ? shipmentData.customerId : existing.customerId;
    await this.recalcCustomerRollups(newCustomerId, companyId);
    // A shipment linked to a customer starts billing in its default currency, unless it was billed or set already.
    if (newCustomerId && newCustomerId !== existing.customerId) await startShipmentBilling(id);
    if (existing.customerId && existing.customerId !== newCustomerId) {
      await this.recalcCustomerRollups(existing.customerId, companyId);
    }
    if (updated && (updated.customer !== existing.customer || updated.customerPic !== existing.customerPic)) {
      await this.tellParties(companyId, updated);
    }
    // The quote shows its shipment's reference (a changed Sales Number tells it below). Trucking and
    // the warehouse keep the reference they copied: theirs is for their own modules.
    if (updated && updated.jobNumber !== existing.jobNumber && !salesNumberChanged) {
      await this.tellQuote(companyId, updated.salesNumber.trim());
    }
    // A changed Sales Number takes the shipment from one quote and gives it to another: both
    // are told, the new one without being marked Won.
    if (salesNumberChanged) {
      await this.tellQuote(companyId, nextSalesNumber ?? "");
      await this.tellQuote(companyId, previousSalesNumber);
    }

    return (await this.getById(id, companyId))!;
  }

  // The letters of the reference as the row in the write turn reads after the write: its Freight
  // Mode and Load Type as they are now, an edit of the other one saved meanwhile included - unless
  // the row says the reference is final (Invoicing took it while the edit was on its way).
  private async followLetters(tx: Tx, companyId: string, userId: string, row: ShipmentRecord): Promise<ShipmentRecord> {
    if (referenceIsFinal(row)) return row;
    const next = jobNumberFor(row.jobNumber, row.freightMode, row.loadType);
    if (next === row.jobNumber) return row;
    return (await this.renameInTurn(tx, companyId, userId, row, next)) ?? row;
  }

  // Renames the reference inside the shipment's write turn, with a line in its history.
  private async renameInTurn(
    tx: Tx,
    companyId: string,
    userId: string,
    row: Pick<ShipmentReference, "id" | "jobNumber" | "freightMode" | "loadType">,
    next: string,
  ): Promise<ShipmentRecord | null> {
    const renamed = await shipmentRepository.renameJobNumber(tx, companyId, row, next);
    if (renamed) {
      await shipmentAuditRepository.create({ companyId, shipmentId: row.id, userId, field: "jobNumber", oldValue: row.jobNumber, newValue: next }, tx);
    }
    return renamed;
  }

  /**
   * Invoicing is about to make an invoice number of the shipment's Internal Reference: from now on
   * the reference is final. Marked under the shipment's write turn, so an edit of its Freight Mode
   * or Load Type either renamed it before (and the number carries the new letters) or finds it
   * final; the reference is given back as it is now, for the number. A job whose invoice then
   * fails stays final all the same - its reference only stops following its letters.
   */
  async finalizeReference(id: string, companyId: string): Promise<string> {
    // What is not an id names no shipment, and is kept from SQL.
    if (!isUuid(id)) throw APIError.notFound("Shipment not found");
    const jobNumber = await shipmentRepository.writeTurn(id, companyId, (tx) => shipmentRepository.markJobNumberFinal(tx, id, companyId));
    if (jobNumber === null) throw APIError.notFound("Shipment not found");
    return jobNumber;
  }

  // What the company's shipments say about its customers, for the pipeline of the sales service:
  // for each customer its first shipment - what "ordered" means there - its newest, and how many.
  /** The live shipments that name a quote reference in their Sales Number, the oldest first. */
  /** Of the given ids, the live shipments of this customer (bad ids are simply not theirs). */
  async idsOfCustomer(companyId: string, customerId: string, ids: string[]): Promise<string[]> {
    if (!isUuid(customerId)) return [];
    return shipmentRepository.idsOfCustomer(companyId, customerId, ids.filter(isUuid));
  }

  /** How many live shipments the customer has: what is not an id names no customer. */
  async countOfCustomer(companyId: string, customerId: string): Promise<number> {
    return isUuid(customerId) ? shipmentRepository.countOfCustomer(companyId, customerId) : 0;
  }

  /** The quote references of the live shipments whose job number contains the text (the Quotes list's Shipment filter). */
  async quoteReferencesByJobNumber(companyId: string, text: string): Promise<string[]> {
    return shipmentRepository.salesNumbersByJobNumber(companyId, text, MAX_REFERENCES_BY_JOB);
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
    // An invoiced shipment stays with the offer it was invoiced from: marked so, or with an issued invoice not credited.
    const naming: NamingShipment[] = [];
    for (const shipment of await shipmentRepository.liveBySalesNumber(companyId, previous)) {
      if (shipment.invoicingStatus !== INVOICED_STATUS && !(await this.isInvoiced(shipment.id))) naming.push(shipment);
    }
    // Each in the shipment's write turn, and only while it still names the quote: a Sales Number
    // a user changed meanwhile stays. The history line goes with the move, in the same transaction.
    const moved: NamingShipment[] = [];
    for (const shipment of naming) {
      const done = await shipmentRepository.writeTurn(shipment.id, companyId, async (tx) => {
        if (!(await shipmentRepository.moveSalesNumber(tx, shipment.id, companyId, previous, next))) return false;
        await shipmentAuditRepository.create({ companyId, shipmentId: shipment.id, userId, field: "salesNumber", oldValue: previous, newValue: next }, tx);
        return true;
      });
      if (done) moved.push(shipment);
    }
    if (moved.length > 0) {
      await this.tellQuote(companyId, next);
      await this.tellQuote(companyId, previous);
    }
    return moved.map((shipment) => shipment.jobNumber);
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
    // Grouped without the letters of a quote's Freight Mode (lib/salesReference): a shipment whose copy
    // is from before the quote's letters changed is still one of that quote's.
    const byQuote = new Map(wanted.map((reference): [string, QuoteShipments["shipments"]] => [plainSalesReference(reference), []]));
    for (const { reference, ...shipment } of await shipmentRepository.liveBySalesNumbers(companyId, wanted)) {
      byQuote.get(plainSalesReference(reference))?.push(shipment);
    }
    return wanted.map((reference) => ({ reference, shipments: byQuote.get(plainSalesReference(reference)) ?? [] }));
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

  /**
   * A user's write on an invoiced job (lib/shipmentEditRule): a cancel is a manager's when the job
   * reads Invoiced before the write or after it, or has an open invoice (K22, mock test council n35);
   * taking Invoicing Status off Invoiced is a manager's while an invoice is open - else a user would
   * move it to Not Invoiced first and then cancel. Invoicing is asked only when the statuses don't
   * say it; when it can't be asked, the write is refused (n36) rather than failing as an error.
   */
  private async assertInvoicedJobRules(id: string, role: string, existing: ShipmentRecord, data: Partial<NewShipmentRecord>): Promise<void> {
    const cancelling = isCancelling(existing.status, data.status);
    const leaving = leavesInvoicedStatus(existing.invoicingStatus, data);
    if (!cancelling && !leaving) return;
    let open: boolean | undefined;
    const openInvoice = async () => {
      if (open !== undefined) return open;
      try {
        open = await this.isInvoiced(id);
        return open;
      } catch (err) {
        log.warn(err, "whether the job is invoiced could not be checked", { shipmentId: id });
        throw APIError.failedPrecondition(INVOICED_UNCHECKED);
      }
    };
    if (cancelling) {
      const marked = isInvoicedStatus(existing.invoicingStatus) || ("invoicingStatus" in data && isInvoicedStatus(data.invoicingStatus));
      const refusal = cancelInvoicedRefusal(role, marked || (await openInvoice()));
      if (refusal) throw APIError.permissionDenied(refusal);
    }
    if (leaving && (await openInvoice())) throw APIError.permissionDenied(INVOICED_STATUS_LOCKED);
  }

  /** Whether an invoice was ever issued for the job, a credited one too: its Internal Reference is then final. */
  async hasHadInvoice(id: string): Promise<boolean> {
    const { shipmentIds } = await invoicing._internalInvoicedShipments({ shipmentIds: [id] });
    return shipmentIds.length > 0;
  }

  async softDelete(id: string, companyId: string, userId?: string, role?: string): Promise<void> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    // A supplier invoice marked paid keeps its lines as paid (Finance → Accounts Payable): the job's costs can't go.
    const { invoiceNumbers: paid } = await invoicing._internalPaidSupplierInvoices({ shipmentId: id });
    if (paid.length) {
      throw APIError.failedPrecondition(
        `This shipment's costs are on supplier invoices marked paid (${paid.join(", ")}): take the payment back on Finance → Accounts Payable first`,
      );
    }

    // The invoice check, the history line, the delete and the shipment-deleted event it owes are
    // one write turn. Invoicing takes the same turn right before it numbers an invoice of the job
    // (finalizeReference), so an invoice can't be started while the delete looks: Invoicing then
    // waits, finds the shipment gone and issues nothing. (One whose number Invoicing took just
    // before the turn and has not stored yet is not seen - Invoicing's own write, not ours.)
    // Invoicing is asked with the transaction open - the one remote call that has to be inside it
    // for that; the pool ends a transaction left waiting too long (lib/db/pool), so it is bounded.
    // The event is published once the delete is committed, and retried by the event outbox cron
    // when that fails, so the services that keep rows for the shipment always hear of it.
    const deleted = await shipmentRepository.writeTurn(id, companyId, async (tx) => {
      // Its invoices would stay open in the queue and the customer's balance with no job.
      if (await this.isInvoiced(id)) {
        throw APIError.failedPrecondition("An invoiced shipment can't be deleted — credit its invoices first");
      }
      if (userId) {
        await shipmentAuditRepository.create(
          { companyId, shipmentId: id, userId, field: "deletedAt", oldValue: null, newValue: new Date().toISOString() },
          tx,
        );
      }
      return shipmentRepository.softDeleteWithEvent(id, companyId, { userId: userId ?? "", role: role ?? "" }, tx);
    });
    if (!deleted) throw APIError.notFound("Shipment not found");
    await deliverShipmentEvents(id);
    await this.recalcCustomerRollups(existing.customerId, companyId);
    // The quote the shipment named loses it - and with its last shipment a Won it owed to one.
    await this.tellQuote(companyId, existing.salesNumber.trim());
    // It carries nothing of its master job any more; the others keep theirs until the split is processed.
    if (existing.masterJobId) await dropSharesOfLeftShipments([existing.masterJobId]);
  }

  // Release the house bill of lading, recording who released it and when. A release is a one-off
  // act: once stamped, the record stands - a second release is refused rather than rewriting who
  // did it. Checked again in the shipment's write turn, so of two releases at the same moment the
  // second finds the first one's stamp.
  // `person`: the person releasing (the endpoint), whose release is held to the prepayment stop
  // (lib/prepaymentStop) - a manager's reason lets an unpaid prepayment job through, recorded with the release.
  async releaseHouseBol(id: string, companyId: string, userId: string, person?: { role: string; paymentOverrideReason?: string }): Promise<ShipmentItem> {
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    const notReleasedYet: StillHolds = ({ houseBolRelease }) => {
      if (houseBolRelease.trim()) throw APIError.failedPrecondition(`The House BoL was already released (${houseBolRelease.trim()})`);
    };
    notReleasedYet(existing);
    const gate = person ? await this.releaseGate(id, companyId, "house_bol", person.role, person.paymentOverrideReason) : null;
    const houseBolOverride = gate?.override ?? null;

    const stamp = actionStamp(await this.actorOf(userId), new Date());
    return this.update(id, companyId, { houseBolRelease: stamp }, userId, undefined, undefined, notReleasedYet, {
      ...(houseBolOverride ? { houseBolOverride } : {}),
      ...(gate?.uninvoicedUnchecked ? { history: [{ field: PREPAYMENT_UNCHECKED_FIELD, oldValue: null, newValue: PREPAYMENT_UNCHECKED_LINE }] } : {}),
    });
  }

  /**
   * Accepts the warehouse's remeasurement (lib/remeasureAccept): its saved lines replace the cargo
   * dimension lines and Pcs, Total Weight and Total Volume take their totals, in one write with a
   * line in the history holding the figures before and after. `expected`: the remeasured lines as
   * the page showed them - lines the warehouse changed meanwhile are not accepted unseen.
   */
  async acceptRemeasurement(id: string, actor: { companyID: string; userID: string; role: string }, expected: string): Promise<ShipmentItem> {
    if (!isUuid(id)) throw APIError.notFound("Shipment not found");
    const existing = await shipmentRepository.getByIdForCompany(id, actor.companyID);
    if (!existing) throw APIError.notFound("Shipment not found");
    await this.assertMayChangeDetails(existing, actor.userID, actor.role);
    const { section } = await warehouse.warehouseSectionGet({ shipmentId: id, section: "job" });
    const data = section?.data && typeof section.data === "object" && !Array.isArray(section.data) ? (section.data as Record<string, unknown>) : {};
    const saved = typeof data.remeasure_rows === "string" ? data.remeasure_rows : "";
    if (saved !== expected) {
      throw APIError.aborted("The warehouse changed the remeasured lines meanwhile — they are shown again; check them and accept again");
    }
    let remeasured: RemeasuredLine[];
    try {
      remeasured = parseRemeasuredLines(saved);
    } catch (e) {
      throw APIError.failedPrecondition(e instanceof Error ? e.message : "The remeasured lines cannot be read");
    }
    // The same lines twice (a stale page, a second person) would record a second acceptance and
    // bring back a Costs warning already checked (council finding m8) - while Cargo Details still
    // hold them (Y10: lines saved over since may be accepted again); lines of dangerous goods or of
    // several containers are taken over only line for line, the same pieces on each (X2, Y8). Asked
    // here for a quick answer, and again in the write turn below on what is there then.
    const lastAccepted = async () => (await shipmentAuditRepository.listByShipmentId(id, actor.companyID, [REMEASURE_ACCEPTED], 1))[0]?.newValue ?? null;
    const read = await this.cargoDetailsOf(id, actor.companyID);
    const refusal = acceptRefusal(saved, remeasured, await lastAccepted(), read.lines);
    if (refusal) throw APIError.failedPrecondition(refusal);
    const current = [...read.lines];
    // What the shipment held: its cargo lines' totals, a figure they lack from its typed totals.
    const before = dimensionFiguresFilled({ pcs: existing.pcs, totalWeightTons: existing.totalWeightTons, totalVolumeCbm: existing.totalVolumeCbm, cargoDimensions: current });
    const exact = exactFiguresOf(remeasured);
    const after = roundedFigures(exact);
    // The only container declares the cargo's figures too, and the screens read them from it first
    // (council finding X3): it takes the accepted totals in the same write, its change in the history.
    // Several containers are left alone - which container's figures changed is not known.
    const [only, ...others] = read.containers;
    const containers = only && others.length === 0 ? { containers: [{ ...only, ...acceptedContainerFigures(exact) }] } : {};
    // Everything above was decided on Cargo Details as read before the write turn. A save of it in
    // between - a second container, a changed seal, ADR lines, typed totals - would be undone by this
    // write: the container list it sends is synced, so a container it doesn't name is deleted with
    // its cargo. So the turn reads them again and refuses unless they are as read; then the one
    // container sent is the only one there, and only its figures change.
    const stillHoldsInTurn = async (tx: Tx) => {
      const row = await shipmentRepository.getInTurn(tx, id, actor.companyID);
      if (!row) throw APIError.notFound("Shipment not found");
      const fresh = await this.cargoDetailsOf(id, actor.companyID, tx);
      // First: another Accept of these lines that had its turn before this one - it changed Cargo
      // Details itself, and that they were accepted is what to say. Its history entry is read
      // outside this transaction, which is fine: the turn is only had once the other has committed.
      if (alreadyAccepted(saved, await lastAccepted(), fresh.lines)) throw APIError.failedPrecondition(ALREADY_ACCEPTED);
      const totalsAsRead = row.pcs === existing.pcs && row.totalWeightTons === existing.totalWeightTons && row.totalVolumeCbm === existing.totalVolumeCbm;
      if (!totalsAsRead || !sameCargoDetails(read, fresh)) throw APIError.aborted(CARGO_DETAILS_CHANGED);
      const byHand = acceptByHandRefusal(remeasured, fresh.lines);
      if (byHand) throw APIError.failedPrecondition(byHand);
    };
    return this.update(
      id,
      actor.companyID,
      { cargoDimensions: acceptedDimensionLines(remeasured, current), ...acceptedTotals(exact), ...containers },
      actor.userID,
      actor.role,
      undefined,
      undefined,
      { history: [{ field: REMEASURE_ACCEPTED, oldValue: JSON.stringify(before), newValue: JSON.stringify({ ...after, lines: saved }) }], stillHoldsInTurn },
    );
  }

  // The shipment's containers and cargo dimension lines as Cargo Details shows them (getById), read
  // in `tx` when given: what an acceptance is decided on, and checked again in its write turn.
  private async cargoDetailsOf(id: string, companyId: string, tx?: Tx): Promise<CargoDetailsRead> {
    const containers = (await containerRepository.listByShipmentId(id, companyId, tx)).map(toContainerLine);
    const lines = (await cargoDimensionRepository.listByShipmentId(id, companyId, tx)).map(toCargoDimensionLine);
    return { containers, lines: withOnlyContainer(lines, containers.map((c) => c.id)) };
  }

  /**
   * Who may mark Costs Breakdown's quantities checked after an acceptance (council finding m9,
   * K6): who may change the shipment's details - Handled By, Holiday Cover, a manager - and
   * Invoicing, who bills the quantities. The app has no Invoicing role: an Invoicing user is one
   * whose department (Settings → Users) is Invoicing's (lib/shipmentEditRule isInvoicingDepartment).
   */
  private async mayCheckRemeasureCosts(shipment: { personInCharge: string; holidayCover: string }, actor: { userID: string; role: string }): Promise<boolean> {
    return (await this.mayChangeDetails(shipment, actor.userID, actor.role)) || (await this.inInvoicingDepartment(actor.userID));
  }

  // Whether the user sits in an Invoicing department; not, when auth can't be asked.
  private async inInvoicingDepartment(userId: string): Promise<boolean> {
    try {
      const { users } = await auth.usersList();
      const departmentId = users.find((u) => u.id === userId)?.departmentId;
      if (!departmentId) return false;
      const { departments } = await auth.departmentList();
      return isInvoicingDepartment(departments.find((d) => d.id === departmentId)?.name);
    } catch (err) {
      log.warn(err, "the user's department could not be read");
      return false;
    }
  }

  /**
   * The shipment's last accepted remeasurement: when, by whom, the figures before and after, whether
   * the job has an open invoice, and when Costs Breakdown's quantities were last marked checked
   * after it. Null when none was accepted. `viewer`: who reads it, told whether they may mark the
   * quantities checked (none: not).
   */
  async remeasureAcceptance(id: string, companyId: string, viewer?: { userID: string; role: string }): Promise<RemeasureAcceptance | null> {
    if (!isUuid(id)) throw APIError.notFound("Shipment not found");
    const existing = await shipmentRepository.getByIdForCompany(id, companyId);
    if (!existing) throw APIError.notFound("Shipment not found");
    const [accepted] = await shipmentAuditRepository.listByShipmentId(id, companyId, [REMEASURE_ACCEPTED], 1);
    if (!accepted) return null;
    const [checked] = await shipmentAuditRepository.listByShipmentId(id, companyId, [REMEASURE_COSTS_CHECKED], 1);
    const users = await companyUsers().catch(() => [] as CompanyUser[]);
    const nameOf = (userId: string) => {
      const u = users.find((x) => x.id === userId);
      return u ? u.displayName || u.email : "";
    };
    // A check names the acceptance it was made for (its new value, markRemeasureCostsChecked), so
    // one made for an earlier acceptance never counts for a later one, whenever it was written.
    const costsChecked = checked && checked.newValue === iso(accepted.changedAt) ? checked : null;
    return {
      acceptedAt: iso(accepted.changedAt)!,
      acceptedBy: nameOf(accepted.userId),
      before: readFigures(accepted.oldValue),
      after: readFigures(accepted.newValue),
      lines: acceptedLinesOf(accepted.newValue),
      freightMode: existing.freightMode,
      loadType: existing.loadType,
      // Invoicing down says nothing about the acceptance (mock test council n18): read as not
      // invoiced rather than failing - after an Accept that was saved, "Not accepted" would be said.
      invoiced: await this.isInvoiced(id).catch((err: unknown) => {
        log.warn(err, "whether the job is invoiced could not be read for its remeasurement", { shipmentId: id });
        return false;
      }),
      costsCheckedAt: costsChecked ? iso(costsChecked.changedAt)! : null,
      costsCheckedBy: costsChecked ? nameOf(costsChecked.userId) : null,
      mayCheckCosts: viewer ? await this.mayCheckRemeasureCosts(existing, viewer) : false,
    };
  }

  /** Costs Breakdown: the quantities were checked after the last accepted remeasurement. */
  async markRemeasureCostsChecked(id: string, actor: { companyID: string; userID: string; role: string }): Promise<RemeasureAcceptance | null> {
    if (!isUuid(id)) throw APIError.notFound("Shipment not found");
    const existing = await shipmentRepository.getByIdForCompany(id, actor.companyID);
    if (!existing) throw APIError.notFound("Shipment not found");
    if (!(await this.mayCheckRemeasureCosts(existing, actor))) throw APIError.permissionDenied(COSTS_CHECK_REFUSAL);
    const [accepted] = await shipmentAuditRepository.listByShipmentId(id, actor.companyID, [REMEASURE_ACCEPTED], 1);
    if (!accepted) throw APIError.failedPrecondition("No remeasurement was accepted on this shipment");
    await shipmentAuditRepository.create({ companyId: actor.companyID, shipmentId: id, userId: actor.userID, field: REMEASURE_COSTS_CHECKED, oldValue: null, newValue: iso(accepted.changedAt) });
    return this.remeasureAcceptance(id, actor.companyID, actor);
  }

  // Invoicing's word on whether the job is paid, for the prepayment stop; null when it can't be asked. It
  // also says when the work not yet invoiced could not be held against the customer's terms
  // (prepaymentUninvoicedUnchecked): the release then goes through, with a line saying so (releaseGate).
  private async paymentCheck(shipmentId: string): Promise<(PaymentCheck & { prepaymentUninvoicedUnchecked?: boolean }) | null> {
    try {
      return await invoicing._internalReleaseCheck({ shipmentId });
    } catch (err) {
      log.warn(err, "whether the job is paid not checked for its release", { shipmentId });
      return null;
    }
  }

  /**
   * Why the prepayment stop refuses a user's release of this kind right now, or null when it does not: what a
   * request to a manager is asked against (releaseRequest.service) - a job the stop does not hold needs none.
   */
  async prepaymentRefusal(shipmentId: string, kind: ReleaseKind): Promise<string | null> {
    const verdict = prepaymentStop(kind, await this.paymentCheck(shipmentId), "user", undefined);
    return "refusal" in verdict ? verdict.refusal : null;
  }

  // The prepayment stop of a person's release (lib/prepaymentStop): throws its refusal, else gives the override
  // to record with the release (null when there is none to record) - a manager's own, by their reason, or the
  // one a request a manager approved stands for (lib/releaseRequest): a pass, looked for only when the stop
  // would refuse, so a manager's direct override and a job that is paid never touch it. `uninvoicedUnchecked`: the
  // work not yet invoiced could not be checked (mock test council P10) - the release goes through, and its write
  // records PREPAYMENT_UNCHECKED_LINE in the job's history.
  private async releaseGate(
    shipmentId: string,
    companyId: string,
    kind: ReleaseKind,
    role: string,
    reason: string | undefined,
  ): Promise<{ override: ReleaseOverride | null; uninvoicedUnchecked: boolean }> {
    const check = await this.paymentCheck(shipmentId);
    const uninvoicedUnchecked = check?.prepaymentUninvoicedUnchecked === true;
    const verdict = prepaymentStop(kind, check, role, reason);
    if (!("refusal" in verdict)) return { override: verdict.override, uninvoicedUnchecked };
    const pass = await this.releasePass(shipmentId, companyId, kind);
    if (!pass) throw APIError.failedPrecondition(verdict.refusal);
    return { override: passOverride(check, pass, verdict.refusal), uninvoicedUnchecked };
  }

  // The approved request that lets this release through now, with the reason it is recorded with; null when
  // there is none - or it could not be read: the stop then refuses as it would without one.
  private async releasePass(shipmentId: string, companyId: string, kind: ReleaseKind): Promise<{ requestId: string; reason: string } | null> {
    try {
      const pass = await shipmentReleaseRequestRepository.usablePass(companyId, shipmentId, WHAT_OF_KIND[kind], passDecidedSince(new Date()));
      return pass ? { requestId: pass.id, reason: approvedReason(pass, pass.decidedByName, pass.comment) } : null;
    } catch (err) {
      log.warn(err, "the approved release requests of the job could not be read", { shipmentId });
      return null;
    }
  }

  // The record of a release of an unpaid prepayment job that was let through, in the release's own turn: the
  // override row, a line in the shipment's history and a note on its Tracking tab. Let through by an approved
  // request, that request is marked used here first - once: used or gone meanwhile (two releases at one moment,
  // the pass run out), the stop refuses after all and the turn writes nothing. The row names the one releasing
  // as who did it (`by`); the manager who allowed it is named in the reason.
  private async recordOverride(tx: Tx, shipment: ShipmentRecord, kind: ReleaseKind, override: ReleaseOverride, userId: string, by: string): Promise<void> {
    const { companyId, id: shipmentId } = shipment;
    if (override.pass) {
      const now = new Date();
      const used = await shipmentReleaseRequestRepository.use(tx, override.pass.requestId, companyId, { usedAt: now, usedById: userId, usedByName: by }, passDecidedSince(now));
      if (!used) throw APIError.failedPrecondition(override.pass.refusal);
    }
    await shipmentReleaseOverrideRepository.create(tx, {
      companyId,
      shipmentId,
      kind,
      reason: override.reason,
      invoices: override.invoices,
      checked: override.checked,
      byUserId: userId,
      by,
    });
    const line = overrideLine(kind, override);
    await shipmentAuditRepository.create({ companyId, shipmentId, userId, field: "paymentOverride", oldValue: null, newValue: line }, tx);
    await shipmentTrackingEventRepository.add({ companyId, shipmentId, kind: "note", occurredOn: businessDay(new Date()), source: "user", recordedById: userId, note: line }, tx);
  }

  /** The customer's open jobs - live, not Cancelled - newest first, at most MAX_OPEN_JOBS (`capped` when there are more). */
  async openJobIdsOfCustomer(companyId: string, customerId: string): Promise<{ shipmentIds: string[]; capped: boolean }> {
    // What is not an id names no customer, and is kept from SQL.
    if (!isUuid(customerId)) return { shipmentIds: [], capped: false };
    const ids = await shipmentRepository.openJobIdsOfCustomer(companyId, customerId, MAX_OPEN_JOBS + 1);
    return { shipmentIds: ids.slice(0, MAX_OPEN_JOBS), capped: ids.length > MAX_OPEN_JOBS };
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

  /**
   * The one-off rename after references got the letters of their freight mode (owner decision,
   * 3 Nov 2026): each live shipment of the company takes the letters of its Freight Mode and Load
   * Type, the number kept - except one whose reference is final: Invoicing has taken it for an
   * invoice number, the job is marked Invoiced, or an invoice was issued for it before the shipment
   * kept its own flag. Invoicing is asked a few shipments at a time, right before they are renamed;
   * each rename is worked out again under the shipment's write turn, from the row as it is then.
   * Each rename is audited as the user who ran it; the quote follows (Trucking and the warehouse
   * keep the reference they copied). Safe to run again.
   */
  async normalizeReferences(companyId: string, userId: string): Promise<ReferenceNormalizeResult> {
    const rows = await shipmentRepository.referencesOf(companyId);
    const needLetters = (row: ShipmentReference) => jobNumberFor(row.jobNumber, row.freightMode, row.loadType) !== row.jobNumber;
    const keptInvoiced: string[] = [];
    const wanted: ShipmentReference[] = [];
    for (const row of rows.filter(needLetters)) {
      if (referenceIsFinal(row)) keptInvoiced.push(row.jobNumber);
      else wanted.push(row);
    }
    const quotesToTell = new Set<string>();
    let renamed = 0;
    for (let i = 0; i < wanted.length; i += NORMALIZE_CHUNK) {
      const chunk = wanted.slice(i, i + NORMALIZE_CHUNK);
      const { shipmentIds } = await invoicing._internalInvoicedShipments({ shipmentIds: chunk.map((row) => row.id) });
      const invoiced = new Set(shipmentIds);
      for (const row of chunk) {
        if (invoiced.has(row.id)) {
          keptInvoiced.push(row.jobNumber);
          continue;
        }
        // Worked out again from the row under its write turn: whatever was written since the read wins.
        const outcome = await shipmentRepository.writeTurn(row.id, companyId, async (tx): Promise<{ kept: string } | { renamed: ShipmentRecord } | null> => {
          const current = await shipmentRepository.referenceInTurn(tx, row.id, companyId);
          if (!current || !needLetters(current)) return null;
          if (referenceIsFinal(current)) return { kept: current.jobNumber };
          const done = await this.renameInTurn(tx, companyId, userId, current, jobNumberFor(current.jobNumber, current.freightMode, current.loadType));
          return done ? { renamed: done } : null;
        });
        if (!outcome) continue;
        if ("kept" in outcome) {
          keptInvoiced.push(outcome.kept);
          continue;
        }
        renamed++;
        const salesNumber = outcome.renamed.salesNumber.trim();
        if (salesNumber) quotesToTell.add(salesNumber);
      }
    }
    for (const salesNumber of quotesToTell) await this.tellQuote(companyId, salesNumber);
    return { checked: rows.length, renamed, keptInvoiced };
  }

  // A shipment on a master job keeps its filling (lib/masterJobKind): its Load Type is the master
  // job's, so a CZLCL job on a CZCONSOL master can't become Full Load while it is there. A Load Type
  // cleared, or one the master job has, goes through - the master job's own save writes its Load Type
  // onto its houses this way.
  private async assertLoadTypeFitsMasterJob(existing: ShipmentRecord, shipmentData: Partial<NewShipmentRecord>): Promise<void> {
    if (!("loadType" in shipmentData) || !existing.masterJobId) return;
    const next = shipmentData.loadType ?? null;
    if ((next ?? "").trim().toLowerCase() === (existing.loadType ?? "").trim().toLowerCase()) return;
    const masterJob = await masterJobRepository.getByIdForCompany(existing.masterJobId, existing.companyId);
    if (!masterJob) return;
    const others = (await shipmentRepository.findByMasterJobId(masterJob.id, existing.companyId)).filter((h) => h.id !== existing.id);
    const problem = houseLoadTypeProblem({ jobNumber: existing.jobNumber, loadType: next }, masterJob, others);
    if (problem) throw APIError.failedPrecondition(problem);
  }

  async linkMasterJob(shipmentId: string, companyId: string, mczNumber: string, userId?: string): Promise<ShipmentRecord | null> {
    let masterJob = await masterJobRepository.findByMczNumber(mczNumber, companyId);
    if (!masterJob) {
      // A master job made by linking to a number typed in records who made it. It has no Load Type
      // yet, so its reference has no letters (lib/masterJobNumber), whatever was typed. ("Create new"
      // in the Master Job dialog creates the job first, under the next free number, then links.)
      const createdBy = userId ? await this.actorOf(userId) : "";
      try {
        masterJob = await masterJobRepository.createForCompany(companyId, { mczNumber: masterJobNumberFor(mczNumber, null), createdBy });
      } catch (err) {
        // Another link to the same new number at the same moment created it first: this one joins it.
        if (!(isUniqueViolation(err) && constraintOf(err) === "master_job_company_mcz_unique")) throw err;
        masterJob = await masterJobRepository.findByMczNumber(mczNumber, companyId);
        if (!masterJob) throw err;
      }
    }
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: masterJob.id });
  }

  async unlinkMasterJob(shipmentId: string, companyId: string): Promise<ShipmentRecord | null> {
    return shipmentRepository.updateForCompany(shipmentId, companyId, { masterJobId: null });
  }
}

export const shipmentService = new ShipmentService();
