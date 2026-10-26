import { beforeEach, describe, expect, it, vi } from "vitest";

// Customer Database names kept by id: a consignment's customer and a trip's haulier follow a
// rename (topic customer-changed) and the one-off backfill. The services run for real against the
// in-memory repositories (truckingFakes); the rename statements are stood in for below with the
// same rule as the SQL (only rows that differ change).
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({ customers: { _internalCustomerRefs: vi.fn(), customerGet: vi.fn(), _internalHaulierList: vi.fn() } }));
vi.mock("../db/db", async () => (await import("./truckingFakes")).dbModule);
vi.mock("../repositories/consignment.repository", async () => ({ consignmentRepository: (await import("./truckingFakes")).consignmentRepository }));
vi.mock("../repositories/trip.repository", async () => ({ tripRepository: (await import("./truckingFakes")).tripRepository }));
vi.mock("../repositories/leg.repository", async () => ({ legRepository: (await import("./truckingFakes")).legRepository }));
vi.mock("../repositories/truckingOutbox.repository", async () => ({ truckingOutboxRepository: (await import("./truckingFakes")).truckingOutboxRepository }));
vi.mock("../repositories/haulier.repository", () => ({ haulierRepository: { findMany: vi.fn(async () => []) } }));
vi.mock("../repositories/portal.repository", () => ({ portalRepository: {} }));
vi.mock("../services/settings.service", () => ({ settingsService: { get: vi.fn() } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../repositories/customerLinks.repository", async () => {
  const { store, TX: TX_FAKE } = await import("./truckingFakes");
  const live = <T extends { companyId: string; deletedAt: Date | null }>(companyId: string) => (r: T) => r.companyId === companyId && !r.deletedAt;
  const renameConsignmentCustomer = vi.fn(async (_w: unknown, companyId: string, customerId: string, name: string) => {
    const rows = store.consignments.filter(live(companyId)).filter((c) => c.customerId === customerId && c.customerName !== name);
    for (const c of rows) c.customerName = name;
    return rows.length;
  });
  const renameTripHaulier = vi.fn(async (_w: unknown, companyId: string, haulierId: string, name: string) => {
    const rows = store.trips.filter(live(companyId)).filter((t) => t.haulierCustomerId === haulierId && t.haulierName !== name);
    for (const t of rows) t.haulierName = name;
    return rows.length;
  });
  return {
    customerLinksRepository: {
      // The lock is the database's (tests/db): here the name is read, trimmed and written in turn.
      renameCustomer: vi.fn(async (companyId: string, customerId: string, currentName: () => Promise<string | null>) => {
        const name = (await currentName())?.trim();
        if (!name) return { consignments: 0, trips: 0 };
        return {
          consignments: await renameConsignmentCustomer(TX_FAKE, companyId, customerId, name),
          trips: await renameTripHaulier(TX_FAKE, companyId, customerId, name),
        };
      }),
      renameConsignmentCustomer,
      renameTripHaulier,
      storedNames: vi.fn(async (companyId: string) => {
        const out = new Map<string, { field: string; id: string; name: string; count: number }>();
        const add = (field: string, id: string, name: string) => {
          const key = `${field}|${id}|${name}`;
          const seen = out.get(key);
          if (seen) seen.count += 1;
          else out.set(key, { field, id, name, count: 1 });
        };
        for (const c of store.consignments.filter(live(companyId))) add("consignment.customerName", c.customerId, c.customerName);
        for (const t of store.trips.filter(live(companyId))) add("trip.haulierName", t.haulierCustomerId, t.haulierName);
        return [...out.values()];
      }),
    },
  };
});

import { customers } from "~encore/clients";
import { customerLinksService, unmatchedOf } from "../services/customerLinks.service";
import { customerLinksRepository } from "../repositories/customerLinks.repository";
import { consignmentRepository } from "../repositories/consignment.repository";
import { tripRepository } from "../repositories/trip.repository";
import { legRepository } from "../repositories/leg.repository";
import type { TruckingConsignmentRecord, TruckingTripRecord } from "../schemas/truckingConsignment.schema";
import { COMPANY, CUSTOMER, HAULIER, HAULIER2, SHIPMENT, TX, load, resetStore, stop, store } from "./truckingFakes";

const OTHER_COMPANY = "00000000-0000-0000-0000-000000000009";
const CUSTOMER2 = "00000000-0000-0000-0000-0000000000c2";
const SHIPMENT2 = "00000000-0000-0000-0000-0000000000d2";

const refs = vi.mocked(customers._internalCustomerRefs);

const consignment = (over: Partial<TruckingConsignmentRecord> = {}) =>
  consignmentRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "TCZ2026000001",
    shipmentId: SHIPMENT,
    jobNumber: "CZ-1",
    customerId: CUSTOMER,
    customerName: "Alfa",
    pickupDate: "2026-10-27",
    pickup: { ...stop(), id: "p", kind: "PICKUP" } as never,
    delivery: { ...stop({ name: "Beta" }), id: "d", kind: "DELIVERY" } as never,
    load: load({ pieces: 4, weightKg: 800, cbm: 3 }),
    ...over,
  });

const trip = (over: Partial<TruckingTripRecord> = {}) =>
  tripRepository.insert(TX as never, {
    companyId: COMPANY,
    ref: "LCZ2026000001",
    haulierCustomerId: HAULIER,
    haulierName: "Bravo",
    plannedPickupDate: "2026-10-27",
    tractorPlate: "1AB2345",
    driverName: "Petr",
    ...over,
  });

/** An LTL trip of `kind` carrying one consignment of `shipmentId`, its order sent and the warehouse told. */
async function announcedTrip(kind: "PICKUP_RUN" | "LINEHAUL" | "DELIVERY_RUN", over: Partial<TruckingTripRecord> = {}, shipmentId = SHIPMENT) {
  const c = await consignment({ scope: "LTL", shipmentId, ref: `TCZ20260000${store.consignments.length + 10}` });
  const t = await trip({ kind, status: "ORDERED", orderSentAt: new Date(), warehouseJobs: [{ shipmentId, consignmentId: c.id }], ...over });
  await legRepository.insertMany(TX as never, [
    { companyId: COMPANY, consignmentId: c.id, tripId: t.id, seq: kind === "PICKUP_RUN" ? 1 : kind === "LINEHAUL" ? 2 : 3, kind: kind === "PICKUP_RUN" ? "PICKUP" : kind === "LINEHAUL" ? "LINEHAUL" : "DELIVERY", status: "PLANNED" },
  ]);
  return { c, t };
}

// What the Customer Database holds now (live customers only), by id: what a change event reads.
const directory = new Map<string, string>();

const changed = (customerId: string, companyName: string, over: { companyId?: string; deleted?: boolean } = {}) =>
  customerLinksService.customerChanged({ companyId: COMPANY, customerId, companyName, label: "STANDARD", deleted: false, ...over });

/** A rename in the Customer Database: it holds the name, and the event says it. */
const renamed = (customerId: string, companyName: string) => {
  directory.set(customerId, companyName);
  return changed(customerId, companyName);
};

beforeEach(() => {
  resetStore();
  vi.clearAllMocks();
  directory.clear();
  refs.mockImplementation((async ({ customerIds }: { customerIds: string[] }) => ({
    customers: customerIds.filter((id) => directory.has(id)).map((id) => ({ id, companyName: directory.get(id)!, label: "STANDARD" })),
    contacts: [],
  })) as never);
});

describe("a company renamed in the Customer Database", () => {
  it("is written on its consignments (as customer) and its trips (as haulier), and nowhere else", async () => {
    const mine = await consignment();
    const other = await consignment({ ref: "TCZ2026000002", customerId: CUSTOMER2, customerName: "Delta" });
    const elsewhere = await consignment({ companyId: OTHER_COMPANY, ref: "TCZ2026000003" });
    const t1 = await trip();
    const t2 = await trip({ ref: "LCZ2026000002", haulierCustomerId: HAULIER2, haulierName: "Gama" });

    expect(await renamed(CUSTOMER, "Alfa Logistics s.r.o.")).toEqual({ consignments: 1, trips: 0 });
    expect(await renamed(HAULIER, "Bravo Trans a.s.")).toEqual({ consignments: 0, trips: 1 });

    const byId = <T extends { id: string }>(rows: T[], id: string) => rows.find((r) => r.id === id)!;
    expect(byId(store.consignments, mine.id).customerName).toBe("Alfa Logistics s.r.o.");
    expect(byId(store.consignments, other.id).customerName).toBe("Delta");
    expect(byId(store.consignments, elsewhere.id).customerName).toBe("Alfa");
    expect(byId(store.trips, t1.id).haulierName).toBe("Bravo Trans a.s.");
    expect(byId(store.trips, t2.id).haulierName).toBe("Gama");
    // A rename is no edit: an edit form open meanwhile still saves.
    expect(byId(store.consignments, mine.id).version).toBe(1);
    expect(byId(store.trips, t1.id).version).toBe(1);
  });

  it("asks the Customer Database for that one customer, as the event's company without a user", async () => {
    await consignment();
    await renamed(CUSTOMER, "Alfa Logistics");
    expect(refs).toHaveBeenCalledTimes(1);
    expect(refs).toHaveBeenCalledWith({ customerIds: [CUSTOMER] }, { authData: { userID: "", companyID: COMPANY, role: "user" } });
    // Under the customer's turn: the read is part of the rename.
    expect(vi.mocked(customerLinksRepository.renameCustomer)).toHaveBeenCalledWith(COMPANY, CUSTOMER, expect.any(Function));
  });

  it("writes the name the Customer Database holds now, not an older one an event delivered late carries", async () => {
    await consignment();
    await trip({ haulierCustomerId: CUSTOMER });
    await renamed(CUSTOMER, "Alfa Logistics");
    directory.set(CUSTOMER, "Alfa Group");
    await changed(CUSTOMER, "Alfa Group");

    // The first rename's event comes again (a retry, or out of order).
    expect(await changed(CUSTOMER, "Alfa Logistics")).toEqual({ consignments: 0, trips: 0 });

    expect(store.consignments[0]!.customerName).toBe("Alfa Group");
    expect(store.trips[0]!.haulierName).toBe("Alfa Group");
  });

  it("changes nothing when the message comes again, or when only another field changed", async () => {
    await consignment();
    await trip({ haulierCustomerId: CUSTOMER });
    expect(await renamed(CUSTOMER, "Alfa Logistics")).toEqual({ consignments: 1, trips: 1 });
    expect(await renamed(CUSTOMER, "Alfa Logistics")).toEqual({ consignments: 0, trips: 0 });
    expect(await customerLinksService.applyName(COMPANY, CUSTOMER, "Alfa Logistics")).toEqual({ consignments: 0, trips: 0 });
  });

  it("never blanks a name out", async () => {
    await consignment();
    directory.set(CUSTOMER, "   ");
    expect(await changed(CUSTOMER, "   ")).toEqual({ consignments: 0, trips: 0 });
    // Gone, with a blank name in its delete event: still kept.
    directory.delete(CUSTOMER);
    expect(await changed(CUSTOMER, "", { deleted: true })).toEqual({ consignments: 0, trips: 0 });
    expect(await customerLinksService.applyName(COMPANY, CUSTOMER, " ")).toEqual({ consignments: 0, trips: 0 });
    expect(store.consignments[0]!.customerName).toBe("Alfa");
    expect(customerLinksRepository.renameConsignmentCustomer).not.toHaveBeenCalled();
  });

  it("trims the name it writes", async () => {
    await consignment();
    directory.set(CUSTOMER, "  Alfa Logistics  ");
    await changed(CUSTOMER, "  Alfa Logistics  ");
    expect(store.consignments[0]!.customerName).toBe("Alfa Logistics");
  });

  it("leaves the copies as they are when the Customer Database can't be asked: the event is delivered again", async () => {
    await consignment();
    refs.mockRejectedValueOnce(new Error("customers unavailable"));
    await expect(renamed(CUSTOMER, "Alfa Logistics")).rejects.toThrow("customers unavailable");
    expect(store.consignments[0]!.customerName).toBe("Alfa");
    // The retry writes it.
    await changed(CUSTOMER, "Alfa Logistics");
    expect(store.consignments[0]!.customerName).toBe("Alfa Logistics");
  });
});

describe("a company deleted in the Customer Database", () => {
  it("leaves its copies with its last name, the one its delete event carries", async () => {
    await consignment();
    await trip({ haulierCustomerId: CUSTOMER });
    // The rename right before the delete was lost or is still on its way: the delete's name is the last.
    expect(await changed(CUSTOMER, "Alfa Final s.r.o.", { deleted: true })).toEqual({ consignments: 1, trips: 1 });
    expect(store.consignments[0]!.customerName).toBe("Alfa Final s.r.o.");
    expect(store.trips[0]!.haulierName).toBe("Alfa Final s.r.o.");
    // Its copies keep the id (a restore sends the name again).
    expect(store.consignments[0]!.customerId).toBe(CUSTOMER);
  });

  it("writes nothing for an edit event of a customer deleted since: its delete event does", async () => {
    await consignment();
    await changed(CUSTOMER, "Alfa Final", { deleted: true });
    // An edit before the delete, delivered after it.
    expect(await changed(CUSTOMER, "Alfa Older")).toEqual({ consignments: 0, trips: 0 });
    expect(store.consignments[0]!.customerName).toBe("Alfa Final");
  });

  it("takes the current name when it was restored before its delete event came", async () => {
    await consignment();
    directory.set(CUSTOMER, "Alfa Restored");
    await changed(CUSTOMER, "Alfa Deleted", { deleted: true });
    expect(store.consignments[0]!.customerName).toBe("Alfa Restored");
  });
});

describe("a renamed haulier of a trip our warehouse expects", () => {
  // Announcing the trip again would also move dock slots and fill gate figures (warehouse review).
  it("is only renamed on the trip: nothing is sent to the warehouse", async () => {
    const { t } = await announcedTrip("PICKUP_RUN");
    await announcedTrip("LINEHAUL", { ref: "LCZ2026000002" }, SHIPMENT2);

    expect(await customerLinksService.applyName(COMPANY, HAULIER, "Bravo Trans a.s.")).toEqual({ consignments: 0, trips: 2 });

    expect(store.trips.every((x) => x.haulierName === "Bravo Trans a.s.")).toBe(true);
    const renamed = store.trips.find((x) => x.id === t.id)!;
    expect(renamed.version).toBe(t.version);
    expect(renamed.warehouseJobs).toEqual(t.warehouseJobs);
    expect(store.outbox).toHaveLength(0);
  });
});

describe("the backfill (POST /trucking/links/normalize)", () => {
  it("refreshes every copied name by its id and lists those whose customer is gone", async () => {
    await consignment({ customerName: "Alfa" });
    await consignment({ ref: "TCZ2026000002", customerName: "ALFA s.r.o." });
    await consignment({ ref: "TCZ2026000003", customerName: "Alfa Logistics s.r.o." });
    await consignment({ ref: "TCZ2026000004", customerId: CUSTOMER2, customerName: "Delta (deleted)" });
    await consignment({ ref: "TCZ2026000005", customerId: CUSTOMER2, customerName: "Delta (deleted)" });
    await trip({ haulierName: "Bravo" });
    await trip({ ref: "LCZ2026000002", haulierCustomerId: HAULIER2, haulierName: "Gama" });
    refs.mockResolvedValue({
      customers: [
        { id: CUSTOMER, companyName: "Alfa Logistics s.r.o.", label: "STANDARD" },
        { id: HAULIER, companyName: "Bravo Trans a.s.", label: "STANDARD" },
      ],
      contacts: [],
    } as never);

    const result = await customerLinksService.normalize(COMPANY);

    expect(refs).toHaveBeenCalledTimes(1);
    expect(new Set(refs.mock.calls[0]![0].customerIds)).toEqual(new Set([CUSTOMER, CUSTOMER2, HAULIER, HAULIER2]));
    expect(result).toEqual({
      checked: 7,
      changed: 3,
      unmatched: [
        { field: "consignment.customerName", value: "Delta (deleted)", count: 2 },
        { field: "trip.haulierName", value: "Gama", count: 1 },
      ],
    });
    expect(store.consignments.filter((c) => c.customerId === CUSTOMER).every((c) => c.customerName === "Alfa Logistics s.r.o.")).toBe(true);
    expect(store.trips.find((t) => t.haulierCustomerId === HAULIER)!.haulierName).toBe("Bravo Trans a.s.");

    // Safe to run again.
    expect(await customerLinksService.normalize(COMPANY)).toMatchObject({ checked: 7, changed: 0 });
  });

  it("asks the Customer Database in batches of at most 500 ids", async () => {
    const ids = Array.from({ length: 1001 }, (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`);
    vi.mocked(customerLinksRepository.storedNames).mockResolvedValueOnce(ids.map((id) => ({ field: "consignment.customerName", id, name: "X", count: 1 })));
    refs.mockResolvedValue({ customers: [], contacts: [] } as never);

    const result = await customerLinksService.normalize(COMPANY);

    expect(refs.mock.calls.map((c) => c[0].customerIds.length)).toEqual([500, 500, 1]);
    expect(result).toEqual({ checked: 1001, changed: 0, unmatched: [{ field: "consignment.customerName", value: "X", count: 1001 }] });
  });

  it("does nothing for a company without consignments or trips", async () => {
    expect(await customerLinksService.normalize(COMPANY)).toEqual({ checked: 0, changed: 0, unmatched: [] });
    expect(refs).not.toHaveBeenCalled();
  });
});

describe("unmatchedOf", () => {
  it("adds up one text of one field, most frequent first", () => {
    expect(
      unmatchedOf([
        { field: "trip.haulierName", id: "a", name: "Gama", count: 1 },
        { field: "consignment.customerName", id: "b", name: "Delta", count: 2 },
        { field: "consignment.customerName", id: "c", name: "Delta", count: 3 },
        { field: "trip.haulierName", id: "d", name: "Delta", count: 1 },
      ]),
    ).toEqual([
      { field: "consignment.customerName", value: "Delta", count: 5 },
      { field: "trip.haulierName", value: "Delta", count: 1 },
      { field: "trip.haulierName", value: "Gama", count: 1 },
    ]);
  });
});
