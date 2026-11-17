import { beforeEach, describe, expect, it, vi } from "vitest";

// What Finance → Accounts Payable reads of the haulier invoices (_internalHaulierInvoiceList), against an
// in-memory invoice repository: the status as Trucking shows it (an open one worked out now, not the stored one),
// filtering by it, paging with the total, the mapping (claims added up, refs bare) and the caller's company only.
// The Encore runtime isn't loaded: api() hands back the handler, the signed-in user comes from a stubbed getAuthData.
vi.mock("encore.dev/api", async () => ({ ...(await import("../../../lib/tests/encoreApi.stub")), api: (_opts: unknown, handler: unknown) => handler }));
vi.mock("encore.dev/log", () => ({ default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("~encore/auth", () => ({ getAuthData: () => ({ userID: "u1", companyID: "c1", role: "superadmin" }) }));
vi.mock("~encore/clients", () => ({ customers: { _internalHaulierList: vi.fn() }, shipments: { _internalShipmentBasics: vi.fn() } }));
vi.mock("../db/db", () => ({ db: {}, inTx: vi.fn() }));
vi.mock("../storage/documentBucket", () => ({ truckingDocumentBucket: {} }));
vi.mock("../services/truckingOutbox.service", () => ({ deliverDue: vi.fn() }));
vi.mock("../services/settings.service", () => ({ settingsService: { get: vi.fn(), vehicleCodes: vi.fn(async () => []) } }));
vi.mock("../lib/users", () => ({ userName: vi.fn(async () => "Jana Nováková") }));
vi.mock("../repositories/trip.repository", () => ({ tripRepository: {} }));
vi.mock("../repositories/leg.repository", () => ({ legRepository: {} }));
vi.mock("../repositories/consignment.repository", () => ({ consignmentRepository: {} }));
vi.mock("../repositories/truckingOutbox.repository", () => ({ truckingOutboxRepository: {} }));
vi.mock("../repositories/event.repository", () => ({ appendEvent: vi.fn() }));

interface Row {
  id: string;
  companyId: string;
  status: string;
  issueDate: string;
  [column: string]: unknown;
}
interface LineRow {
  invoiceId: string;
  [column: string]: unknown;
}

const mem = vi.hoisted(() => ({ invoices: [] as Row[], lines: [] as LineRow[], profiles: new Map<string, Record<string, unknown>>() }));

vi.mock("../repositories/haulier.repository", () => ({
  haulierRepository: {
    findMany: vi.fn(async (_c: string, ids: string[]) => ids.filter((id) => mem.profiles.has(id)).map((id) => ({ profile: mem.profiles.get(id), lanes: [] }))),
  },
}));

// The paged read as the database would answer it: the company's rows whose stored status or id matches, newest
// issued first then by id (descending), with the total before the page is cut.
vi.mock("../repositories/haulierInvoice.repository", () => ({
  haulierInvoiceRepository: {
    paymentTrackingSince: vi.fn(async () => null),
    page: vi.fn(async (companyId: string, f: { statuses?: string[]; ids?: string[] }, limit: number, offset: number) => {
      const any = !f.statuses && !f.ids;
      const all = mem.invoices
        .filter((r) => r.companyId === companyId && (any || (f.statuses ?? []).includes(r.status) || (f.ids ?? []).includes(r.id)))
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.id.localeCompare(a.id));
      return {
        stored: all.slice(offset, offset + limit).map((invoice) => ({ invoice, lines: mem.lines.filter((l) => l.invoiceId === invoice.id) })),
        total: all.length,
      };
    }),
  },
}));

import { _internalHaulierInvoiceList } from "../controllers/_internalHaulierInvoiceList.controller";
import { haulierInvoiceService } from "../services/haulierInvoice.service";
import { haulierInvoiceRepository } from "../repositories/haulierInvoice.repository";
import type { HaulierInvoiceFact } from "../interfaces/haulierInvoice.interfaces";

type Handler = (req: { statuses?: string[]; limit?: number; offset?: number }) => Promise<{ invoices: HaulierInvoiceFact[]; total: number; truncated: boolean }>;
const list = _internalHaulierInvoiceList as unknown as Handler;

const H = "00000000-0000-0000-0000-0000000000a1";
const ACCOUNT = "19-2000145399/0800";

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

let n = 0;
/** A stored invoice (only what the reading uses); ids sort like the order they are made in. */
function invoice(over: Partial<Row> & Record<string, unknown> = {}): Row {
  n += 1;
  const row: Row = {
    id: `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`,
    companyId: "c1",
    haulierCustomerId: H,
    haulierName: "Rychlá doprava s.r.o.",
    invoiceNumber: `FV-${n}`,
    issueDate: "2026-11-01",
    dueDate: "2026-12-01",
    duzp: "2026-11-01",
    currency: "CZK",
    totalNet: 1000,
    vatAmount: 210,
    totalGross: 1210,
    bankAccount: ACCOUNT,
    status: "APPROVED",
    blockReasons: [],
    holdReasons: [],
    difference: 0,
    approvedAt: new Date("2026-11-02T09:00:00Z"),
    approvedBy: "Petr Novák",
    approvalReason: "Exact match",
    rejectedAt: null,
    rejectedBy: null,
    rejectReason: null,
    paidOn: null,
    paidAt: null,
    paidBy: null,
    fileName: null,
    createdAt: new Date("2026-11-01T08:00:00Z"),
    createdBy: "Jana Nováková",
    version: 1,
    ...over,
  };
  mem.invoices.push(row);
  return row;
}

function line(invoiceId: string, over: Record<string, unknown> = {}) {
  mem.lines.push({ id: `line-${mem.lines.length}`, invoiceId, targetKind: "TRIP", targetId: "t1", targetRef: "LCZ0001", expected: 1000, claimed: 0, invoiced: 1000, currency: "CZK", note: "", ...over });
}

describe("_internalHaulierInvoiceList (Accounts Payable)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mem.invoices = [];
    mem.lines = [];
    mem.profiles = new Map([[H, profile()]]);
    n = 0;
  });

  it("hands every field Finance reads, its lines' claims added up and the bare trip / delivery refs", async () => {
    const paid = invoice({ paidOn: "2026-11-10", paidAt: new Date("2026-11-10T10:00:00Z"), paidBy: "Eva Malá" });
    line(paid.id, { targetRef: "LCZ0001", claimed: 100.1, expected: 899.9, invoiced: 600 });
    line(paid.id, { targetKind: "PARTNER_LEG", targetId: "l1", targetRef: "TCZ0009 partner delivery", claimed: 50.2, invoiced: 400 });
    line(paid.id, { targetRef: "LCZ0001", targetId: "t2", claimed: 0 });
    const rejected = invoice({
      status: "REJECTED",
      approvedAt: null,
      approvedBy: null,
      rejectedAt: new Date("2026-11-03T12:00:00Z"),
      rejectedBy: "Petr Novák",
      rejectReason: "Wrong trip",
      issueDate: "2026-10-01",
    });

    const { invoices, total, truncated } = await list({});
    expect(total).toBe(2);
    expect(truncated).toBe(false);
    expect(invoices[0]).toEqual({
      id: paid.id,
      haulierCustomerId: H,
      haulierName: "Rychlá doprava s.r.o.",
      invoiceNumber: "FV-1",
      issueDate: "2026-11-01",
      dueDate: "2026-12-01",
      duzp: "2026-11-01",
      currency: "CZK",
      net: 1000,
      vat: 210,
      gross: 1210,
      status: "APPROVED",
      blockReasons: [],
      approvedAt: "2026-11-02T09:00:00.000Z",
      approvedBy: "Petr Novák",
      rejectedAt: null,
      rejectReason: "",
      paidOn: "2026-11-10",
      paidBy: "Eva Malá",
      claimed: 150.3,
      refs: ["LCZ0001", "TCZ0009"],
      createdAt: "2026-11-01T08:00:00.000Z",
    });
    expect(invoices[1]).toMatchObject({ id: rejected.id, status: "REJECTED", approvedAt: null, approvedBy: "", rejectedAt: "2026-11-03T12:00:00.000Z", rejectReason: "Wrong trip", paidOn: null, paidBy: "", claimed: 0, refs: [] });
  });

  it("reads the caller's company only", async () => {
    const mine = invoice();
    invoice({ companyId: "c2" });
    const { invoices, total } = await list({});
    expect(invoices.map((i) => i.id)).toEqual([mine.id]);
    expect(total).toBe(1);
    expect(vi.mocked(haulierInvoiceRepository.page)).toHaveBeenCalledWith("c1", {}, 1000, 0);
  });

  it("shows an open invoice's status worked out now, with the block reasons as they are now", async () => {
    // Saved waiting for approval; the haulier has since been listed as an unreliable VAT payer.
    const now = invoice({ status: "NEEDS_APPROVAL", approvedAt: null, approvedBy: null });
    line(now.id, { invoiced: 1100 });
    mem.profiles.set(H, profile({ vatUnreliable: true }));
    const { invoices } = await list({});
    expect(invoices[0]).toMatchObject({ id: now.id, status: "BLOCKED", blockReasons: [expect.stringMatching(/unreliable VAT payer/)] });
  });

  it("filters by the status Trucking shows, not the stored one, and counts the total so", async () => {
    const wasBlocked = invoice({ status: "BLOCKED", approvedAt: null, approvedBy: null, blockReasons: ["old reason"], issueDate: "2026-11-05" });
    line(wasBlocked.id, { invoiced: 1100 }); // a difference: waits for a manager now that the block is gone
    const draft = invoice({ status: "DRAFT", approvedAt: null, approvedBy: null, issueDate: "2026-11-04" });
    const approved = invoice({ issueDate: "2026-11-03" });
    invoice({ status: "REJECTED", approvedAt: null, rejectedAt: new Date(), rejectReason: "No", issueDate: "2026-11-02" });

    const waiting = await list({ statuses: ["NEEDS_APPROVAL"] });
    expect(waiting.invoices.map((i) => [i.id, i.status, i.blockReasons])).toEqual([[wasBlocked.id, "NEEDS_APPROVAL", []]]);
    expect(waiting.total).toBe(1);

    expect((await list({ statuses: ["BLOCKED"] })).invoices).toEqual([]);
    expect((await list({ statuses: ["BLOCKED"] })).total).toBe(0);

    const mixed = await list({ statuses: ["APPROVED", "DRAFT"] });
    expect(mixed.invoices.map((i) => i.id)).toEqual([draft.id, approved.id]);
    expect(mixed.total).toBe(2);
  });

  it("filters closed statuses on the stored one directly, without reading the open invoices first", async () => {
    const approved = invoice();
    invoice({ status: "NEEDS_APPROVAL", approvedAt: null });
    const { invoices, total } = await list({ statuses: ["APPROVED", "REJECTED", "APPROVED"] });
    expect(invoices.map((i) => i.id)).toEqual([approved.id]);
    expect(total).toBe(1);
    expect(vi.mocked(haulierInvoiceRepository.page)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(haulierInvoiceRepository.page)).toHaveBeenCalledWith("c1", { statuses: ["APPROVED", "REJECTED"] }, 1000, 0);
  });

  it("pages newest issued first then by id, with the total and whether more are left", async () => {
    const rows = ["2026-11-01", "2026-11-03", "2026-11-03", "2026-10-15", "2026-11-02"].map((issueDate) => invoice({ issueDate }));
    const order = [rows[2]!, rows[1]!, rows[4]!, rows[0]!, rows[3]!].map((r) => r.id);

    const first = await list({ limit: 2 });
    expect(first.invoices.map((i) => i.id)).toEqual(order.slice(0, 2));
    expect(first).toMatchObject({ total: 5, truncated: true });

    const middle = await list({ limit: 2, offset: 2 });
    expect(middle.invoices.map((i) => i.id)).toEqual(order.slice(2, 4));
    expect(middle).toMatchObject({ total: 5, truncated: true });

    const last = await list({ limit: 2, offset: 4 });
    expect(last.invoices.map((i) => i.id)).toEqual(order.slice(4));
    expect(last).toMatchObject({ total: 5, truncated: false });

    expect(await list({ offset: 10 })).toEqual({ invoices: [], total: 5, truncated: false });
  });

  it("refuses an unknown status, a limit outside 1 to 1000 and a negative or broken offset", async () => {
    for (const req of [{ statuses: ["PAID"] }, { limit: 0 }, { limit: 1001 }, { limit: 1.5 }, { offset: -1 }, { offset: 0.5 }]) {
      await expect(list(req)).rejects.toMatchObject({ code: "invalid_argument" });
    }
    await expect(haulierInvoiceService.factsOf("c1", { statuses: "APPROVED" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(vi.mocked(haulierInvoiceRepository.page)).not.toHaveBeenCalled();
  });
});
