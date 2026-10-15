// In-memory stand-ins for the Phase 4 repositories: the services run for real against them, and
// the tests read what was written (rows, events, outbox rows, links, documents). The guards of
// the conditional UPDATEs are applied as the database would apply them.

import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type {
  TruckingConsignmentRecord,
  TruckingDocumentRecord,
  TruckingHaulierLinkRecord,
  TruckingLegRecord,
  TruckingTripRecord,
} from "../schemas/truckingConsignment.schema";
import type { LegGuard } from "../repositories/leg.repository";
import type { ConsignmentGuard } from "../repositories/consignment.repository";
import type { TripGuard } from "../repositories/trip.repository";
import type { ExceptionGuard } from "../repositories/exception.repository";
import type { TruckingExceptionRecord } from "../schemas/avizace.schema";
import type { TruckingInternalChargeRecord, TruckingInternalMonthRecord, TruckingInternalStatementRecord } from "../schemas/internal.schema";
import type { LoadInput, StopInput, TruckingSettings } from "../interfaces/interfaces";
import { DEFAULT_SETTINGS } from "../lib/settingsRules";
import { formatTruckingRef } from "../lib/consignmentRules";

export const COMPANY = "00000000-0000-0000-0000-000000000001";
export const USER = "00000000-0000-0000-0000-000000000002";
export const CUSTOMER = "00000000-0000-0000-0000-0000000000c1";
export const SHIPMENT = "00000000-0000-0000-0000-0000000000d1";
export const HAULIER = "00000000-0000-0000-0000-0000000000a1";
export const HAULIER2 = "00000000-0000-0000-0000-0000000000a2";

export const manager = { userID: USER, companyID: COMPANY, role: "manager" };
export const user = { userID: USER, companyID: COMPANY, role: "user" };

export const store = {
  consignments: [] as TruckingConsignmentRecord[],
  trips: [] as TruckingTripRecord[],
  links: [] as TruckingHaulierLinkRecord[],
  documents: [] as TruckingDocumentRecord[],
  events: [] as Record<string, unknown>[],
  outbox: [] as Record<string, unknown>[],
  legs: [] as { consignmentId: string; tripId: string; deletedAt: Date | null }[],
  /** LTL legs (Phase 5) */
  ltlLegs: [] as TruckingLegRecord[],
  /** Gate events heard, as "position|kind|at" */
  gateEvents: new Set<string>(),
  counters: new Map<string, number>(),
  /** Phase 6 */
  exceptions: [] as TruckingExceptionRecord[],
  internalCharges: [] as TruckingInternalChargeRecord[],
  closedMonths: [] as TruckingInternalMonthRecord[],
  statements: [] as TruckingInternalStatementRecord[],
  /** Every value handed to a repository, as JSON (to prove what was never stored) */
  written: [] as string[],
};

export function resetStore() {
  store.consignments = [];
  store.trips = [];
  store.links = [];
  store.documents = [];
  store.events = [];
  store.outbox = [];
  store.legs = [];
  store.ltlLegs = [];
  store.gateEvents = new Set();
  store.counters = new Map();
  store.exceptions = [];
  store.internalCharges = [];
  store.closedMonths = [];
  store.statements = [];
  store.written = [];
}

const remember = (v: unknown) => store.written.push(JSON.stringify(v));
const copy = <T>(row: T): T => structuredClone(row);
const STAMP_AT = { confirmed: "confirmedAt", pickedUp: "pickedUpAt", delivered: "deliveredAt", podReceived: "podReceivedAt" } as const;

/** The stand-in transaction: the fakes do not look at it. */
export const TX = { fake: "tx" };

export const dbModule = {
  db: {},
  inTx: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => work(TX),
};

function consignmentMatches(r: TruckingConsignmentRecord, g: ConsignmentGuard): boolean {
  if (g.version !== undefined && r.version !== g.version) return false;
  if (g.stampEmpty && (r[STAMP_AT[g.stampEmpty]] || r.cancelledAt)) return false;
  if (g.stampSet && !r[STAMP_AT[g.stampSet]]) return false;
  if (g.beforePickup && (r.cancelledAt || r.pickedUpAt)) return false;
  if (g.withoutTrip && (r.tripId || r.cancelledAt)) return false;
  if (g.tripId && r.tripId !== g.tripId) return false;
  if (g.live && r.cancelledAt) return false;
  return true;
}

function tripMatches(t: TruckingTripRecord, g: TripGuard): boolean {
  if (g.version !== undefined && t.version !== g.version) return false;
  if (g.live && t.cancelledAt) return false;
  if (g.sent && !t.orderSentAt) return false;
  if (g.unanswered && (t.confirmedAt || t.rejectedAt)) return false;
  if (g.unconfirmed && t.confirmedAt) return false;
  return true;
}

export const consignmentRepository = {
  allocateRef: vi.fn(async (_tx: unknown, companyId: string, sequence: "TCZ" | "LCZ", year: number) => {
    const key = `${companyId}:${sequence}:${year}`;
    const n = (store.counters.get(key) ?? 0) + 1;
    store.counters.set(key, n);
    return formatTruckingRef(sequence, year, n);
  }),
  insert: vi.fn(async (_tx: unknown, values: Partial<TruckingConsignmentRecord>) => {
    remember(values);
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      quoteNumber: null,
      scope: "FTL",
      selfDelivered: false,
      lastMile: null,
      partnerHaulierCustomerId: null,
      gateInAt: null,
      gateOutAt: null,
      promisedFinal: false,
      serviceLevel: null,
      pickupTime: null,
      promisedDate: null,
      chargeableKg: null,
      sell: null,
      sellCzk: null,
      estBuyCzk: null,
      belowFloor: false,
      marginApproval: null,
      tripId: null,
      confirmedAt: null,
      confirmedBy: null,
      pickedUpAt: null,
      pickedUpBy: null,
      deliveredAt: null,
      deliveredBy: null,
      podReceivedAt: null,
      podReceivedBy: null,
      podSource: null,
      readyToBillAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdByUserId: null,
      department: "",
      internal: false,
      avizace: null,
      version: 1,
      ...values,
    } as TruckingConsignmentRecord;
    store.consignments.push(row);
    return copy(row);
  }),
  find: vi.fn(async (companyId: string, id: string) => copy(store.consignments.find((c) => c.companyId === companyId && c.id === id) ?? null)),
  findMany: vi.fn(async (companyId: string, ids: string[]) => store.consignments.filter((c) => c.companyId === companyId && ids.includes(c.id)).map(copy)),
  ltlForShipmentLocked: vi.fn(async (_tx: unknown, companyId: string, shipmentId: string) =>
    store.consignments.filter((c) => c.companyId === companyId && c.shipmentId === shipmentId && c.scope === "LTL" && !c.cancelledAt).map(copy),
  ),
  findByTrip: vi.fn(async (companyId: string, tripId: string) => copy(store.consignments.find((c) => c.companyId === companyId && c.tripId === tripId) ?? null)),
  findByTrips: vi.fn(async (companyId: string, ids: string[]) => store.consignments.filter((c) => c.companyId === companyId && c.tripId && ids.includes(c.tripId)).map(copy)),
  list: vi.fn(async (companyId: string, f: { status?: string; shipmentId?: string }) =>
    store.consignments.filter((c) => c.companyId === companyId && (!f.status || c.status === f.status) && (!f.shipmentId || c.shipmentId === f.shipmentId)).map(copy),
  ),
  forShipmentLocked: vi.fn(async (_tx: unknown, companyId: string, shipmentId: string) =>
    store.consignments.filter((c) => c.companyId === companyId && c.shipmentId === shipmentId).map(copy),
  ),
  update: vi.fn(async (_tx: unknown, companyId: string, id: string, values: Partial<TruckingConsignmentRecord>, guard: ConsignmentGuard = {}) => {
    remember(values);
    const row = store.consignments.find((c) => c.companyId === companyId && c.id === id);
    if (!row || !consignmentMatches(row, guard)) return null;
    Object.assign(row, values, { version: row.version + 1, updatedAt: new Date() });
    return copy(row);
  }),
  insertLeg: vi.fn(async (_tx: unknown, _companyId: string, consignmentId: string, tripId: string) => {
    store.legs.push({ consignmentId, tripId, deletedAt: null });
  }),
  retireLegs: vi.fn(async (_tx: unknown, _companyId: string, tripId: string) => {
    for (const l of store.legs.filter((x) => x.tripId === tripId)) l.deletedAt = new Date();
  }),
};

export const tripRepository = {
  insert: vi.fn(async (_tx: unknown, values: Partial<TruckingTripRecord>) => {
    remember(values);
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      kind: "FTL",
      stopOrder: [],
      departedAt: null,
      departedBy: null,
      arrivedAt: null,
      arrivedBy: null,
      costJobs: [],
      warehouseJobs: [],
      suggestedHaulierId: null,
      vehicleTypeCode: null,
      tractorPlate: "",
      trailerPlate: "",
      driverName: "",
      driverPhone: "",
      buy: null,
      buyCzk: null,
      buyCandidates: [],
      orderSentAt: null,
      orderSentBy: null,
      orderSentByUserId: null,
      orderSentByRole: null,
      orderRecordedOnly: false,
      orderTo: [],
      pinPrinted: false,
      ourCompanyName: "",
      confirmedAt: null,
      confirmedVia: null,
      confirmedBy: null,
      rejectedAt: null,
      rejectReason: null,
      cancelledAt: null,
      cancelledBy: null,
      cancelReason: null,
      createdByUserId: null,
      version: 1,
      ...values,
    } as TruckingTripRecord;
    store.trips.push(row);
    return copy(row);
  }),
  find: vi.fn(async (companyId: string, id: string) => copy(store.trips.find((t) => t.companyId === companyId && t.id === id) ?? null)),
  findMany: vi.fn(async (companyId: string, ids: string[]) => store.trips.filter((t) => t.companyId === companyId && ids.includes(t.id)).map(copy)),
  lock: vi.fn(async (_tx: unknown, companyId: string, id: string) => copy(store.trips.find((t) => t.companyId === companyId && t.id === id) ?? null)),
  listLtl: vi.fn(async (companyId: string, kind: string, date: string) =>
    store.trips.filter((t) => t.companyId === companyId && !t.cancelledAt && t.kind === kind && t.plannedPickupDate === date).map(copy),
  ),
  list: vi.fn(async (companyId: string) => store.trips.filter((t) => t.companyId === companyId).map(copy)),
  update: vi.fn(async (_tx: unknown, companyId: string, id: string, values: Partial<TruckingTripRecord>, guard: TripGuard = {}) => {
    remember(values);
    const row = store.trips.find((t) => t.companyId === companyId && t.id === id);
    if (!row || !tripMatches(row, guard)) return null;
    Object.assign(row, values, { version: row.version + 1, updatedAt: new Date() });
    return copy(row);
  }),
  renewLink: vi.fn(async (_tx: unknown, companyId: string, tripId: string, tokenHash: string, expiresAt: Date) => {
    remember({ tokenHash, expiresAt });
    for (const l of store.links.filter((x) => x.tripId === tripId && !x.revokedAt)) l.revokedAt = new Date();
    const row = { id: randomUUID(), companyId, tripId, tokenHash, expiresAt, revokedAt: null, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
    store.links.push(row);
    return copy(row);
  }),
  revokeLinks: vi.fn(async (_tx: unknown, _companyId: string, tripId: string) => {
    for (const l of store.links.filter((x) => x.tripId === tripId && !x.revokedAt)) l.revokedAt = new Date();
  }),
  liveLink: vi.fn(async (_companyId: string, tripId: string) => copy(store.links.find((l) => l.tripId === tripId && !l.revokedAt) ?? null)),
  linkByHash: vi.fn(async (hash: string) => copy(store.links.find((l) => l.tokenHash === hash) ?? null)),
};

function legMatches(l: TruckingLegRecord, g: LegGuard): boolean {
  if (g.status && l.status !== g.status) return false;
  if (g.tripId === null && l.tripId) return false;
  if (g.tripId && l.tripId !== g.tripId) return false;
  return true;
}

const liveLeg = (companyId: string) => (l: TruckingLegRecord) => l.companyId === companyId && !l.deletedAt;

export const legRepository = {
  insertMany: vi.fn(async (_tx: unknown, rows: Partial<TruckingLegRecord>[]) => {
    remember(rows);
    const made = rows.map(
      (values) =>
        ({
          id: randomUUID(),
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
          tripId: null,
          seq: 1,
          kind: "DIRECT",
          status: "OPEN",
          fromText: "",
          toText: "",
          fromPostcode: "",
          toPostcode: "",
          haulierCustomerId: null,
          depotSiteId: null,
          buy: null,
          costShareCzk: null,
          ...values,
        }) as TruckingLegRecord,
    );
    store.ltlLegs.push(...made);
    return made.map(copy);
  }),
  find: vi.fn(async (companyId: string, id: string) => copy(store.ltlLegs.filter(liveLeg(companyId)).find((l) => l.id === id) ?? null)),
  findMany: vi.fn(async (companyId: string, ids: string[]) => store.ltlLegs.filter(liveLeg(companyId)).filter((l) => ids.includes(l.id)).map(copy)),
  forConsignments: vi.fn(async (companyId: string, ids: string[]) =>
    store.ltlLegs
      .filter(liveLeg(companyId))
      .filter((l) => ids.includes(l.consignmentId))
      .sort((a, b) => a.consignmentId.localeCompare(b.consignmentId) || a.seq - b.seq)
      .map(copy),
  ),
  forTrips: vi.fn(async (companyId: string, ids: string[]) => store.ltlLegs.filter(liveLeg(companyId)).filter((l) => l.tripId && ids.includes(l.tripId)).map(copy)),
  open: vi.fn(async (companyId: string, kind: string) => store.ltlLegs.filter(liveLeg(companyId)).filter((l) => l.kind === kind && l.status === "OPEN" && !l.tripId).map(copy)),
  update: vi.fn(async (_tx: unknown, companyId: string, id: string, values: Partial<TruckingLegRecord>, guard: LegGuard = {}) => {
    remember(values);
    const row = store.ltlLegs.filter(liveLeg(companyId)).find((l) => l.id === id);
    if (!row || !legMatches(row, guard)) return null;
    Object.assign(row, values, { updatedAt: new Date() });
    return copy(row);
  }),
  retire: vi.fn(async (_tx: unknown, companyId: string, ids: string[]) => {
    for (const l of store.ltlLegs.filter(liveLeg(companyId)).filter((x) => ids.includes(x.id))) l.deletedAt = new Date();
  }),
  recordGateEvent: vi.fn(async (_tx: unknown, v: { positionId: string; kind: string; at: Date }) => {
    const key = `${v.positionId}|${v.kind}|${v.at.toISOString()}`;
    if (store.gateEvents.has(key)) return false;
    store.gateEvents.add(key);
    return true;
  }),
  hasGateEvent: vi.fn(async (_tx: unknown, _companyId: string, positionId: string, kind: string) =>
    [...store.gateEvents].some((key) => key.startsWith(`${positionId}|${kind}|`)),
  ),
};

export const truckingDocumentRepository = {
  insert: vi.fn(async (_tx: unknown, values: Partial<TruckingDocumentRecord>) => {
    remember(values);
    const row = { id: randomUUID(), createdAt: new Date(), updatedAt: new Date(), deletedAt: null, uploadedByUserId: null, ...values } as TruckingDocumentRecord;
    store.documents.push(row);
    return copy(row);
  }),
  list: vi.fn(async (_companyId: string, consignmentId: string) => store.documents.filter((d) => d.consignmentId === consignmentId).map(copy)),
  find: vi.fn(async (_companyId: string, id: string) => copy(store.documents.find((d) => d.id === id) ?? null)),
  hasPod: vi.fn(async (_companyId: string, consignmentId: string) => store.documents.some((d) => d.consignmentId === consignmentId && d.kind === "POD")),
};

export const truckingOutboxRepository = {
  enqueue: vi.fn(async (_tx: unknown, companyId: string, rows: Record<string, unknown>[]) => {
    remember(rows);
    store.outbox.push(...rows.map((r) => ({ ...r, companyId, status: "pending" })));
  }),
  cancelForShipment: vi.fn(async (_tx: unknown, _companyId: string, shipmentId: string) => {
    const open = store.outbox.filter((r) => r.shipmentId === shipmentId && r.status === "pending");
    for (const r of open) r.status = "cancelled";
    return open.length;
  }),
};

export const eventModule = {
  appendEvent: vi.fn(async (_tx: unknown, companyId: string, event: Record<string, unknown>) => {
    remember(event);
    store.events.push({ ...event, companyId, id: randomUUID(), at: new Date() });
  }),
  listEvents: vi.fn(async (_companyId: string, about: { consignmentId?: string | null; tripId?: string | null }) =>
    store.events
      .filter((e) => (about.consignmentId && e.consignmentId === about.consignmentId) || (about.tripId && e.tripId === about.tripId))
      .map((e) => ({ ...e, byName: e.byName ?? "" }))
      .reverse(),
  ),
};

export const settings = (): TruckingSettings => ({ ...structuredClone(DEFAULT_SETTINGS), version: 0, updatedAt: null, updatedBy: null });

export const stop = (over: Partial<StopInput> = {}): StopInput => ({
  siteId: null,
  name: "Alfa s.r.o.",
  street: "Dlouhá 1",
  postcode: "110 00",
  city: "Praha",
  country: "CZ",
  windowFrom: null,
  windowTo: null,
  contactName: "Jan Novák",
  contactPhone: "+420 777 000 111",
  avizaceRequired: false,
  reference: "PO-1",
  notes: "",
  ...over,
});

export const load = (over: Partial<LoadInput> = {}): LoadInput => ({
  pieces: 10,
  palletPlaces: 10,
  ldm: 4,
  weightKg: 5000,
  cbm: 20,
  adr: false,
  adrUn: "",
  adrClass: "",
  adrPackingGroup: "",
  nonStackable: false,
  tailLift: false,
  b2c: false,
  description: "Machine parts",
  ...over,
});

/** Events of a kind, in order. */
export const eventsOf = (kind: string) => store.events.filter((e) => e.kind === kind);
/** Outbox rows of a kind, in order. */
export const outboxOf = (kind: string) => store.outbox.filter((r) => r.kind === kind);

// ---- Phase 6: delivery exceptions and the internal billing ledger -------------------------------

function exceptionMatches(e: TruckingExceptionRecord, g: ExceptionGuard): boolean {
  if (g.version !== undefined && e.version !== g.version) return false;
  if (g.pending && e.decision !== "PENDING") return false;
  if (g.open && e.closedAt) return false;
  return true;
}

export const exceptionRepository = {
  insert: vi.fn(async (_tx: unknown, values: Partial<TruckingExceptionRecord>) => {
    remember(values);
    const row = {
      id: randomUUID(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
      legId: null,
      failedReason: null,
      cause: "UNKNOWN",
      decision: "PENDING",
      amount: null,
      currency: "CZK",
      description: "",
      pieces: null,
      waitingMinutes: null,
      warehouseExceptionId: null,
      createdByUserId: null,
      createdBy: "",
      decidedAt: null,
      decidedBy: null,
      decisionReason: null,
      claimTargetKind: null,
      claimTargetId: null,
      claimHaulierCustomerId: null,
      closedAt: null,
      closedBy: null,
      closeNote: null,
      photos: [],
      version: 1,
      ...values,
    } as TruckingExceptionRecord;
    store.exceptions.push(row);
    return copy(row);
  }),
  find: vi.fn(async (companyId: string, id: string) => copy(store.exceptions.find((e) => e.companyId === companyId && e.id === id) ?? null)),
  forConsignments: vi.fn(async (companyId: string, ids: string[]) => store.exceptions.filter((e) => e.companyId === companyId && ids.includes(e.consignmentId)).reverse().map(copy)),
  openCounts: vi.fn(async (companyId: string, ids: string[]) => {
    const out = new Map<string, number>();
    for (const e of store.exceptions.filter((x) => x.companyId === companyId && ids.includes(x.consignmentId) && !x.closedAt)) out.set(e.consignmentId, (out.get(e.consignmentId) ?? 0) + 1);
    return out;
  }),
  list: vi.fn(async (companyId: string, f: { open?: boolean; kind?: string; consignmentId?: string }) =>
    store.exceptions
      .filter((e) => e.companyId === companyId && (f.open === undefined || !e.closedAt === f.open) && (!f.kind || e.kind === f.kind) && (!f.consignmentId || e.consignmentId === f.consignmentId))
      .reverse()
      .map(copy),
  ),
  update: vi.fn(async (_tx: unknown, companyId: string, id: string, values: Partial<TruckingExceptionRecord>, guard: ExceptionGuard = {}) => {
    remember(values);
    const row = store.exceptions.find((e) => e.companyId === companyId && e.id === id);
    if (!row || !exceptionMatches(row, guard)) return null;
    Object.assign(row, values, { version: row.version + 1, updatedAt: new Date() });
    return copy(row);
  }),
  claimsFor: vi.fn(async (companyId: string, ids: string[]) =>
    store.exceptions
      .filter((e) => e.companyId === companyId && e.decision === "CLAIM_HAULIER" && e.claimTargetId && ids.includes(e.claimTargetId))
      .map((e) => ({ targetKind: e.claimTargetKind!, targetId: e.claimTargetId!, amount: e.amount ?? 0, currency: e.currency, exceptionId: e.id })),
  ),
};

export const internalRepository = {
  lockLedger: vi.fn(async () => undefined),
  allocateStatementNumber: vi.fn(async (_tx: unknown, companyId: string, year: number) => {
    const key = `${companyId}:ICZ:${year}`;
    const n = (store.counters.get(key) ?? 0) + 1;
    store.counters.set(key, n);
    return `ICZ${year}${String(n).padStart(4, "0")}`;
  }),
  insertCharges: vi.fn(async (_tx: unknown, rows: Partial<TruckingInternalChargeRecord>[]) => {
    remember(rows);
    if (rows.some((r) => store.closedMonths.some((m) => m.companyId === r.companyId && m.month === r.month))) throw new Error("trigger: the month is closed");
    const made = rows.map(
      (v) =>
        ({
          id: randomUUID(),
          createdAt: new Date(),
          serviceLevel: null,
          chargeableKg: null,
          tariffVersionId: null,
          currency: "CZK",
          description: "",
          notPriced: false,
          exceptionId: null,
          reversesId: null,
          createdBy: "",
          ...v,
        }) as TruckingInternalChargeRecord,
    );
    store.internalCharges.push(...made);
    return made.map(copy);
  }),
  chargesForConsignment: vi.fn(async (companyId: string, consignmentId: string) => store.internalCharges.filter((c) => c.companyId === companyId && c.consignmentId === consignmentId).map(copy)),
  chargesForMonths: vi.fn(async (companyId: string, months: string[]) => store.internalCharges.filter((c) => c.companyId === companyId && months.includes(c.month)).map(copy)),
  reversedAmong: vi.fn(async (companyId: string, ids: string[]) => new Set(store.internalCharges.filter((c) => c.companyId === companyId && c.reversesId && ids.includes(c.reversesId)).map((c) => c.reversesId!))),
  closedMonths: vi.fn(async (companyId: string, months: string[]) => store.closedMonths.filter((m) => m.companyId === companyId && months.includes(m.month)).map(copy)),
  closeMonth: vi.fn(async (_tx: unknown, companyId: string, month: string, by: { name: string; userId: string | null }) => {
    if (store.closedMonths.some((m) => m.companyId === companyId && m.month === month)) return null;
    const row = { id: randomUUID(), companyId, month, status: "CLOSED" as const, closedAt: new Date(), closedBy: by.name, closedByUserId: by.userId };
    store.closedMonths.push(row);
    return copy(row);
  }),
  insertStatement: vi.fn(async (_tx: unknown, values: Partial<TruckingInternalStatementRecord>) => {
    const row = { id: randomUUID(), issuedAt: new Date(), issuedBy: "", ...values } as TruckingInternalStatementRecord;
    store.statements.push(row);
    return copy(row);
  }),
  statementsForMonths: vi.fn(async (companyId: string, months: string[]) => store.statements.filter((s) => s.companyId === companyId && months.includes(s.month)).map(copy)),
  statement: vi.fn(async (companyId: string, number: string) => copy(store.statements.find((s) => s.companyId === companyId && s.number === number) ?? null)),
};
