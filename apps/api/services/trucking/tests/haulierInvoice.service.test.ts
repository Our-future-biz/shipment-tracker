import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Haulier invoices run for real against in-memory repositories (no database): exact matching,
// the VAT block nobody can override, manager approval / rejection with reasons, duplicates, a
// trip on two invoices, the real cost to Road jobs (and not to internal ones), and candidates.
vi.mock("encore.dev/api", () => import("../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/clients", () => ({
  customers: { _internalHaulierList: vi.fn() },
  shipments: { _internalShipmentBasics: vi.fn() },
}));
vi.mock("../db/db", () => ({ db: {}, inTx: async <T>(work: (tx: unknown) => Promise<T>) => work({ fake: "tx" }) }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: { upload: vi.fn(async () => undefined), remove: vi.fn(async () => undefined), download: vi.fn(async () => Buffer.from("%PDF-1.4 x")) } }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn(async () => ({ sent: 0, retry: 0, failed: 0 })) }));
vi.mock("../services/settings.service", () => ({ settingsService: { get: vi.fn(), vehicleCodes: vi.fn(async () => []) } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));

// The rows the fakes keep (only the columns they read are typed).
interface InvRow {
  id: string;
  status: string;
  haulierCustomerId: string;
  invoiceNumberKey: string;
  invoiceNumber: string;
  version: number;
  fileStorageKey: string | null;
  [column: string]: unknown;
}
interface LineRow {
  id: string;
  invoiceId: string;
  live: boolean;
  deletedAt: Date | null;
  targetKind: string;
  targetId: string;
  allocations?: unknown;
  [column: string]: unknown;
}
interface TripRow {
  id: string;
  ref: string;
  kind: string;
  status: string;
  haulierCustomerId: string;
  cancelledAt: Date | null;
  plannedPickupDate: string;
  buy: unknown;
}
interface LegRow {
  id: string;
  tripId: string | null;
  consignmentId: string;
  kind: string;
  status: string;
  costShareCzk: number | null;
  haulierCustomerId: string | null;
  buy: unknown;
}
interface ConsignmentRow {
  id: string;
  ref: string;
  shipmentId: string;
  tripId: string | null;
  cancelledAt: Date | null;
  deliveredAt: Date | null;
  pickupDate: string;
}
interface OutboxRow {
  kind: string;
  shipmentId: string;
  payload: { sourceRef: string; realLines: { amount: number }[] };
  [column: string]: unknown;
}

const mem = vi.hoisted(() => ({
  invoices: [] as InvRow[],
  lines: [] as LineRow[],
  trips: [] as TripRow[],
  legs: [] as LegRow[],
  consignments: [] as ConsignmentRow[],
  profiles: new Map<string, Record<string, unknown>>(),
  outbox: [] as OutboxRow[],
  events: [] as Record<string, unknown>[],
}));

vi.mock("../repositories/haulier.repository", () => ({
  haulierRepository: {
    find: vi.fn(async (_c: string, id: string) => (mem.profiles.has(id) ? { profile: mem.profiles.get(id), lanes: [] } : null)),
    findMany: vi.fn(async (_c: string, ids: string[]) => ids.filter((id) => mem.profiles.has(id)).map((id) => ({ profile: mem.profiles.get(id), lanes: [] }))),
  },
}));
vi.mock("../repositories/trip.repository", () => ({
  tripRepository: {
    find: vi.fn(async (_c: string, id: string) => mem.trips.find((t) => t.id === id) ?? null),
    findMany: vi.fn(async (_c: string, ids: string[]) => mem.trips.filter((t) => ids.includes(t.id))),
  },
}));
vi.mock("../repositories/leg.repository", () => ({
  legRepository: {
    find: vi.fn(async (_c: string, id: string) => mem.legs.find((l) => l.id === id) ?? null),
    findMany: vi.fn(async (_c: string, ids: string[]) => mem.legs.filter((l) => ids.includes(l.id))),
    forTrips: vi.fn(async (_c: string, ids: string[]) => mem.legs.filter((l) => !!l.tripId && ids.includes(l.tripId))),
  },
}));
vi.mock("../repositories/consignment.repository", () => ({
  consignmentRepository: {
    findMany: vi.fn(async (_c: string, ids: string[]) => mem.consignments.filter((c) => ids.includes(c.id))),
    findByTrip: vi.fn(async (_c: string, tripId: string) => mem.consignments.find((c) => c.tripId === tripId) ?? null),
  },
}));
vi.mock("../repositories/truckingOutbox.repository", () => ({
  truckingOutboxRepository: { enqueue: vi.fn(async (_tx: unknown, _c: string, rows: unknown[]) => void mem.outbox.push(...(rows as OutboxRow[]))) },
}));
vi.mock("../repositories/event.repository", () => ({ appendEvent: vi.fn(async (_tx: unknown, _c: string, e: Record<string, unknown>) => void mem.events.push(e)) }));

// The invoice repository as the database would behave, unique indexes included.
vi.mock("../repositories/haulierInvoice.repository", () => {
  const unique = (err: string) => Object.assign(new Error(err), { cause: { code: "23505" } });
  const checkUnique = () => {
    const live = mem.invoices.filter((i) => i.status !== "REJECTED");
    const keys = live.map((i) => `${i.haulierCustomerId}|${i.invoiceNumberKey}`);
    if (new Set(keys).size !== keys.length) throw unique("number");
    const targets = mem.lines.filter((l) => l.live && !l.deletedAt).map((l) => `${l.targetKind}|${l.targetId}`);
    if (new Set(targets).size !== targets.length) throw unique("target");
  };
  const linesOf = (id: string) => mem.lines.filter((l) => l.invoiceId === id && !l.deletedAt);
  const addLines = (invoiceId: string, rows: Record<string, unknown>[]) =>
    rows.map((l) => {
      const row = { ...l, id: randomUUID(), invoiceId, createdAt: new Date(), deletedAt: null } as unknown as LineRow;
      mem.lines.push(row);
      return row;
    });
  return {
    haulierInvoiceRepository: {
      lockHaulier: vi.fn(async () => undefined),
      findByNumber: vi.fn(async (_tx: unknown, _c: string, h: string, key: string, except?: string) =>
        mem.invoices.find((i) => i.haulierCustomerId === h && i.invoiceNumberKey === key && i.status !== "REJECTED" && i.id !== except) ?? null,
      ),
      targetUses: vi.fn(async (_c: string, targets: { kind: string; id: string }[], except?: string) =>
        mem.lines
          .filter((l) => l.live && !l.deletedAt && l.invoiceId !== except && targets.some((t) => t.kind === l.targetKind && t.id === l.targetId))
          .map((l) => {
            const inv = mem.invoices.find((i) => i.id === l.invoiceId)!;
            return { targetKind: l.targetKind, targetId: l.targetId, invoiceId: inv.id, invoiceNumber: inv.invoiceNumber, status: inv.status };
          }),
      ),
      insert: vi.fn(async (_tx: unknown, values: Record<string, unknown>, lines: Record<string, unknown>[]) => {
        const invoice = { approvedAt: null, approvedBy: null, approvalReason: null, rejectedAt: null, fileName: null, fileStorageKey: null, ...values, id: randomUUID(), createdAt: new Date() } as unknown as InvRow;
        mem.invoices.push(invoice);
        const rows = addLines(invoice.id, lines);
        checkUnique();
        return { invoice, lines: rows };
      }),
      update: vi.fn(async (_tx: unknown, _c: string, id: string, version: number, statuses: string[], values: Record<string, unknown>) => {
        const row = mem.invoices.find((i) => i.id === id);
        if (!row || row.version !== version || !statuses.includes(row.status)) return null;
        Object.assign(row, values, { version: row.version + 1 });
        checkUnique();
        return row;
      }),
      replaceLines: vi.fn(async (_tx: unknown, _c: string, invoiceId: string, lines: Record<string, unknown>[]) => {
        for (const l of linesOf(invoiceId)) Object.assign(l, { deletedAt: new Date(), live: false });
        const rows = addLines(invoiceId, lines);
        checkUnique();
        return rows;
      }),
      releaseLines: vi.fn(async (_tx: unknown, _c: string, invoiceId: string) => {
        for (const l of linesOf(invoiceId)) l.live = false;
      }),
      setAllocations: vi.fn(async (_tx: unknown, _c: string, lineId: string, allocations: unknown) => {
        mem.lines.find((l) => l.id === lineId)!.allocations = allocations;
      }),
      find: vi.fn(async (_c: string, id: string) => {
        const invoice = mem.invoices.find((i) => i.id === id);
        return invoice ? { invoice, lines: linesOf(id) } : null;
      }),
      list: vi.fn(async (_c: string, f: { statuses?: string[]; haulierCustomerId?: string }) =>
        mem.invoices
          .filter((i) => (!f.statuses || f.statuses.includes(i.status)) && (!f.haulierCustomerId || i.haulierCustomerId === f.haulierCustomerId))
          .map((invoice) => ({ invoice, lines: linesOf(invoice.id) })),
      ),
      doneTrips: vi.fn(async (_c: string, h: string) => mem.trips.filter((t) => t.haulierCustomerId === h && t.status === "DONE" && !t.cancelledAt && t.buy)),
      donePartnerLegs: vi.fn(async (_c: string, h: string) =>
        mem.legs
          .filter((l) => l.haulierCustomerId === h && l.kind === "DELIVERY" && !l.tripId && l.status === "DONE" && l.buy)
          .map((leg) => ({ leg, consignment: mem.consignments.find((c) => c.id === leg.consignmentId)! })),
      ),
    },
  };
});

import { customers, shipments } from "~encore/clients";
import { haulierInvoiceService } from "../services/haulierInvoice.service";
import { setClaimsSource, noClaims } from "../lib/haulierClaims";
import type { HaulierInvoiceInput } from "../interfaces/haulierInvoice.interfaces";
import type { PriceSnapshot } from "../interfaces/interfaces";

const COMPANY = "00000000-0000-0000-0000-000000000001";
const U = "00000000-0000-0000-0000-000000000002";
const H = "00000000-0000-0000-0000-0000000000a1";
const H2 = "00000000-0000-0000-0000-0000000000a2";
const S_ROAD = "00000000-0000-0000-0000-0000000000d1";
const S_ROAD2 = "00000000-0000-0000-0000-0000000000d2";
const S_OPS = "00000000-0000-0000-0000-0000000000d3";
const ACCOUNT = "19-2000145399/0800";

const user = { userID: U, companyID: COMPANY, role: "user" };
const manager = { userID: U, companyID: COMPANY, role: "manager" };
const admin = { userID: U, companyID: COMPANY, role: "admin" };

const snapshot = (amounts: number[], currency: "CZK" | "EUR" = "CZK"): PriceSnapshot => ({
  source: "TARIFF",
  tariffId: null,
  tariffVersionId: null,
  versionNo: null,
  tariffName: "Buy",
  serviceLevel: null,
  currency,
  total: amounts.reduce((a, b) => a + b, 0),
  totalCzk: amounts.reduce((a, b) => a + b, 0),
  lines: amounts.map((amount, i) => ({ code: `L${i}`, label: `Line ${i}`, qty: 1, unit: "trip", unitPrice: amount, amount })),
  ratedAt: "2026-10-01T00:00:00Z",
  overrideReason: null,
});

const profile = (over: Record<string, unknown> = {}) => ({
  customerId: H,
  insurer: "",
  insurancePolicyNo: "",
  insuranceLimit: null,
  insuranceCurrency: "EUR",
  insuranceValidTo: null,
  licenceNo: "",
  licenceValidTo: null,
  licenceUnlimited: true,
  adrCapable: false,
  vehicleTypes: [],
  paymentDays: 30,
  currency: "CZK",
  vatUnreliable: false,
  bankAccountPublished: true,
  bankAccounts: [ACCOUNT],
  vatCheckedAt: "2026-10-01",
  costSplitBasis: "chargeable_weight",
  blocked: false,
  blockReason: "",
  blockedAt: null,
  blockedBy: null,
  notes: "",
  version: 3,
  ...over,
});

let FTL: string;
let LTL: string;
let LEG: string;

function seed() {
  FTL = randomUUID();
  LTL = randomUUID();
  LEG = randomUUID();
  const c1 = { id: randomUUID(), ref: "TCZ2026000001", shipmentId: S_ROAD, tripId: FTL, cancelledAt: null, deliveredAt: new Date("2026-10-05T10:00:00Z"), pickupDate: "2026-10-04" };
  const c2 = { id: randomUUID(), ref: "TCZ2026000002", shipmentId: S_ROAD2, tripId: null, cancelledAt: null, deliveredAt: null, pickupDate: "2026-10-06" };
  const c3 = { id: randomUUID(), ref: "TCZ2026000003", shipmentId: S_OPS, tripId: null, cancelledAt: null, deliveredAt: new Date("2026-10-08T09:00:00Z"), pickupDate: "2026-10-06" };
  mem.consignments.push(c1, c2, c3);
  mem.trips.push(
    { id: FTL, ref: "LCZ2026000001", kind: "FTL", status: "DONE", haulierCustomerId: H, cancelledAt: null, plannedPickupDate: "2026-10-04", buy: snapshot([9000, 1000]) },
    { id: LTL, ref: "LCZ2026000002", kind: "PICKUP_RUN", status: "DONE", haulierCustomerId: H, cancelledAt: null, plannedPickupDate: "2026-10-06", buy: snapshot([1000]) },
    { id: randomUUID(), ref: "LCZ2026000003", kind: "FTL", status: "IN_TRANSIT", haulierCustomerId: H, cancelledAt: null, plannedPickupDate: "2026-10-09", buy: snapshot([500]) },
    { id: randomUUID(), ref: "LCZ2026000004", kind: "FTL", status: "DONE", haulierCustomerId: H2, cancelledAt: null, plannedPickupDate: "2026-10-04", buy: snapshot([700]) },
  );
  mem.legs.push(
    // The LTL pick-up run carries a Road job (2 legs worth 600) and an Operations job (400).
    { id: randomUUID(), tripId: LTL, consignmentId: c2.id, kind: "PICKUP", status: "DONE", costShareCzk: 600, haulierCustomerId: null, buy: null },
    { id: randomUUID(), tripId: LTL, consignmentId: c3.id, kind: "PICKUP", status: "DONE", costShareCzk: 400, haulierCustomerId: null, buy: null },
    { id: LEG, tripId: null, consignmentId: c3.id, kind: "DELIVERY", status: "DONE", costShareCzk: null, haulierCustomerId: H, buy: snapshot([800]) },
  );
}

const invoice = (over: Partial<HaulierInvoiceInput> = {}): HaulierInvoiceInput => ({
  haulierCustomerId: H,
  invoiceNumber: "FV 2026/101",
  issueDate: "2026-10-10",
  dueDate: "2026-11-09",
  duzp: "2026-10-09",
  currency: "CZK",
  totalNet: 10000,
  vatAmount: 2100,
  totalGross: 12100,
  bankAccount: "CZ65 0800 0000 1920 0014 5399",
  lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 10000, note: "" }],
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mem.invoices = [];
  mem.lines = [];
  mem.trips = [];
  mem.legs = [];
  mem.consignments = [];
  mem.outbox = [];
  mem.events = [];
  mem.profiles = new Map([[H, profile()]]);
  setClaimsSource(noClaims);
  seed();
  vi.mocked(customers._internalHaulierList).mockImplementation((async ({ ids }: { ids?: string[] }) => ({
    hauliers: [
      { id: H, companyName: "Bravo Trans", ico: "1", dic: "CZ1", city: "Brno" },
      { id: H2, companyName: "Gama", ico: "2", dic: "CZ2", city: "Praha" },
    ].filter((h) => !ids || ids.includes(h.id)),
  })) as never);
  vi.mocked(shipments._internalShipmentBasics).mockImplementation((async ({ ids }: { ids: string[] }) => ({
    shipments: ids.map((id) => ({ id, jobNumber: id.slice(-4), department: id === S_OPS ? "Operations" : "Road Department" })),
  })) as never);
});

describe("matching", () => {
  it("approves an exact match automatically and sends the real cost to the Road job's trip rows", async () => {
    const inv = await haulierInvoiceService.create(user, invoice());
    expect(inv).toMatchObject({
      status: "APPROVED",
      invoiceNumber: "FV 2026/101",
      bankAccount: ACCOUNT,
      bankAccountCheck: { published: true, checkedAt: "2026-10-01" },
      difference: 0,
      blockReasons: [],
      approval: { byName: "Exact match (automatic)" },
      lines: [{ target: { kind: "TRIP", id: FTL, ref: "LCZ2026000001" }, expected: 10000, claimed: 0, invoiced: 10000, difference: 0 }],
    });
    expect(mem.outbox).toEqual([
      expect.objectContaining({
        kind: "real_costs",
        shipmentId: S_ROAD,
        payload: {
          sourceRef: `trucking:trip:${FTL}`,
          realLines: [
            { description: "LCZ2026000001 · Line 0", amount: 9000, currency: "CZK", invoiceNumber: "FV 2026/101" },
            { description: "LCZ2026000001 · Line 1", amount: 1000, currency: "CZK", invoiceNumber: "FV 2026/101" },
          ],
        },
      }),
    ]);
    expect(mem.events.map((e) => e.kind)).toEqual(["haulier_invoice_entered", "haulier_invoice_approved"]);
  });

  it("needs approval for any difference, and sends nothing until approved", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 10000.5, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 10000.5, note: "" }] }));
    expect(inv).toMatchObject({ status: "NEEDS_APPROVAL", difference: 0.5, approval: null, lines: [{ difference: 0.5 }] });
    expect(mem.outbox).toEqual([]);
  });

  it("needs approval when the net total does not match the lines", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 10100 }));
    expect(inv).toMatchObject({ status: "NEEDS_APPROVAL", difference: 100, lines: [{ difference: 0 }] });
  });

  it("expects the cost less what is claimed against the haulier", async () => {
    setClaimsSource({ claimedFor: async () => new Map([[FTL, 1500]]) });
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 8500, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 8500, note: "" }] }));
    expect(inv).toMatchObject({ status: "APPROVED", lines: [{ expected: 8500, claimed: 1500, difference: 0 }] });
  });

  it("refuses a trip that is not done, of another haulier, or priced in another currency", async () => {
    const running = mem.trips.find((t) => t.ref === "LCZ2026000003")!;
    const other = mem.trips.find((t) => t.ref === "LCZ2026000004")!;
    await expect(haulierInvoiceService.create(user, invoice({ lines: [{ targetKind: "TRIP", targetId: running.id, invoiced: 500, note: "" }] }))).rejects.toMatchObject({ code: "invalid_argument", message: expect.stringMatching(/not done/) });
    await expect(haulierInvoiceService.create(user, invoice({ lines: [{ targetKind: "TRIP", targetId: other.id, invoiced: 700, note: "" }] }))).rejects.toMatchObject({ message: expect.stringMatching(/another haulier/) });
    await expect(haulierInvoiceService.create(user, invoice({ currency: "EUR" }))).rejects.toMatchObject({ message: expect.stringMatching(/priced in CZK/) });
  });
});

describe("VAT block: nobody can approve", () => {
  const cases: [string, Record<string, unknown>, RegExp][] = [
    ["unreliable VAT payer", { vatUnreliable: true }, /unreliable VAT payer/],
    ["account not published", { bankAccountPublished: false }, /not marked as published/],
    ["account not in the list", { bankAccounts: ["DE89370400440532013000"] }, /is not one of the haulier's accounts/],
    ["haulier blocked", { blocked: true, blockReason: "Claims" }, /blocked: Claims/],
  ];
  for (const [what, over, why] of cases) {
    it(`blocks the invoice when ${what}, even on an exact match; manager and admin are refused`, async () => {
      mem.profiles.set(H, profile(over));
      const inv = await haulierInvoiceService.create(user, invoice());
      expect(inv.status).toBe("BLOCKED");
      expect(inv.blockReasons).toEqual([expect.stringMatching(why)]);
      expect(mem.outbox).toEqual([]);
      for (const who of [manager, admin]) {
        await expect(haulierInvoiceService.approve(who, inv.id, "Pay anyway please")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(why) });
      }
      expect(mem.invoices[0]!.status).toBe("BLOCKED");
      expect(mem.outbox).toEqual([]);
    });
  }

  it("a haulier without a profile is blocked", async () => {
    mem.profiles.clear();
    expect((await haulierInvoiceService.create(user, invoice())).status).toBe("BLOCKED");
  });

  it("once the profile is fixed, a manager may approve a blocked invoice (checked again now)", async () => {
    mem.profiles.set(H, profile({ bankAccounts: [] }));
    const inv = await haulierInvoiceService.create(user, invoice());
    mem.profiles.set(H, profile());
    const approved = await haulierInvoiceService.approve(manager, inv.id, "Account confirmed in the register");
    expect(approved).toMatchObject({ status: "APPROVED", blockReasons: [], approval: { byName: "Jana Nováková", reason: "Account confirmed in the register" } });
    expect(mem.outbox).toHaveLength(1);
  });

  it("shows a blocked invoice as waiting for approval once the profile is fixed (no re-save), never approved by itself", async () => {
    mem.profiles.set(H, profile({ vatUnreliable: true }));
    const inv = await haulierInvoiceService.create(user, invoice());
    expect(inv.status).toBe("BLOCKED");
    mem.profiles.set(H, profile());
    expect(await haulierInvoiceService.get(user, inv.id)).toMatchObject({ status: "NEEDS_APPROVAL", blockReasons: [], approval: null });
    expect((await haulierInvoiceService.list(user, { status: "NEEDS_APPROVAL" })).map((i) => i.id)).toEqual([inv.id]);
    expect(await haulierInvoiceService.list(user, { status: "BLOCKED" })).toEqual([]);
    expect(mem.outbox).toEqual([]);
    // Failing the check again blocks it again on read.
    mem.profiles.set(H, profile({ vatUnreliable: true }));
    expect(await haulierInvoiceService.get(user, inv.id)).toMatchObject({ status: "BLOCKED", blockReasons: [expect.stringMatching(/unreliable VAT payer/)] });
  });
});

describe("approve and reject", () => {
  it("only a manager approves, with a reason; then the real cost goes out", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 10200, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 10200, note: "waiting" }] }));
    await expect(haulierInvoiceService.approve(user, inv.id, "Waiting time agreed")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(haulierInvoiceService.approve(manager, inv.id, "ok")).rejects.toMatchObject({ code: "invalid_argument" });
    const approved = await haulierInvoiceService.approve(manager, inv.id, "Waiting time agreed");
    expect(approved).toMatchObject({ status: "APPROVED", approval: { reason: "Waiting time agreed" } });
    expect(mem.outbox[0]!.payload.realLines.map((l: { amount: number }) => l.amount)).toEqual([9180, 1020]);
    await expect(haulierInvoiceService.approve(manager, inv.id, "Again please")).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(haulierInvoiceService.reject(manager, inv.id, "Too late now")).rejects.toMatchObject({ code: "failed_precondition" });
    expect(mem.events.at(-1)).toMatchObject({ kind: "haulier_invoice_approved", customerId: H, payload: { reason: "Waiting time agreed" } });
  });

  it("only a manager rejects, with a reason; the trip may then go on another invoice", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 12000, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 12000, note: "" }] }));
    await expect(haulierInvoiceService.reject(user, inv.id, "Wrong price")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(haulierInvoiceService.reject(manager, inv.id, " ")).rejects.toMatchObject({ code: "invalid_argument" });
    expect((await haulierInvoiceService.reject(manager, inv.id, "Wrong price")).status).toBe("REJECTED");
    expect((await haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 2026/102" }))).status).toBe("APPROVED");
  });

  it("a correction is saved with the version read and matched again", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 12000, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 12000, note: "" }] }));
    await expect(haulierInvoiceService.update(user, inv.id, { ...invoice(), version: inv.version + 1 })).rejects.toMatchObject({ code: "aborted" });
    const fixed = await haulierInvoiceService.update(user, inv.id, { ...invoice(), version: inv.version });
    expect(fixed).toMatchObject({ status: "APPROVED", version: inv.version + 1 });
    await expect(haulierInvoiceService.update(user, inv.id, { ...invoice(), version: fixed.version })).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("uniqueness", () => {
  it("refuses an invoice number the haulier already has (any spelling)", async () => {
    await haulierInvoiceService.create(user, invoice());
    await expect(haulierInvoiceService.create(user, invoice({ invoiceNumber: "fv2026/101", lines: [{ targetKind: "PARTNER_LEG", targetId: LEG, invoiced: 800, note: "" }], totalNet: 800 }))).rejects.toMatchObject({
      code: "already_exists",
      message: expect.stringMatching(/FV 2026\/101/),
    });
  });

  it("refuses a trip already on another invoice that is not rejected", async () => {
    await haulierInvoiceService.create(user, invoice({ totalNet: 12000, lines: [{ targetKind: "TRIP", targetId: FTL, invoiced: 12000, note: "" }] }));
    await expect(haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 2026/999" }))).rejects.toMatchObject({
      code: "already_exists",
      message: "LCZ2026000001 is already on invoice FV 2026/101",
    });
  });

  it("answers already_exists when the unique index catches a save made at the same moment", async () => {
    const { haulierInvoiceRepository } = await import("../repositories/haulierInvoice.repository");
    vi.mocked(haulierInvoiceRepository.targetUses).mockResolvedValueOnce([]);
    await haulierInvoiceService.create(user, invoice());
    vi.mocked(haulierInvoiceRepository.targetUses).mockResolvedValueOnce([]);
    await expect(haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 2026/999" }))).rejects.toMatchObject({ code: "already_exists" });
  });
});

describe("real cost and internal jobs", () => {
  it("an LTL trip shared by a Road job and an Operations job: only the Road job gets its part, like the estimate split", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 1000, lines: [{ targetKind: "TRIP", targetId: LTL, invoiced: 1000, note: "" }] }));
    expect(inv.status).toBe("APPROVED");
    expect(mem.outbox).toEqual([
      expect.objectContaining({ kind: "real_costs", shipmentId: S_ROAD2, payload: { sourceRef: `trucking:trip:${LTL}:job:${S_ROAD2}`, realLines: [{ amount: 600, currency: "CZK", invoiceNumber: "FV 2026/101" }] } }),
    ]);
    expect(mem.lines[0]!.allocations).toEqual([
      expect.objectContaining({ shipmentId: S_ROAD2, amount: 600, internal: false }),
      expect.objectContaining({ shipmentId: S_OPS, amount: 400, internal: true }),
    ]);
  });

  it("a partner delivery of an internal consignment: no job line at all, the cost stays in Trucking's ledger", async () => {
    const inv = await haulierInvoiceService.create(user, invoice({ totalNet: 800, lines: [{ targetKind: "PARTNER_LEG", targetId: LEG, invoiced: 800, note: "" }] }));
    expect(inv).toMatchObject({ status: "APPROVED", lines: [{ target: { ref: "TCZ2026000003 partner delivery" } }] });
    expect(mem.outbox).toEqual([]);
    expect(mem.lines[0]!.allocations).toEqual([{ shipmentId: S_OPS, sourceRef: `trucking:leg:${LEG}`, amount: 800, currency: "CZK", internal: true }]);
  });
});

describe("candidates", () => {
  it("lists the haulier's done trips and partner deliveries not on an approved invoice, marking those on an open one", async () => {
    await haulierInvoiceService.create(user, invoice()); // FTL approved
    await haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 2", totalNet: 1001, lines: [{ targetKind: "TRIP", targetId: LTL, invoiced: 1001, note: "" }] })); // needs approval
    setClaimsSource({ claimedFor: async () => new Map([[LEG, 50]]) });
    const targets = await haulierInvoiceService.candidates(user, H);
    expect(targets).toEqual([
      { kind: "TRIP", id: LTL, ref: "LCZ2026000002", date: "2026-10-06", expected: 1000, claimed: 0, currency: "CZK", alreadyInvoiced: true },
      { kind: "PARTNER_LEG", id: LEG, ref: "TCZ2026000003 partner delivery", date: "2026-10-08", expected: 750, claimed: 50, currency: "CZK", alreadyInvoiced: false },
    ]);
    expect(await haulierInvoiceService.candidates(user, H2)).toEqual([expect.objectContaining({ ref: "LCZ2026000004" })]);
    await expect(haulierInvoiceService.candidates(user, "x")).rejects.toMatchObject({ code: "invalid_argument" });
  });
});

describe("file and reading", () => {
  it("keeps an uploaded PDF in the trucking documents bucket and serves it back", async () => {
    const pdf = Buffer.from("%PDF-1.4 invoice").toString("base64");
    const inv = await haulierInvoiceService.create(user, invoice({ fileName: "C:\\scans\\fv101.pdf", fileBase64: pdf }));
    expect(inv.fileName).toBe("fv101.pdf");
    expect(mem.invoices[0]!.fileStorageKey).toMatch(new RegExp(`^${COMPANY}/haulier-invoices/`));
    expect((await haulierInvoiceService.file(user, inv.id)).contentType).toBe("application/pdf");
    await expect(haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 3", fileName: "x.html", fileBase64: Buffer.from("<html>").toString("base64") }))).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("lists by status and haulier", async () => {
    await haulierInvoiceService.create(user, invoice());
    await haulierInvoiceService.create(user, invoice({ invoiceNumber: "FV 2", totalNet: 1001, lines: [{ targetKind: "TRIP", targetId: LTL, invoiced: 1001, note: "" }] }));
    expect((await haulierInvoiceService.list(user, { status: "NEEDS_APPROVAL" })).map((i) => i.invoiceNumber)).toEqual(["FV 2"]);
    expect(await haulierInvoiceService.list(user, { haulierCustomerId: H2 })).toEqual([]);
  });
});

describe("no automatic approval after a bank-account change or a reprice (decisions 6 and 7)", () => {
  const OTHER = "00000000-0000-0000-0000-000000000009";
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

  it("holds an exact match for a manager within 30 days after the haulier's bank accounts changed", async () => {
    mem.profiles.set(H, profile({ bankAccountsChangedAt: daysAgo(5), bankAccountsChangedBy: "Petr", bankAccountsChangedByUserId: OTHER }));
    const inv = await haulierInvoiceService.create(user, invoice());
    expect(inv).toMatchObject({ status: "NEEDS_APPROVAL", difference: 0, approval: null });
    expect(inv.holdReasons).toEqual([expect.stringContaining("bank accounts were changed by Petr")]);
    expect(mem.outbox).toHaveLength(0);
    // A manager approves it with a reason.
    expect((await haulierInvoiceService.approve(manager, inv.id, "Account confirmed by phone")).status).toBe("APPROVED");
  });

  it("approves an exact match again once the 30 days are over", async () => {
    mem.profiles.set(H, profile({ bankAccountsChangedAt: daysAgo(31), bankAccountsChangedBy: "Petr", bankAccountsChangedByUserId: OTHER }));
    expect((await haulierInvoiceService.create(user, invoice())).status).toBe("APPROVED");
  });

  it("holds it when the user entering it is the one who changed the accounts, however long ago", async () => {
    mem.profiles.set(H, profile({ bankAccountsChangedAt: daysAgo(90), bankAccountsChangedBy: "Jana", bankAccountsChangedByUserId: U }));
    const inv = await haulierInvoiceService.create(user, invoice());
    expect(inv.status).toBe("NEEDS_APPROVAL");
    expect(inv.holdReasons).toEqual([expect.stringContaining("also entered this invoice")]);
  });

  it("holds an exact match on a trip repriced after its order went out", async () => {
    Object.assign(mem.trips.find((t) => t.id === FTL)!, { buyRepricedAt: daysAgo(1), buyRepricedBy: "Petr" });
    const inv = await haulierInvoiceService.create(user, invoice());
    expect(inv.status).toBe("NEEDS_APPROVAL");
    expect(inv.holdReasons).toEqual(["LCZ2026000001: the price was changed after the order went out: a manager must approve the payment"]);
  });

  it("refuses a save whose trip was repriced after it was read", async () => {
    const { tripRepository } = await import("../repositories/trip.repository");
    const real = vi.mocked(tripRepository.findMany).getMockImplementation()!;
    vi.mocked(tripRepository.findMany)
      .mockImplementationOnce(real)
      .mockImplementationOnce(async (c, ids) => (await real(c, ids)).map((t) => ({ ...t, buy: snapshot([12000]) })) as never);
    await expect(haulierInvoiceService.create(user, invoice())).rejects.toMatchObject({ code: "aborted", message: expect.stringContaining("LCZ2026000001") });
    expect(mem.invoices).toHaveLength(0);
  });

  it("removes the uploaded copy when the save is refused", async () => {
    const { truckingDocumentBucket } = await import("../storage/documentBucket");
    await haulierInvoiceService.create(user, invoice());
    await expect(haulierInvoiceService.create(user, invoice({ fileName: "inv.pdf", fileBase64: Buffer.from("%PDF-1.4 x").toString("base64") }))).rejects.toMatchObject({ code: "already_exists" });
    const key = vi.mocked(truckingDocumentBucket.upload).mock.calls[0]![0];
    expect(truckingDocumentBucket.remove).toHaveBeenCalledWith(key);
  });
});
