import { randomUUID } from "node:crypto";
import { czHolidays } from "../lib/czHolidays";
import { APIError, ErrCode } from "encore.dev/api";
import log from "encore.dev/log";
import { customers, quotes, shipments, warehouse } from "~encore/clients";
import { inTx, type Tx } from "../db/db";
import { consignmentRepository, STAMP_COLUMNS, type ConsignmentValues } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import { truckingDocumentRepository } from "../repositories/truckingDocument.repository";
import { truckingOutboxRepository, type TruckingOutboxInput } from "../repositories/truckingOutbox.repository";
import { appendEvent, listEvents } from "../repositories/event.repository";
import { exceptionRepository } from "../repositories/exception.repository";
import type { NewTruckingLegRecord, TruckingConsignmentRecord, TruckingLegRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { TruckingOutboxKind } from "../schemas/truckingOutbox.schema";
import type {
  ConsignmentCounts,
  ConsignmentDetail,
  ConsignmentFields,
  ConsignmentListItem,
  ConsignmentStatus,
  ConsignmentView,
  HubAddress,
  LegKind,
  PriceLine,
  PriceSnapshot,
  PricedSide,
  RateRequest,
  ServiceLevelCode,
  StampKind,
  Stop,
  StopInput,
  TariffScope,
} from "../interfaces/interfaces";
import type { WarehouseExceptionItem } from "../interfaces/avizace.interfaces";
import type { QuoteRoadPricing } from "../../quotes/interfaces/interfaces";
import { addDays, businessDay } from "../../../lib/businessDate";
import { isUuid } from "../../../lib/uuid";
import type { Actor } from "../../../lib/rbac";
import {
  cleanFields,
  cleanReason,
  consignmentStatus,
  marginOf,
  STAMP_KINDS,
  STAMP_LABEL,
  stampRefusal,
  stampTime,
  tripStatus,
  truckingRefYear,
  voidRefusal,
  type ConsignmentFacts,
} from "../lib/consignmentRules";
import { detail, eventItem, factsOf, listItem, moneyOf } from "../lib/consignmentView";
import { buyCosts, consignmentSourceRef, internalSourceRef, legSourceRef, noCosts, partnerLegCosts, sellCosts, tripSourceRef } from "../lib/truckingLinks";
import { isInternalDepartment, ROAD_DEPARTMENT } from "../lib/internalRules";
import { avizacePending, exceptionItem, podMissing } from "../lib/avizaceRules";
import { cleanLtlChoice, hubPlace, LEG_SEQ, legEnds, legKindsFor, ltlPromise, ltlStampRefusal, ltlStatus, type LtlChoice } from "../lib/ltlRules";
import { ltlFactsOf, ltlLegsOf } from "../lib/ltlView";
import { isPriced, promise, roundToStep, showPostcode } from "../lib/rateEngine";
import { formatDay } from "../lib/format";
import { isManager } from "../lib/roles";
import { userName } from "../lib/users";
import { eurRate, rateService } from "./rate.service";
import { settingsService } from "./settings.service";
import { deliverDue } from "./truckingOutbox.service";
import { ltlTrips } from "./ltlTrips";
import { internalBillingService } from "./internalBilling.service";

// Consignments: create (with a Shipments job, made when there is none), price (tariff, quote or
// an agreed price, never recomputed silently), edit, cancel, approve a low margin, and the stamps
// of the lifecycle. Every write and its event (and what it owes the job) go in one transaction;
// what is owed to Shipments and Invoicing is delivered afterwards through the outbox.

export const CONSIGNMENT_CONFLICT = "The consignment was changed by someone else. Reload and try again.";
const HOLIDAY_WINDOW_DAYS = 45;
const bad = (message: string) => APIError.invalidArgument(message);

export interface ConsignmentCreateInput extends ConsignmentFields {
  /** null = a Road / Domestic job is created */
  shipmentId: string | null;
  customerId: string;
}

export interface ConsignmentUpdateInput extends ConsignmentFields {
  version: number;
  /** Price again from the price source; otherwise the stored price stays */
  reprice: boolean;
}

export interface ConsignmentListQuery {
  status?: ConsignmentStatus;
  view?: ConsignmentView;
  search?: string;
  shipmentId?: string;
}

/** What a pricing gives a consignment. */
interface Priced {
  sell: PriceSnapshot;
  /** The cheapest usable buy price found (for the margin before a trip has its own) */
  estBuyCzk: number | null;
  serviceLevel: ServiceLevelCode | null;
  promisedDate: string | null;
  chargeableKg: number | null;
}

/** An outbox row owed by a change, sent as `actor`. */
export const owed = (
  actor: Pick<Actor, "userID" | "role">,
  c: { id: string; shipmentId: string },
  kind: TruckingOutboxKind,
  payload: object,
): TruckingOutboxInput => ({
  consignmentId: c.id,
  shipmentId: c.shipmentId,
  kind,
  payload: payload as Record<string, unknown>,
  actingUserId: actor.userID,
  actingRole: actor.role,
});

const today = () => businessDay(new Date());

const toStop = (s: StopInput, kind: Stop["kind"], before?: Stop): Stop => ({
  ...s,
  id: before?.id ?? randomUUID(),
  kind,
  actualArrival: before?.actualArrival ?? null,
  actualDeparture: before?.actualDeparture ?? null,
});

/** "Praha 110 00 → Brno 602 00" */
export const routeText = (pickup: StopInput, delivery: StopInput) =>
  `${pickup.city} ${pickup.country === "CZ" ? showPostcode(pickup.postcode) : pickup.postcode} → ${delivery.city} ${delivery.country === "CZ" ? showPostcode(delivery.postcode) : delivery.postcode}`;

const money = (n: number, currency: string) => `${roundToStep(n, 0.01).toLocaleString("en-US").replace(/,/g, " ")} ${currency}`;

/** The rate request of a consignment: one level, with buy prices (FTL unless said otherwise). */
export function rateRequestOf(
  f: Pick<ConsignmentFields, "pickupDate" | "pickupTime" | "pickup" | "delivery" | "load">,
  customerId: string | null,
  level: ServiceLevelCode | null,
  scope: TariffScope = "FTL",
): RateRequest {
  const l = f.load;
  return {
    fromPostcode: f.pickup.postcode,
    toPostcode: f.delivery.postcode,
    pickupDate: f.pickupDate,
    pickupTime: f.pickupTime,
    scope,
    pieces: l.pieces,
    palletPlaces: l.palletPlaces,
    ldm: l.ldm,
    weightKg: l.weightKg,
    cbm: l.cbm,
    extras: {
      adr: l.adr,
      tailLift: l.tailLift,
      avizace: f.pickup.avizaceRequired || f.delivery.avizaceRequired,
      timeWindow: !!(f.pickup.windowFrom || f.pickup.windowTo || f.delivery.windowFrom || f.delivery.windowTo),
      b2c: l.b2c,
      nonStackable: l.nonStackable,
      waitingHours: 0,
      declaredValueCzk: null,
    },
    customerId,
    serviceLevels: level ? [level] : null,
    includeBuy: true,
    includeInternal: false,
  };
}

/** A tariff price as stored with the consignment or the trip. */
export const snapshotOf = (side: PricedSide, level: ServiceLevelCode | null, ratedAt: string): PriceSnapshot => ({
  source: "TARIFF",
  tariffId: side.tariffId,
  tariffVersionId: side.tariffVersionId,
  versionNo: side.versionNo,
  tariffName: side.tariffName,
  serviceLevel: level,
  currency: side.currency,
  total: side.total,
  totalCzk: side.totalCzk,
  lines: side.lines,
  ratedAt,
  overrideReason: null,
});

/** An agreed price: one line, in CZK at the ČNB rate of `day` when in EUR. */
export async function manualSnapshot(total: number, currency: "CZK" | "EUR", reason: string, level: ServiceLevelCode | null, day: string): Promise<PriceSnapshot> {
  let totalCzk = total;
  if (currency === "EUR") {
    const fx = await eurRate(day);
    if (!fx) throw APIError.failedPrecondition(`No ČNB rate for EUR on ${formatDay(day)}: give the price in CZK`);
    totalCzk = roundToStep(total * fx.rate, 0.01);
  }
  const line: PriceLine = { code: "AGREED", label: "Agreed price", qty: 1, unit: "trip", unitPrice: total, amount: total };
  return {
    source: "MANUAL",
    tariffId: null,
    tariffVersionId: null,
    versionNo: null,
    tariffName: "",
    serviceLevel: level,
    currency,
    total,
    totalCzk,
    lines: [line],
    ratedAt: new Date().toISOString(),
    overrideReason: reason,
  };
}

const bothCz = (f: Pick<ConsignmentFields, "pickup" | "delivery">) => f.pickup.country === "CZ" && f.delivery.country === "CZ";

const scopeOf = (f: Pick<ConsignmentFields, "scope">): TariffScope => (f.scope === "LTL" ? "LTL" : "FTL");

/** The legs of an LTL consignment as they are written (all OPEN; a partner's delivery names the partner). */
export function newLegs(
  companyId: string,
  c: { id: string; pickup: StopInput; delivery: StopInput },
  choice: LtlChoice,
  hub: HubAddress,
): NewTruckingLegRecord[] {
  return legKindsFor(choice, true).map((kind: LegKind) => {
    const { from, to } = legEnds(kind, c, hubPlace(hub), null);
    return {
      companyId,
      consignmentId: c.id,
      tripId: null,
      seq: LEG_SEQ[kind],
      kind,
      status: "OPEN" as const,
      fromText: from.text,
      toText: to.text,
      fromPostcode: from.postcode,
      toPostcode: to.postcode,
      haulierCustomerId: kind === "DELIVERY" && choice.lastMile === "PARTNER" ? choice.partnerHaulierCustomerId : null,
    };
  });
}

class ConsignmentService {
  // ---- reading -----------------------------------------------------------------------------------

  /** The consignment and its live trip; 404 when it is not one of the company's. */
  async load(companyId: string, id: string): Promise<{ c: TruckingConsignmentRecord; trip: TruckingTripRecord | null }> {
    const c = isUuid(id) ? await consignmentRepository.find(companyId, id) : null;
    if (!c) throw APIError.notFound("Consignment not found");
    const trip = c.tripId ? await tripRepository.find(companyId, c.tripId) : null;
    return { c, trip };
  }

  /** The LTL legs of consignments and the trips they are on. */
  async ltlContext(companyId: string, ids: string[], reader?: Tx): Promise<{ legs: TruckingLegRecord[]; tripOf: Map<string, TruckingTripRecord> }> {
    const legs = (await legRepository.forConsignments(companyId, ids, reader)).filter((l) => l.kind !== "DIRECT");
    const trips = await tripRepository.findMany(companyId, [...new Set(legs.map((l) => l.tripId).filter((x): x is string => !!x))], reader);
    return { legs, tripOf: new Map(trips.map((t) => [t.id, t])) };
  }

  async get(actor: Actor, id: string): Promise<ConsignmentDetail> {
    const { c, trip } = await this.load(actor.companyID, id);
    const [settings, events, ltl, exceptions, warehouseExceptions, real] = await Promise.all([
      settingsService.get(actor.companyID),
      listEvents(actor.companyID, { consignmentId: c.id }),
      c.scope === "LTL" ? this.ltlContext(actor.companyID, [c.id]) : Promise.resolve(null),
      exceptionRepository.forConsignments(actor.companyID, [c.id]),
      c.scope === "LTL" ? warehouseExceptionsOf(c.shipmentId) : Promise.resolve([]),
      consignmentRepository.legRealCosts(actor.companyID, [c.id]),
    ]);
    const legs = ltl?.legs ?? [];
    const tripRefs = new Map([...(ltl?.tripOf.values() ?? [])].map((t) => [t.id, t.ref]));
    const shownTrip = ltl ? currentTrip(c.id, legs, ltl.tripOf) : trip;
    return detail(
      c,
      shownTrip,
      settings.marginFloor,
      events.map(eventItem),
      isManager(actor.role),
      today(),
      new Date(),
      legs,
      tripRefs,
      exceptions.map(exceptionItem),
      warehouseExceptions,
      real,
    );
  }

  async list(actor: Actor, q: ConsignmentListQuery): Promise<{ consignments: ConsignmentListItem[]; counts: ConsignmentCounts }> {
    if (q.shipmentId && !isUuid(q.shipmentId)) return { consignments: [], counts: emptyCounts() };
    const rows = await consignmentRepository.list(actor.companyID, { status: q.status, shipmentId: q.shipmentId });
    const tripIds = [...new Set(rows.map((r) => r.tripId).filter((x): x is string => !!x))];
    const day = today();
    const [trips, settings, ltl, openExceptions, real, extraHolidays] = await Promise.all([
      tripRepository.findMany(actor.companyID, tripIds),
      settingsService.get(actor.companyID),
      this.ltlContext(actor.companyID, rows.filter((r) => r.scope === "LTL").map((r) => r.id)),
      exceptionRepository.openCounts(actor.companyID, rows.map((r) => r.id)),
      consignmentRepository.legRealCosts(actor.companyID, rows.map((r) => r.id)),
      // Company holidays of the last weeks, for "POD missing" in working days.
      rows.some((r) => r.deliveredAt && !r.podReceivedAt)
        ? czHolidays(actor.companyID, addDays(day, -HOLIDAY_WINDOW_DAYS), day)
        : Promise.resolve([] as string[]),
    ]);
    const tripOf = new Map([...trips.map((t) => [t.id, t] as const), ...ltl.tripOf]);
    const tripFor = (c: TruckingConsignmentRecord) => (c.scope === "LTL" ? currentTrip(c.id, ltl.legs, ltl.tripOf) : c.tripId ? (tripOf.get(c.tripId) ?? null) : null);
    const now = new Date();
    const search = (q.search ?? "").trim().toLowerCase();
    const flags: ViewFlags = {
      podMissing: new Set(rows.filter((c) => podMissing(c, day, extraHolidays)).map((c) => c.id)),
      avizacePending: new Set(rows.filter(avizacePending).map((c) => c.id)),
    };
    const items = rows
      .map((c) => listItem(c, tripFor(c), settings.marginFloor, day, now, ltl.legs, openExceptions.get(c.id) ?? 0, real))
      .filter(
        (i) =>
          !search ||
          [i.ref, i.jobNumber, i.customerName, i.pickupCity, i.pickupPostcode, i.deliveryCity, i.deliveryPostcode, i.tripRef ?? "", i.haulierName ?? ""].some((v) =>
            v.toLowerCase().includes(search),
          ),
      );
    const counts = countsOf(items, day, flags);
    return { consignments: q.view ? items.filter((i) => inView(i, q.view!, day, flags)) : items, counts };
  }

  // ---- pricing -----------------------------------------------------------------------------------

  /** The promised delivery date of a level for a pick-up (D+N in working days); null without a level. */
  async promiseFor(companyId: string, level: ServiceLevelCode | null, pickupDate: string, pickupTime: string | null): Promise<string | null> {
    if (!level) return null;
    const [settings, extra] = await Promise.all([
      settingsService.get(companyId),
      czHolidays(companyId, pickupDate, addDays(pickupDate, HOLIDAY_WINDOW_DAYS)),
    ]);
    const setting = settings.serviceLevels.find((l) => l.code === level);
    return setting ? promise(setting, pickupDate, pickupTime, "FTL", extra).promisedDate : null;
  }

  /** The sell price of a consignment from its source. */
  async price(companyId: string, customerId: string, f: ConsignmentFields): Promise<Priced> {
    const p = f.price;
    if (p.source === "TARIFF") {
      if (!bothCz(f)) throw APIError.failedPrecondition("The tariffs price CZ postcodes only: give an agreed price");
      const rated = await rateService.rate(companyId, rateRequestOf(f, customerId, f.serviceLevel, scopeOf(f)));
      const result = rated.results[0];
      if (!result) throw APIError.failedPrecondition("That service level is not in the trucking settings");
      if (!isPriced(result.sell)) throw APIError.failedPrecondition(result.sell.reason);
      return {
        sell: snapshotOf(result.sell, result.serviceLevel, rated.ratedAt),
        estBuyCzk: result.buy[0]?.totalCzk ?? null,
        serviceLevel: result.serviceLevel,
        promisedDate: result.promisedDate,
        chargeableKg: result.sell.chargeable.basis === "KG" ? result.sell.chargeable.quantity : null,
      };
    }
    if (p.source === "QUOTE") return this.quotePrice(companyId, customerId, f);
    const sell = await manualSnapshot(p.total, p.currency, p.reason, f.serviceLevel, f.pickupDate);
    return {
      sell,
      estBuyCzk: await this.cheapestBuy(companyId, customerId, f),
      serviceLevel: f.serviceLevel,
      promisedDate: await this.promiseFor(companyId, f.serviceLevel, f.pickupDate, f.pickupTime),
      chargeableKg: null,
    };
  }

  // The cheapest usable buy price for an agreed sell price, for the margin; null when it cannot be rated.
  private async cheapestBuy(companyId: string, customerId: string, f: ConsignmentFields): Promise<number | null> {
    if (!bothCz(f) || !f.serviceLevel) return null;
    try {
      const rated = await rateService.rate(companyId, rateRequestOf(f, customerId, f.serviceLevel, scopeOf(f)));
      return rated.results[0]?.buy[0]?.totalCzk ?? null;
    } catch {
      return null;
    }
  }

  // The price of a road quote (its last pricing from the tariffs): same customer, priced, not lost.
  private async quotePrice(companyId: string, customerId: string, f: ConsignmentFields): Promise<Priced> {
    const number = f.quoteNumber!;
    let quote;
    try {
      ({ quote } = await quotes.salesQuoteGet({ quoteNumber: number }));
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw bad(`Quote ${number} not found`);
      throw err;
    }
    if (quote.customerId !== customerId) throw APIError.failedPrecondition(`Quote ${quote.quoteNumber} is for another customer`);
    if (quote.status === "lost" || quote.effectiveStatus === "lost") throw APIError.failedPrecondition(`Quote ${quote.quoteNumber} is lost`);
    const data = (quote.data && typeof quote.data === "object" ? quote.data : {}) as Record<string, unknown>;
    const rp = data.roadPricing as QuoteRoadPricing | undefined;
    if (!rp?.sell) throw APIError.failedPrecondition(`Quote ${quote.quoteNumber} was not priced from the trucking tariffs`);
    const lines = (Array.isArray(data.sellingLines) ? data.sellingLines : [])
      .filter((l): l is Record<string, unknown> => !!l && typeof l === "object" && typeof (l as Record<string, unknown>).tariffRef === "string" && String((l as Record<string, unknown>).tariffRef).startsWith("trucking:"))
      .map(
        (l): PriceLine => ({
          code: String(l.chargeCode ?? "road_freight"),
          label: String(l.description ?? ""),
          qty: Number(l.qty) || 1,
          unit: String(l.unit ?? ""),
          unitPrice: Number(l.unitPrice) || 0,
          amount: Number(l.amount) || 0,
        }),
      );
    const level = f.serviceLevel ?? rp.serviceLevel;
    return {
      sell: {
        source: "QUOTE",
        tariffId: rp.sell.tariffId,
        tariffVersionId: rp.sell.tariffVersionId,
        versionNo: rp.sell.versionNo,
        tariffName: rp.sell.tariffName,
        serviceLevel: rp.serviceLevel,
        currency: rp.sell.currency,
        total: rp.sell.total,
        totalCzk: rp.sell.totalCzk,
        lines: lines.length ? lines : [{ code: "road_freight", label: `Quote ${quote.quoteNumber}`, qty: 1, unit: "trip", unitPrice: rp.sell.total, amount: rp.sell.total }],
        ratedAt: rp.ratedAt,
        overrideReason: null,
      },
      estBuyCzk: rp.buy?.totalCzk ?? null,
      serviceLevel: level,
      promisedDate: await this.promiseFor(companyId, level, f.pickupDate, f.pickupTime),
      chargeableKg: null,
    };
  }

  /**
   * What an LTL edit does to the legs: drawn again when every leg is still open and the route or
   * the choice (brought by the customer, last mile, partner) changed; refused once a leg is planned
   * and the route, the load or the choice would change under it.
   */
  private async ltlLegPlan(companyId: string, c: TruckingConsignmentRecord, f: ConsignmentFields, ltl: LtlChoice) {
    const legs = ltlLegsOf(c.id, await legRepository.forConsignments(companyId, [c.id]));
    const planned = legs.some((l) => l.status !== "OPEN");
    const choiceChanged = ltl.selfDelivered !== c.selfDelivered || ltl.lastMile !== c.lastMile || ltl.partnerHaulierCustomerId !== c.partnerHaulierCustomerId;
    const placesChanged = placeKey(f.pickup) !== placeKey(c.pickup) || placeKey(f.delivery) !== placeKey(c.delivery);
    const loadChanged = JSON.stringify(f.load) !== JSON.stringify(c.load);
    return {
      legIds: legs.map((l) => l.id),
      rebuild: !planned && (choiceChanged || placesChanged),
      changed: choiceChanged || placesChanged || loadChanged,
      refusal: planned ? "The consignment is planned: take its legs off their trips (and remove the partner's delivery price) before changing the route, the load or the last mile" : null,
    };
  }

  /** The promised date counted from a confirmed gate-in for a level; `fallback` when the level gives none. */
  async promiseFromGateIn(companyId: string, level: ServiceLevelCode | null, gateInAt: Date, fallback: string | null): Promise<string | null> {
    if (!level) return fallback;
    const day = businessDay(gateInAt);
    const [settings, extra] = await Promise.all([
      settingsService.get(companyId),
      czHolidays(companyId, day, addDays(day, HOLIDAY_WINDOW_DAYS)),
    ]);
    const setting = settings.serviceLevels.find((l) => l.code === level) ?? null;
    return ltlPromise(setting, gateInAt, day, extra)?.promisedDate ?? fallback;
  }

  // ---- create / update ---------------------------------------------------------------------------

  private async customerName(customerId: string): Promise<string> {
    if (!isUuid(customerId)) throw bad("Unknown customer");
    try {
      return (await customers.customerGet({ id: customerId })).customer.companyName;
    } catch (err) {
      if (err instanceof APIError && err.code === ErrCode.NotFound) throw bad("Unknown customer");
      throw err;
    }
  }

  // The job a consignment is put under: live, and for the same customer when it names one.
  private async job(shipmentId: string, customerId: string): Promise<{ shipmentId: string; jobNumber: string; department: string }> {
    if (!isUuid(shipmentId)) throw bad("Unknown job");
    const { shipments: found } = await shipments._internalShipmentBasics({ ids: [shipmentId] });
    const job = found[0];
    if (!job) throw APIError.notFound("Job not found");
    if (job.customerId && job.customerId !== customerId) throw APIError.failedPrecondition(`Job ${job.jobNumber} is for another customer`);
    return { shipmentId: job.id, jobNumber: job.jobNumber, department: job.department ?? "" };
  }

  // The job's department now (Shipments may have changed it); the stored one when the job cannot be read.
  private async departmentOf(c: TruckingConsignmentRecord): Promise<string> {
    const { shipments: found } = await shipments._internalShipmentBasics({ ids: [c.shipmentId] });
    return found[0] ? (found[0].department ?? "") : c.department;
  }

  /** Any user. Prices the consignment (a price below the floor is saved, the transport order then waits for approval). */
  async create(actor: Actor, input: ConsignmentCreateInput): Promise<ConsignmentDetail> {
    const companyId = actor.companyID;
    const f = cleanFields(input);
    const ltl = f.scope === "LTL" ? cleanLtlChoice(f) : null;
    const customerName = await this.customerName(input.customerId);
    const existingJob = input.shipmentId ? await this.job(input.shipmentId, input.customerId) : null;
    const priced = await this.price(companyId, input.customerId, f);
    const { marginFloor, hub } = await settingsService.get(companyId);
    const belowFloor = marginOf(priced.sell.totalCzk, priced.estBuyCzk, marginFloor).belowFloor;
    const by = await userName(actor.userID);
    // A domestic-only order gets its Road / Domestic job first (another database: no shared transaction).
    const job = existingJob ?? { department: ROAD_DEPARTMENT, ...(await shipments._internalShipmentCreateRoad({
      customerId: input.customerId,
      customerName,
      shipper: f.pickup.name,
      consignee: f.delivery.name,
      pickupAddress: [f.pickup.name, f.pickup.street, `${f.pickup.postcode} ${f.pickup.city}`].filter(Boolean).join(", "),
      pickupSiteId: f.pickup.siteId,
      pickupPostcode: f.pickup.postcode,
      pickupCountry: f.pickup.country,
      deliveryAddress: [f.delivery.name, f.delivery.street, `${f.delivery.postcode} ${f.delivery.city}`].filter(Boolean).join(", "),
      deliverySiteId: f.delivery.siteId,
      deliveryPostcode: f.delivery.postcode,
      deliveryCountry: f.delivery.country,
      pickupDate: f.pickupDate,
      pickupTime: f.pickupTime ?? "",
      plannedDeliveryDate: priced.promisedDate,
      cargoDescription: f.load.description,
      customerReference: f.pickup.reference,
      quoteNumber: f.quoteNumber,
      createdBy: by ? `Trucking · ${by}` : "Trucking",
      // LTL goes through our warehouse's consolidation: the job (and the warehouse position made from it) says so.
      loadType: f.scope === "LTL" ? "Consolidation" : "Full Load",
    })) };
    // A job of another department is billed internally (no customer selling lines).
    const internal = isInternalDepartment(job.department);
    const now = new Date();
    const created = await inTx(async (tx) => {
      const ref = await consignmentRepository.allocateRef(tx, companyId, "TCZ", truckingRefYear(now));
      const row = await consignmentRepository.insert(tx, {
        companyId,
        ref,
        shipmentId: job.shipmentId,
        jobNumber: job.jobNumber,
        customerId: input.customerId,
        customerName,
        quoteNumber: f.quoteNumber,
        scope: ltl ? "LTL" : "FTL",
        selfDelivered: ltl?.selfDelivered ?? false,
        lastMile: ltl?.lastMile ?? null,
        partnerHaulierCustomerId: ltl?.partnerHaulierCustomerId ?? null,
        serviceLevel: priced.serviceLevel,
        status: "BOOKED",
        pickupDate: f.pickupDate,
        pickupTime: f.pickupTime,
        pickup: toStop(f.pickup, "PICKUP"),
        delivery: toStop(f.delivery, "DELIVERY"),
        load: f.load,
        promisedDate: priced.promisedDate,
        chargeableKg: priced.chargeableKg,
        sell: priced.sell,
        sellCzk: priced.sell.totalCzk,
        estBuyCzk: priced.estBuyCzk,
        belowFloor,
        createdByUserId: actor.userID || null,
        department: job.department,
        internal,
      });
      await appendEvent(tx, companyId, {
        kind: "consignment_created",
        consignmentId: row.id,
        customerId: row.customerId,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          summary: `Created ${ref}${ltl ? " (groupage)" : ""} for job ${job.jobNumber}: ${routeText(f.pickup, f.delivery)}, ${money(priced.sell.total, priced.sell.currency)} (${priced.sell.source.toLowerCase()})`,
          facts: { source: priced.sell.source, belowFloor, jobCreated: !input.shipmentId, scope: row.scope, internal, department: job.department },
        },
      });
      if (ltl) await legRepository.insertMany(tx, newLegs(companyId, row, ltl, hub));
      if (!internal) await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, row, "costs", sellCosts(row))]);
      return row;
    });
    await deliverDue(created.id);
    return this.get(actor, created.id);
  }

  /**
   * Any user, with the version read. After the pick-up only notes and references may change.
   * `reprice` prices again from the source; otherwise the stored price stays as it is.
   */
  async update(actor: Actor, id: string, input: ConsignmentUpdateInput): Promise<ConsignmentDetail> {
    const companyId = actor.companyID;
    const { c, trip } = await this.load(companyId, id);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    if (!Number.isInteger(input.version) || input.version !== c.version) throw APIError.aborted(CONSIGNMENT_CONFLICT);
    const f = cleanFields({ ...input, scope: input.scope ?? c.scope });
    if (f.scope !== c.scope) throw APIError.failedPrecondition("FTL / LTL cannot change: cancel the consignment and book it again");
    const ltl = c.scope === "LTL" ? cleanLtlChoice(f) : null;
    const legPlan = ltl ? await this.ltlLegPlan(companyId, c, f, ltl) : null;
    if (c.pickedUpAt || c.gateInAt) {
      if (input.reprice) throw APIError.failedPrecondition("After the pick-up the price cannot change");
      if (lockedPart(f, f.price) !== lockedPart(storedFields(c), f.price)) throw APIError.failedPrecondition("After the pick-up only notes and references can change");
    }
    const priced = input.reprice ? await this.price(companyId, c.customerId, f) : null;
    const level = priced?.serviceLevel ?? f.serviceLevel;
    const dateMoved = f.pickupDate !== c.pickupDate || f.pickupTime !== c.pickupTime || level !== c.serviceLevel;
    let promisedDate = priced ? priced.promisedDate : dateMoved ? await this.promiseFor(companyId, level, f.pickupDate, f.pickupTime) : c.promisedDate;
    // LTL after the gate-in: the date counts from the confirmed gate-in (the level may have changed).
    if (ltl && c.promisedFinal && c.gateInAt) promisedDate = level === c.serviceLevel ? c.promisedDate : await this.promiseFromGateIn(companyId, level, c.gateInAt, c.promisedDate);
    const { marginFloor, hub } = await settingsService.get(companyId);
    const sell = priced?.sell ?? c.sell;
    const estBuyCzk = priced ? priced.estBuyCzk : c.estBuyCzk;
    const liveTrip = trip && !trip.cancelledAt ? trip : null;
    const belowFloor = marginOf(sell?.totalCzk ?? null, liveTrip?.buyCzk ?? estBuyCzk, marginFloor).belowFloor;
    const department = await this.departmentOf(c);
    const internal = isInternalDepartment(department);
    const values: ConsignmentValues = {
      quoteNumber: f.quoteNumber,
      serviceLevel: level,
      pickupDate: f.pickupDate,
      pickupTime: f.pickupTime,
      pickup: toStop(f.pickup, "PICKUP", c.pickup),
      delivery: toStop(f.delivery, "DELIVERY", c.delivery),
      load: f.load,
      promisedDate,
      ...(ltl ? { selfDelivered: ltl.selfDelivered, lastMile: ltl.lastMile, partnerHaulierCustomerId: ltl.partnerHaulierCustomerId } : {}),
      ...(priced ? { sell: priced.sell, sellCzk: priced.sell.totalCzk, estBuyCzk: priced.estBuyCzk, chargeableKg: priced.chargeableKg } : {}),
      belowFloor,
      department,
      internal,
    };
    const changes = changedFields(c, values);
    if (!Object.keys(changes).length && !priced) return this.get(actor, id);
    if (legPlan?.refusal && legPlan.changed) throw APIError.failedPrecondition(legPlan.refusal);
    const by = await userName(actor.userID);
    await inTx(async (tx) => {
      const row = await consignmentRepository.update(tx, companyId, id, values, { version: c.version, live: true });
      if (!row) throw APIError.aborted(CONSIGNMENT_CONFLICT);
      const owes: TruckingOutboxInput[] = [];
      if (internal !== c.internal) owes.push(...(await this.costsAfterFlip(tx, actor, row, liveTrip)));
      else if (priced && !internal) owes.push(owed(actor, row, "costs", sellCosts(row)));
      // LTL with every leg still open: the legs are drawn again from the new route and choice.
      if (ltl && legPlan?.rebuild) {
        await legRepository.retire(tx, companyId, legPlan.legIds);
        await legRepository.insertMany(tx, newLegs(companyId, { id, pickup: f.pickup, delivery: f.delivery }, ltl, hub));
      }
      // FTL: the trip is picked up when the consignment is; the job learns the new dates.
      if (liveTrip && dateMoved) {
        await tripRepository.update(tx, companyId, liveTrip.id, { plannedPickupDate: f.pickupDate }, { live: true });
        owes.push(owed(actor, row, "planned", { pickupDate: f.pickupDate, ...(promisedDate ? { plannedDeliveryDate: promisedDate } : {}) }));
      }
      await appendEvent(tx, companyId, {
        kind: "consignment_updated",
        consignmentId: id,
        tripId: liveTrip?.id ?? null,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes,
          summary: priced
            ? `Repriced: ${money(priced.sell.total, priced.sell.currency)} (${priced.sell.source.toLowerCase()})`
            : `Changed ${Object.keys(changes).join(", ")}`,
        },
      });
      await truckingOutboxRepository.enqueue(tx, companyId, owes);
    });
    await deliverDue(id);
    return this.get(actor, id);
  }

  /**
   * The job's department changed sides (Road ↔ another department): what the job's Costs get
   * instead. Internal now: the selling lines and the haulier's costs leave the job (an LTL trip
   * is settled again without the job), the internal line is sent as it stands. Road again: the
   * selling lines, the trip's or the partner's buying lines come back, the internal line goes.
   */
  private async costsAfterFlip(tx: Tx, actor: Actor, row: TruckingConsignmentRecord, trip: TruckingTripRecord | null): Promise<TruckingOutboxInput[]> {
    const companyId = actor.companyID;
    const internal = row.internal;
    const owes: TruckingOutboxInput[] = [owed(actor, row, "costs", internal ? noCosts(consignmentSourceRef(row.id)) : sellCosts(row))];
    if (trip && row.scope === "FTL") owes.push(owed(actor, row, "costs", internal ? noCosts(tripSourceRef(trip.id)) : buyCosts(trip)));
    if (row.scope === "LTL") {
      const legs = ltlLegsOf(row.id, await legRepository.forConsignments(companyId, [row.id], tx));
      const partnerLegs = legs.filter((l) => l.buy && !l.tripId && l.haulierCustomerId);
      const names = partnerLegs.length && !internal ? await haulierNames(partnerLegs.map((l) => l.haulierCustomerId!)) : new Map<string, string>();
      for (const l of partnerLegs) {
        const partner = { id: l.haulierCustomerId!, name: names.get(l.haulierCustomerId!) ?? "" };
        owes.push(owed(actor, row, "costs", internal ? noCosts(legSourceRef(l.id)) : partnerLegCosts(l, row.ref, partner)));
      }
      for (const tripId of new Set(legs.map((l) => l.tripId).filter((x): x is string => !!x))) {
        const locked = await tripRepository.lock(tx, companyId, tripId);
        if (locked && !locked.cancelledAt) await ltlTrips.settle(tx, actor, locked);
      }
    }
    owes.push(internal ? await internalBillingService.lineOwed(tx, actor, row) : owed(actor, row, "costs", noCosts(internalSourceRef(row.id))));
    return owes;
  }

  // ---- cancel / approve --------------------------------------------------------------------------

  /** Manager. Refused after the pick-up. Its trip is cancelled with it and its Trucking cost lines removed. */
  async cancel(actor: Actor, id: string, reason: unknown): Promise<ConsignmentDetail> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can cancel a consignment");
    const why = cleanReason(reason, "a reason for the cancellation");
    const { c, trip } = await this.load(actor.companyID, id);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is already cancelled");
    if (c.pickedUpAt) throw APIError.failedPrecondition("The goods are picked up: the consignment can no longer be cancelled");
    if (c.gateInAt) throw APIError.failedPrecondition("The goods are at our warehouse: the consignment can no longer be cancelled");
    const by = await userName(actor.userID);
    await inTx((tx) => this.cancelInTx(tx, actor, c, trip, by, why, `Cancelled: ${why}`));
    await deliverDue(c.scope === "LTL" ? undefined : id);
    return this.get(actor, id);
  }

  /**
   * Cancels a consignment (not picked up) and its live trip in the caller's transaction: the
   * haulier's link is revoked, the leg retired, the cost lines of both removed and the job's
   * Billing settled again (the others may now all have POD). False when it was picked up or
   * cancelled meanwhile.
   */
  async cancelInTx(
    tx: Tx,
    actor: Pick<Actor, "userID" | "role" | "companyID">,
    c: TruckingConsignmentRecord,
    trip: TruckingTripRecord | null,
    by: string,
    why: string,
    summary: string,
  ): Promise<boolean> {
    const companyId = actor.companyID;
    const now = new Date();
    const row = await consignmentRepository.update(
      tx,
      companyId,
      c.id,
      { cancelledAt: now, cancelledBy: by, cancelReason: why, status: "CANCELLED" },
      { beforePickup: true },
    );
    if (!row) return false;
    const owes: TruckingOutboxInput[] = [owed(actor, c, "costs", noCosts(consignmentSourceRef(c.id)))];
    if (c.scope === "LTL") {
      // Its legs leave their trips (whose prices are split again over the legs left) and a partner's delivery lines go.
      const legs = ltlLegsOf(c.id, await legRepository.forConsignments(companyId, [c.id], tx));
      for (const l of legs.filter((x) => x.buy && !x.tripId)) owes.push(owed(actor, c, "costs", noCosts(legSourceRef(l.id))));
      await legRepository.retire(tx, companyId, legs.map((l) => l.id));
      for (const tripId of new Set(legs.map((l) => l.tripId).filter((x): x is string => !!x))) {
        const locked = await tripRepository.lock(tx, companyId, tripId);
        if (locked && !locked.cancelledAt) await ltlTrips.settle(tx, actor, locked);
      }
    }
    if (trip && !trip.cancelledAt) {
      await tripRepository.update(tx, companyId, trip.id, { cancelledAt: now, cancelledBy: by, cancelReason: why, status: "CANCELLED" }, { live: true });
      await tripRepository.revokeLinks(tx, companyId, trip.id);
      await consignmentRepository.retireLegs(tx, companyId, trip.id);
      owes.push(owed(actor, c, "costs", noCosts(tripSourceRef(trip.id))));
    }
    await appendEvent(tx, companyId, {
      kind: "consignment_cancelled",
      consignmentId: c.id,
      tripId: trip?.id ?? null,
      byUserId: actor.userID || null,
      byName: by,
      payload: { changes: { status: { before: c.status, after: "CANCELLED" } }, reason: why, summary },
    });
    await truckingOutboxRepository.enqueue(tx, companyId, owes);
    await this.settleBilling(tx, actor, c.shipmentId, c.id, by);
    return true;
  }

  /** Manager, only while the margin is below the floor and not yet approved. */
  async approveMargin(actor: Actor, id: string, reason: unknown): Promise<ConsignmentDetail> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can approve a margin below the floor");
    const why = cleanReason(reason, "a reason for the approval");
    const { c, trip } = await this.load(actor.companyID, id);
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    const { marginFloor } = await settingsService.get(actor.companyID);
    // LTL: judged with its legs' shares of their trips and its partner's price; real where invoiced and approved.
    const [legs, real] = await Promise.all([
      c.scope === "LTL" ? this.ltlContext(actor.companyID, [c.id]).then((x) => x.legs) : Promise.resolve([]),
      consignmentRepository.legRealCosts(actor.companyID, [c.id]),
    ]);
    const m = moneyOf(c, trip, marginFloor, legs, real);
    if (!m.belowFloor) throw APIError.failedPrecondition("The margin is not below the floor");
    if (m.marginApproved) throw APIError.failedPrecondition("This margin is already approved");
    const by = await userName(actor.userID);
    const approval = { byUserId: actor.userID, byName: by, at: new Date().toISOString(), reason: why, marginCzk: m.marginCzk };
    await inTx(async (tx) => {
      const row = await consignmentRepository.update(tx, actor.companyID, id, { marginApproval: approval }, { version: c.version, live: true });
      if (!row) throw APIError.aborted(CONSIGNMENT_CONFLICT);
      await appendEvent(tx, actor.companyID, {
        kind: "margin_approved",
        consignmentId: id,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: {},
          reason: why,
          summary: `Margin ${m.marginCzk === null ? "" : money(m.marginCzk, "CZK")} approved below the floor: ${why}`,
          facts: { marginCzk: m.marginCzk, marginPercent: m.marginPercent },
        },
      });
    });
    return this.get(actor, id);
  }

  // ---- stamps ------------------------------------------------------------------------------------

  /**
   * Any user (POD received without a POD document: a manager). Set once by a guarded UPDATE: a
   * second stamp is refused with "Already stamped". In the lifecycle order; at = null is now, a
   * past time within 7 days is allowed.
   */
  async stamp(actor: Actor, id: string, kind: StampKind, at: string | null): Promise<ConsignmentDetail> {
    await this.stampChecked(actor, id, kind, at, { by: await userName(actor.userID), source: "USER", manager: isManager(actor.role) });
    return this.get(actor, id);
  }

  /**
   * Sets one stamp with every check of `stamp` (the lifecycle order, the trip's transport order,
   * an LTL consignment's legs and gate-in, the time), as `who`: a user, or the haulier through the
   * portal (source HAULIER, never a manager). Delivers what the job is owed.
   */
  async stampChecked(
    actor: Pick<Actor, "userID" | "role" | "companyID">,
    id: string,
    kind: StampKind,
    at: string | null,
    who: { by: string; source: "USER" | "HAULIER"; manager: boolean },
  ): Promise<void> {
    if (!STAMP_KINDS.includes(kind)) throw bad("Unknown stamp");
    const { c, trip } = await this.load(actor.companyID, id);
    const facts = factsOf(c, trip);
    if (facts[STAMP_COLUMNS[kind].at]) throw APIError.alreadyExists("Already stamped");
    const refusal = await this.stampRefusalOf(c, trip, kind, who.manager);
    if (refusal) throw APIError.failedPrecondition(refusal);
    const time = stampTime(at, new Date());
    assertAfterEarlier(kind, facts, time);
    await inTx((tx) => this.stampInTx(tx, actor, c, trip, kind, time, who.by, who.source));
    await deliverDue(id);
  }

  /** Why the stamp may not be set on the consignment now (FTL or LTL rules), or null. */
  async stampRefusalOf(c: TruckingConsignmentRecord, trip: TruckingTripRecord | null, kind: StampKind, manager: boolean): Promise<string | null> {
    const hasPod = kind === "podReceived" ? await truckingDocumentRepository.hasPod(c.companyId, c.id) : false;
    const opts = { hasPod, manager };
    return c.scope === "LTL"
      ? ltlStampRefusal(kind, c, await this.ltlContext(c.companyId, [c.id]).then((x) => ltlFactsOf(c, x.legs, x.tripOf).legs), opts)
      : stampRefusal(kind, factsOf(c, trip), opts);
  }

  /**
   * Sets one stamp in the caller's transaction (guarded: the stamp still empty, the version as
   * read), with the status, the trip's status, the event and what the job is owed. Throws
   * "Already stamped" (409) when it was set meanwhile, a conflict when anything else changed.
   */
  async stampInTx(
    tx: Tx,
    actor: Pick<Actor, "userID" | "role" | "companyID">,
    c: TruckingConsignmentRecord,
    trip: TruckingTripRecord | null,
    kind: StampKind,
    time: Date,
    by: string,
    source: "USER" | "HAULIER",
  ): Promise<TruckingConsignmentRecord> {
    const companyId = actor.companyID;
    const cols = STAMP_COLUMNS[kind];
    const next: ConsignmentFacts = { ...factsOf(c, trip), [cols.at]: time };
    const status = c.scope === "LTL" ? await this.ltlStatusAfter(tx, companyId, c, { [cols.at]: time }) : consignmentStatus(next);
    const values: ConsignmentValues = { [cols.at]: time, [cols.by]: by, status };
    if (kind === "podReceived") values.podSource = source;
    const row = await consignmentRepository.update(tx, companyId, c.id, values, { stampEmpty: kind, version: c.version });
    if (!row) {
      const now = await consignmentRepository.find(companyId, c.id, tx);
      if (now?.[cols.at]) throw APIError.alreadyExists("Already stamped");
      throw APIError.aborted(CONSIGNMENT_CONFLICT);
    }
    if (trip && !trip.cancelledAt) {
      const tripValues = kind === "confirmed" && !trip.confirmedAt ? { confirmedAt: time, confirmedVia: "USER" as const, confirmedBy: by } : {};
      const status = tripStatus({ ...trip, ...tripValues }, row);
      if (status !== trip.status || Object.keys(tripValues).length) await tripRepository.update(tx, companyId, trip.id, { ...tripValues, status }, { live: true });
    }
    await appendEvent(tx, companyId, {
      kind: "stamp_set",
      consignmentId: c.id,
      tripId: trip?.id ?? null,
      byUserId: source === "USER" ? actor.userID || null : null,
      byName: by,
      payload: { changes: { [kind]: { before: null, after: time.toISOString() } }, summary: `${STAMP_LABEL[kind]}: ${stampText(time)}${source === "HAULIER" ? " (by the haulier)" : ""}`, facts: { kind, source } },
    });
    if (kind === "delivered") {
      await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, c, "delivered", { actualDeliveryDate: businessDay(time) })]);
      if (c.scope === "LTL") await this.markDeliveryLeg(tx, companyId, c.id, true);
    }
    if (kind === "podReceived") {
      // A job of another department is charged from the Internal tariff once the POD is in.
      if (row.internal) await internalBillingService.chargeDelivered(tx, actor, row, by, internalRateRequest(row));
      await this.settleBilling(tx, actor, c.shipmentId, c.id, by);
    }
    return row;
  }

  /** The status an LTL consignment gets with `patch` applied to its stamps / gate times. */
  async ltlStatusAfter(tx: Tx, companyId: string, c: TruckingConsignmentRecord, patch: Partial<TruckingConsignmentRecord>): Promise<ConsignmentStatus> {
    const { legs, tripOf } = await this.ltlContext(companyId, [c.id], tx);
    return ltlStatus(ltlFactsOf({ ...c, ...patch }, legs, tripOf));
  }

  // The delivery leg is done when the consignment is delivered (and back to planned when voided).
  private async markDeliveryLeg(tx: Tx, companyId: string, consignmentId: string, done: boolean): Promise<void> {
    const leg = ltlLegsOf(consignmentId, await legRepository.forConsignments(companyId, [consignmentId], tx)).find((l) => l.kind === "DELIVERY");
    if (!leg) return;
    const status = done ? "DONE" : leg.tripId || leg.buy ? "PLANNED" : "OPEN";
    if (leg.status !== status) await legRepository.update(tx, companyId, leg.id, { status });
  }

  /**
   * The Billing rule: when every live (not cancelled) consignment of the job has its POD and no
   * delivery exception of theirs is open, they become READY_TO_BILL and the job is owed the
   * "Billing" step (once). Runs in the transaction of the change, with the job's consignments
   * locked (closing the last exception runs it again). Returns how many became ready.
   */
  async settleBilling(tx: Tx, actor: Pick<Actor, "userID" | "role" | "companyID">, shipmentId: string, causedBy: string, by: string): Promise<number> {
    const companyId = actor.companyID;
    const all = await consignmentRepository.forShipmentLocked(tx, companyId, shipmentId);
    const live = all.filter((x) => !x.cancelledAt);
    if (!live.length || !live.every((x) => x.podReceivedAt)) return 0;
    const open = await exceptionRepository.openCounts(companyId, live.map((x) => x.id), tx);
    if ([...open.values()].some((n) => n > 0)) return 0;
    const pending = live.filter((x) => !x.readyToBillAt);
    if (!pending.length) return 0;
    const now = new Date();
    for (const x of pending) {
      await consignmentRepository.update(tx, companyId, x.id, { readyToBillAt: now, status: "READY_TO_BILL" }, { stampSet: "podReceived", live: true });
      await appendEvent(tx, companyId, {
        kind: "ready_to_bill",
        consignmentId: x.id,
        byUserId: null,
        byName: by,
        payload: { changes: {}, summary: `Every consignment of job ${x.jobNumber} has its POD: ready to bill, the job goes to Billing` },
      });
    }
    await truckingOutboxRepository.enqueue(tx, companyId, [owed(actor, { id: causedBy, shipmentId }, "billing", {})]);
    return pending.length;
  }

  /** Manager: clears a stamp with the reason (the event of the stamp stays). A later stamp must be voided first. */
  async voidStamp(actor: Actor, id: string, kind: StampKind, reason: unknown): Promise<ConsignmentDetail> {
    if (!isManager(actor.role)) throw APIError.permissionDenied("Only a manager can void a stamp");
    if (!STAMP_KINDS.includes(kind)) throw bad("Unknown stamp");
    const why = cleanReason(reason, "a reason for voiding the stamp");
    const { c, trip } = await this.load(actor.companyID, id);
    const facts = factsOf(c, trip);
    const cols = STAMP_COLUMNS[kind];
    if (c.cancelledAt) throw APIError.failedPrecondition("The consignment is cancelled");
    if (!facts[cols.at]) throw APIError.failedPrecondition("This stamp is not set");
    const refusal = voidRefusal(kind, facts);
    if (refusal) throw APIError.failedPrecondition(refusal);
    const by = await userName(actor.userID);
    const companyId = actor.companyID;
    await inTx(async (tx) => {
      const next: ConsignmentFacts = { ...facts, [cols.at]: null, ...(kind === "podReceived" ? { readyToBillAt: null } : {}) };
      const status =
        c.scope === "LTL"
          ? await this.ltlStatusAfter(tx, companyId, c, { [cols.at]: null, ...(kind === "podReceived" ? { readyToBillAt: null } : {}) })
          : consignmentStatus(next);
      const values: ConsignmentValues = { [cols.at]: null, [cols.by]: null, status };
      if (c.scope === "LTL" && kind === "delivered") await this.markDeliveryLeg(tx, companyId, c.id, false);
      if (kind === "podReceived") Object.assign(values, { podSource: null, readyToBillAt: null });
      const row = await consignmentRepository.update(tx, companyId, id, values, { stampSet: kind, version: c.version, live: true });
      if (!row) throw APIError.aborted(CONSIGNMENT_CONFLICT);
      if (trip && !trip.cancelledAt) {
        const tripValues = kind === "confirmed" ? { confirmedAt: null, confirmedVia: null, confirmedBy: null } : {};
        await tripRepository.update(tx, companyId, trip.id, { ...tripValues, status: tripStatus({ ...trip, ...tripValues }, row) }, { live: true });
      }
      await appendEvent(tx, companyId, {
        kind: "stamp_voided",
        consignmentId: id,
        tripId: trip?.id ?? null,
        byUserId: actor.userID || null,
        byName: by,
        payload: {
          changes: { [kind]: { before: (facts[cols.at] as Date).toISOString(), after: null } },
          reason: why,
          summary: `${STAMP_LABEL[kind]} voided: ${why}`,
          facts: { kind },
        },
      });
      if (kind === "podReceived") {
        await this.unsettleBilling(tx, actor, c, by);
        if (c.internal) await internalBillingService.reverseDelivered(tx, actor, c, by, `POD voided: ${why}`);
      }
    });
    await deliverDue(id);
    return this.get(actor, id);
  }

  // A POD voided: the job's consignments that were ready to bill go back to POD received. The
  // job's Shipment Status is not changed back (it may be invoiced already); the event says so.
  private async unsettleBilling(tx: Tx, actor: Pick<Actor, "companyID">, c: TruckingConsignmentRecord, by: string): Promise<void> {
    const all = await consignmentRepository.forShipmentLocked(tx, actor.companyID, c.shipmentId);
    for (const x of all.filter((y) => y.readyToBillAt && y.id !== c.id && !y.cancelledAt)) {
      await consignmentRepository.update(tx, actor.companyID, x.id, { readyToBillAt: null, status: "POD_RECEIVED" }, { live: true });
      await appendEvent(tx, actor.companyID, {
        kind: "stamp_voided",
        consignmentId: x.id,
        byUserId: null,
        byName: by,
        payload: {
          changes: {},
          summary: `No longer ready to bill: the POD of ${c.ref} was voided. Job ${c.jobNumber} stays in its Shipment Status — change it in Shipments if needed`,
        },
      });
    }
  }

  // ---- the job was deleted -----------------------------------------------------------------------

  /**
   * Shipments deleted the job: its open consignments are cancelled (with their trips, links and
   * cost lines), those already picked up are kept with an event, and what is still owed to the
   * job is cancelled. Runs without a user (the subscription); idempotent.
   */
  async retireShipment(shipmentId: string, companyId: string): Promise<void> {
    const rows = await consignmentRepository.list(companyId, { shipmentId });
    const system = { userID: "", role: "", companyID: companyId };
    for (const c of rows.filter((x) => !x.cancelledAt)) {
      const trip = c.tripId ? await tripRepository.find(companyId, c.tripId) : null;
      await inTx(async (tx) => {
        const cancelled = !c.pickedUpAt && !c.gateInAt && (await this.cancelInTx(tx, system, c, trip, "Shipments", "The job was deleted in Shipments", "Cancelled: the job was deleted in Shipments"));
        if (!cancelled) {
          await appendEvent(tx, companyId, {
            kind: "shipment_deleted",
            consignmentId: c.id,
            byUserId: null,
            byName: "Shipments",
            payload: { changes: {}, summary: `Job ${c.jobNumber} was deleted in Shipments; the goods are already picked up, so the consignment is kept` },
          });
        }
      });
    }
    await inTx((tx) => truckingOutboxRepository.cancelForShipment(tx, companyId, shipmentId, "the job was deleted in Shipments"));
  }
}

// ---- helpers ----------------------------------------------------------------------------------------

/** The consignment's fields as stored, in the shape of an input (for comparing). */
function storedFields(c: TruckingConsignmentRecord): ConsignmentFields {
  const stop = ({ id: _id, kind: _kind, actualArrival: _a, actualDeparture: _d, ...s }: Stop): StopInput => s;
  return {
    quoteNumber: c.quoteNumber,
    serviceLevel: c.serviceLevel,
    pickupDate: c.pickupDate,
    pickupTime: c.pickupTime,
    pickup: stop(c.pickup),
    delivery: stop(c.delivery),
    load: c.load,
    price: { source: "TARIFF" },
    scope: c.scope,
    selfDelivered: c.selfDelivered,
    lastMile: c.scope === "LTL" ? c.lastMile : null,
    partnerHaulierCustomerId: c.scope === "LTL" ? c.partnerHaulierCustomerId : null,
  };
}

// What may not change after the pick-up: everything but the stops' notes and references.
function lockedPart(f: ConsignmentFields, price: ConsignmentFields["price"]): string {
  const stop = (s: StopInput) => ({ ...s, notes: "", reference: "" });
  return JSON.stringify({ ...f, price, pickup: stop(f.pickup), delivery: stop(f.delivery) });
}

const COMPARED: (keyof ConsignmentValues)[] = [
  "department",
  "internal",
  "quoteNumber",
  "serviceLevel",
  "pickupDate",
  "pickupTime",
  "pickup",
  "delivery",
  "load",
  "promisedDate",
  "sell",
  "selfDelivered",
  "lastMile",
  "partnerHaulierCustomerId",
];

/** The fields an update changes, with before and after. */
function changedFields(c: TruckingConsignmentRecord, v: ConsignmentValues): Record<string, { before: unknown; after: unknown }> {
  const out: Record<string, { before: unknown; after: unknown }> = {};
  for (const key of COMPARED) {
    if (!(key in v)) continue;
    const before = (c as Record<string, unknown>)[key] ?? null;
    const after = (v as Record<string, unknown>)[key] ?? null;
    if (JSON.stringify(before) !== JSON.stringify(after)) out[key] = { before, after };
  }
  return out;
}

const ORDER: StampKind[] = ["confirmed", "pickedUp", "delivered", "podReceived"];

// A stamp's time may not be before the stamp it follows (a delivery before its pick-up).
function assertAfterEarlier(kind: StampKind, facts: ConsignmentFacts, time: Date): void {
  const i = ORDER.indexOf(kind);
  for (const earlier of ORDER.slice(1, i).reverse()) {
    const at = facts[STAMP_COLUMNS[earlier].at];
    if (at) {
      if (time < at) throw bad(`${STAMP_LABEL[kind]} cannot be before ${STAMP_LABEL[earlier].toLowerCase()} (${stampText(at)})`);
      return;
    }
  }
}

/** "15 Oct 2026 10:30" in Prague time. */
export const stampText = (d: Date) =>
  `${formatDay(businessDay(d))} ${new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit", hour12: false }).format(d)}`;

/** The Internal tariff rating of a consignment: its level and scope, rated on the pick-up date; null when it cannot be rated (no level, not CZ → CZ). */
function internalRateRequest(c: TruckingConsignmentRecord): RateRequest | null {
  if (!c.serviceLevel || !bothCz(c)) return null;
  return { ...rateRequestOf(c, null, c.serviceLevel, scopeOf(c)), includeBuy: false, includeInternal: true };
}

/** Partners' names from the Customer Database, by id. */
async function haulierNames(ids: string[]): Promise<Map<string, string>> {
  const { hauliers } = await customers._internalHaulierList({ ids: [...new Set(ids)] });
  return new Map(hauliers.map((h) => [h.id, h.companyName]));
}

/** The trip of an LTL consignment's leg under way (the first planned leg), for the list. */
function currentTrip(consignmentId: string, legs: TruckingLegRecord[], tripOf: Map<string, TruckingTripRecord>): TruckingTripRecord | null {
  const leg = ltlLegsOf(consignmentId, legs).find((l) => l.status === "PLANNED" && l.tripId);
  return leg?.tripId ? (tripOf.get(leg.tripId) ?? null) : null;
}

/** What identifies a stop's place for the legs (the name and address, not the contact or notes). */
const placeKey = (s: StopInput) => JSON.stringify([s.name, s.street, s.postcode, s.city, s.country, s.siteId]);

const emptyCounts = (): ConsignmentCounts => ({
  attention: 0,
  pickupToday: 0,
  deliveryToday: 0,
  podMissing: 0,
  readyToBill: 0,
  openFtlWithoutHaulier: 0,
  avizacePending: 0,
  openExceptions: 0,
});

const DELIVERED_OR_LATER: ConsignmentStatus[] = ["DELIVERED", "POD_RECEIVED", "READY_TO_BILL"];

/** What the list works out per consignment for the views that need more than the list item (ids). */
export interface ViewFlags {
  /** Delivered more than 2 working days ago without POD */
  podMissing: ReadonlySet<string>;
  /** Needs an avizace, none recorded, not delivered */
  avizacePending: ReadonlySet<string>;
}

const NO_FLAGS: ViewFlags = { podMissing: new Set(), avizacePending: new Set() };

/** Whether a consignment is in a worklist view. */
export function inView(i: ConsignmentListItem, view: ConsignmentView, day: string, flags: ViewFlags = NO_FLAGS): boolean {
  if (i.status === "CANCELLED") return false;
  switch (view) {
    case "attention":
      return i.needsAttention.length > 0;
    case "pickupToday":
      return i.pickupDate === day && ["BOOKED", "PLANNED", "ORDERED", "CONFIRMED"].includes(i.status);
    case "deliveryToday":
      return i.promisedDate === day && !DELIVERED_OR_LATER.includes(i.status);
    case "podMissing":
      return flags.podMissing.has(i.id);
    case "readyToBill":
      return i.status === "READY_TO_BILL";
    case "avizacePending":
      return flags.avizacePending.has(i.id);
    case "openExceptions":
      return i.openExceptions > 0;
    case "openFtl":
      return i.scope === "FTL" && i.status === "BOOKED" && !i.tripId;
  }
}

export function countsOf(items: ConsignmentListItem[], day: string, flags: ViewFlags = NO_FLAGS): ConsignmentCounts {
  const n = (view: ConsignmentView) => items.filter((i) => inView(i, view, day, flags)).length;
  return {
    attention: n("attention"),
    pickupToday: n("pickupToday"),
    deliveryToday: n("deliveryToday"),
    podMissing: n("podMissing"),
    readyToBill: n("readyToBill"),
    openFtlWithoutHaulier: n("openFtl"),
    avizacePending: n("avizacePending"),
    openExceptions: n("openExceptions"),
  };
}

/** The Warehouse's OSD exceptions of a job (read-only); [] when the warehouse cannot be read. */
async function warehouseExceptionsOf(shipmentId: string): Promise<WarehouseExceptionItem[]> {
  try {
    return (await warehouse._internalWarehouseExceptionsForShipments({ shipmentIds: [shipmentId] })).exceptions;
  } catch (err) {
    log.warn("trucking: warehouse exceptions not read", { shipmentId, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

export const consignmentService = new ConsignmentService();
