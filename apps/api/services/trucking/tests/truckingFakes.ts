// In-memory stand-ins for the Phase 4 repositories: the services run for real against them, and
// the tests read what was written (rows, events, outbox rows, links, documents). The guards of
// the conditional UPDATEs are applied as the database would apply them.

import { randomUUID } from "node:crypto";
import { vi } from "vitest";
import type { TruckingConsignmentRecord, TruckingDocumentRecord, TruckingHaulierLinkRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import type { ConsignmentGuard } from "../repositories/consignment.repository";
import type { TripGuard } from "../repositories/trip.repository";
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
  counters: new Map<string, number>(),
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
  store.counters = new Map();
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
      version: 1,
      ...values,
    } as TruckingConsignmentRecord;
    store.consignments.push(row);
    return copy(row);
  }),
  find: vi.fn(async (companyId: string, id: string) => copy(store.consignments.find((c) => c.companyId === companyId && c.id === id) ?? null)),
  findMany: vi.fn(async (companyId: string, ids: string[]) => store.consignments.filter((c) => c.companyId === companyId && ids.includes(c.id)).map(copy)),
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
