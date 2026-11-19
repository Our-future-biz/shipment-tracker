import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Finance → Accounts Receivable (Council Outlay 10) run for real - the list with its carry-over, a payment and its
// take-back, the chasing notes, send again, the release check, the bell and the customers service's questions -
// against stand-ins for its repository, the outbox, the other services (customers, shipments) and the users.
const repo = vi.hoisted(() => ({
  ensureRows: vi.fn(),
  figures: vi.fn(),
  figuresOne: vi.fn(),
  creditNotesOf: vi.fn(),
  linesOf: vi.fn(),
  failedFollowups: vi.fn(),
  notCarriedChecked: vi.fn(),
  carryOver: vi.fn(),
  markCarriedChecked: vi.fn(),
  byInvoice: vi.fn(),
  decide: vi.fn(),
  chase: vi.fn(),
  refreshPaid: vi.fn(),
  insertPayment: vi.fn(),
  takeBack: vi.fn(),
  paymentById: vi.fn(),
  paymentByKey: vi.fn(),
  paymentsOf: vi.fn(),
  paidSince: vi.fn(),
  addNote: vi.fn(),
  notes: vi.fn(),
  events: vi.fn(),
  overdueCountByCustomer: vi.fn(),
  owedCountOfCustomer: vi.fn(),
  issuedNumbers: vi.fn(),
  seenKeys: vi.fn(),
  markSeen: vi.fn(),
  addEvent: vi.fn(),
  underWriteLocks: vi.fn(),
  bumpVersion: vi.fn(),
  paymentsByKeys: vi.fn(),
  confirmLine: vi.fn(),
  waitingLines: vi.fn(),
  asAtCandidates: vi.fn(),
  settingsOf: vi.fn(),
  saveSettings: vi.fn(),
  closeSettledDisputes: vi.fn(),
  reopenAutoClosedDisputes: vi.fn(),
}));
vi.mock("../../repositories/receivable.repository", () => ({ receivableRepository: repo }));
// The open bank entries (the "payment waiting" check, X5) and the invoice profile (the reminder's issuer, m3).
const bank = vi.hoisted(() => ({ openIncoming: vi.fn() }));
vi.mock("../../repositories/bankStatement.repository", () => ({ bankStatementRepository: bank }));
const profiles = vi.hoisted(() => ({ getByCompany: vi.fn() }));
vi.mock("../../repositories/invoiceProfile.repository", () => ({ invoiceProfileRepository: profiles }));
const outbox = vi.hoisted(() => ({ enqueue: vi.fn() }));
vi.mock("../../repositories/invoiceFollowupOutbox.repository", () => ({ invoiceFollowupOutboxRepository: outbox }));
const followups = vi.hoisted(() => ({
  deliverInvoiceFollowups: vi.fn(),
  followupsOfReceivable: vi.fn((invoice: { id: string }, actor: { userId: string }) => [{ kind: "receivable_state", payload: { invoiceId: invoice.id }, actingUserId: actor.userId }]),
}));
vi.mock("../../services/invoiceFollowups.service", () => followups);
const invoices = vi.hoisted(() => ({ listOpenInvoicesWithSources: vi.fn() }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: invoices }));
const selling = vi.hoisted(() => ({ listLiveByShipments: vi.fn() }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: selling }));
const mail = vi.hoisted(() => ({ emailConfigured: vi.fn() }));
vi.mock("../../../../lib/email", () => mail);
const clients = vi.hoisted(() => ({ receivableFacts: vi.fn(), invoiceStatuses: vi.fn(), shipmentBasics: vi.fn(), openJobIds: vi.fn() }));
vi.mock("~encore/clients", () => ({
  customers: { _internalCustomerReceivableFacts: clients.receivableFacts, _internalCustomerInvoiceStatuses: clients.invoiceStatuses },
  shipments: { _internalShipmentBasics: clients.shipmentBasics, _internalCustomerOpenJobIds: clients.openJobIds },
}));
const users = vi.hoisted(() => ({ userEmailOf: vi.fn(), companyUsersWithRoles: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => users);
const names = vi.hoisted(() => ({ userRefs: vi.fn() }));
vi.mock("../../../../lib/userNames", () => names);
const again = vi.hoisted(() => ({ sendFailedAgain: vi.fn() }));
vi.mock("../../../../lib/outbox/sendAgain", () => again);
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import log from "encore.dev/log";
import { receivableService as service } from "../../services/receivable.service";
import { DISPUTE_REOPENED_REASON } from "../../lib/receivables";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const INV_B = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b";
const INV_C = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6c";
const CN = "6e1d8b2f-4c3a-4f7e-8b9d-2a3b4c5d6e7f";
const PAYMENT = "7f2e9c3a-5d4b-4a8f-9cae-3b4c5d6e7f80";
const CUSTOMER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";
const OTHER_CUSTOMER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a70";
const SHIP = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const TX = { tx: true };

const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const clerk = { userID: "u-clerk", companyID: COMPANY, role: "user" };

const invoice = (over: Record<string, unknown> = {}) => ({
  id: INV,
  createdAt: new Date("2026-11-02T09:00:00Z"),
  updatedAt: new Date("2026-11-02T09:00:00Z"),
  deletedAt: null,
  companyId: COMPANY,
  shipmentId: SHIP,
  kind: "invoice",
  status: "issued",
  number: "INV2026CZ00000031-001",
  correctsInvoiceId: null,
  creditReason: "",
  customerId: CUSTOMER,
  issueDate: "2026-11-02",
  duzp: "2026-11-01",
  dueDate: "2026-11-30",
  currency: "CZK",
  net: "1000.00",
  vat: "210.00",
  gross: "1210.00",
  netCzk: "1000.00",
  vatCzk: "210.00",
  grossCzk: "1210.00",
  customer: { customerId: CUSTOMER, companyName: "Gama Elektro a.s.", paymentTerms: "14 days" },
  shipment: { jobNumber: "CZ00000031", jobYear: 2026 },
  issuedBy: "u-libor",
  ...over,
});

const receivable = (over: Record<string, unknown> = {}) => ({
  id: "rec-1",
  companyId: COMPANY,
  invoiceId: INV,
  paidTotal: "0",
  lastPaidOn: null,
  promisedOn: null,
  disputed: false,
  disputedReason: "",
  reminderLevel: 0,
  lastRemindedOn: null,
  carriedChecked: true,
  version: 3,
  ...over,
});

type Figures = {
  invoice: ReturnType<typeof invoice>;
  credited: number;
  paid: number;
  writtenOff: number;
  bankCharges: number;
  waiting: number;
  lastPaidOn: string | null;
  receivable: ReturnType<typeof receivable> | null;
};
const figures = (
  over: {
    invoice?: Record<string, unknown>;
    receivable?: Record<string, unknown> | null;
    credited?: number;
    paid?: number;
    writtenOff?: number;
    bankCharges?: number;
    waiting?: number;
    lastPaidOn?: string | null;
  } = {},
): Figures => {
  const inv = invoice(over.invoice);
  return {
    invoice: inv,
    credited: over.credited ?? 0,
    paid: over.paid ?? 0,
    writtenOff: over.writtenOff ?? 0,
    bankCharges: over.bankCharges ?? 0,
    waiting: over.waiting ?? 0,
    lastPaidOn: over.lastPaidOn ?? null,
    receivable: over.receivable === null ? null : receivable({ invoiceId: inv.id, ...(over.receivable ?? {}) }),
  };
};

const facts = (over: Record<string, unknown> = {}) => ({
  id: CUSTOMER,
  companyName: "Gama Elektro a.s.",
  salesOwner: "petr@test.cz",
  salesOwnerUserId: "u-petr",
  paymentTerms: "14 days",
  creditLimit: 200000,
  currency: "CZK",
  reminderTo: { name: "Účtárna", email: "ucetni@gama.cz", role: "Accounts payable" },
  deleted: false,
  ...over,
});

/** An incoming bank entry no manager has decided yet, whose variable symbol is the job's (31). */
const bankEntry = (over: Record<string, unknown> = {}) => ({
  id: "e-1",
  statementId: "st-1",
  fileName: "vypis-2026-11-17.xml",
  bookingDate: "2026-11-17",
  credit: true,
  amount: "1210.00",
  currency: "CZK",
  variableSymbol: "31",
  endToEndId: "",
  message: "",
  status: "proposed",
  ...over,
});

const lastDecision = () => {
  const call = repo.decide.mock.calls.at(-1)!;
  return { current: call[1], values: call[2], event: call[3], options: call[5] };
};
/** The event as the repository writes it: what the step under the lock returned merged in. */
let lastWorkResult: { toStatus?: string; payload?: Record<string, unknown> } | undefined;
const writtenEvent = () => {
  const event = lastDecision().event as { payload?: Record<string, unknown> };
  return { ...event, ...(lastWorkResult ?? {}), payload: { ...(event.payload ?? {}), ...(lastWorkResult?.payload ?? {}) } };
};
const lastChase = () => {
  const call = repo.chase.mock.calls.at(-1)!;
  return { invoiceId: call[1], values: call[2], event: call[3] };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-18T10:00:00Z"));
  repo.ensureRows.mockResolvedValue(undefined);
  repo.notCarriedChecked.mockResolvedValue([]);
  repo.carryOver.mockResolvedValue([]);
  repo.figures.mockResolvedValue([figures()]);
  repo.figuresOne.mockResolvedValue(figures());
  repo.creditNotesOf.mockResolvedValue([]);
  repo.linesOf.mockResolvedValue([]);
  repo.failedFollowups.mockResolvedValue([]);
  repo.paymentsOf.mockResolvedValue([]);
  repo.notes.mockResolvedValue([]);
  repo.events.mockResolvedValue([]);
  repo.paymentByKey.mockResolvedValue(null);
  repo.paidSince.mockResolvedValue([]);
  repo.seenKeys.mockResolvedValue(new Set());
  repo.overdueCountByCustomer.mockResolvedValue(new Map());
  repo.insertPayment.mockImplementation(async (_tx: unknown, values: Record<string, unknown>) => ({ id: PAYMENT, ...values }));
  repo.addNote.mockImplementation(async (_tx: unknown, values: Record<string, unknown>) => ({ id: "note-1", ...values }));
  lastWorkResult = undefined;
  repo.decide.mockImplementation(async (_company: string, current: { version: number }, values: Record<string, unknown>, _event: unknown, work?: (tx: unknown) => Promise<unknown>) => {
    if (work) lastWorkResult = (await work(TX)) as typeof lastWorkResult;
    return { ...current, ...values, version: current.version + 1 };
  });
  repo.chase.mockImplementation(async (_company: string, invoiceId: string, values: Record<string, unknown>, event: Record<string, unknown>, work?: (tx: unknown) => Promise<unknown>) => {
    const more = work ? await work(TX) : undefined;
    return { invoiceId, ...values, event: { ...event, ...(more ?? {}) }, version: 3 };
  });
  clients.receivableFacts.mockImplementation(async ({ ids }: { ids: string[] }) => ({ customers: ids.includes(CUSTOMER) ? [facts()] : [] }));
  clients.shipmentBasics.mockImplementation(async ({ ids }: { ids: string[] }) => ({
    shipments: ids.includes(SHIP) ? [{ id: SHIP, jobNumber: "CZ00000031", personInCharge: "jana@test.cz", holidayCover: "" }] : [],
  }));
  clients.invoiceStatuses.mockResolvedValue({ items: [] });
  users.userEmailOf.mockImplementation(async (id: string) => `${id}@test.cz`);
  names.userRefs.mockResolvedValue(new Map([["u-libor", { name: "Libor", email: "libor@test.cz", role: "user" }]]));
  again.sendFailedAgain.mockImplementation(async (_repo: unknown, _company: string, rows: { id: string; invoiceId: string; kind: string }[]) => rows);
  repo.underWriteLocks.mockImplementation(async (_company: string, _invoices: unknown, work: (tx: unknown) => Promise<unknown>, outer?: unknown) => work(outer ?? TX));
  repo.bumpVersion.mockResolvedValue(true);
  repo.paymentsByKeys.mockResolvedValue([]);
  repo.waitingLines.mockResolvedValue([]);
  repo.asAtCandidates.mockResolvedValue([]);
  repo.settingsOf.mockResolvedValue({ autoReminders: false, reminder1Days: 7, reminder2Days: 21, replyTo: "", autoRemindersSince: null, updatedBy: "", updatedAt: null });
  repo.closeSettledDisputes.mockResolvedValue([]);
  repo.reopenAutoClosedDisputes.mockResolvedValue([]);
  bank.openIncoming.mockResolvedValue([]);
  profiles.getByCompany.mockResolvedValue(null);
  // The job's selling, all invoiced unless a test says otherwise (the prepayment stop before any invoice, L3).
  selling.listLiveByShipments.mockResolvedValue([]);
  invoices.listOpenInvoicesWithSources.mockResolvedValue([]);
  users.companyUsersWithRoles.mockResolvedValue([
    { id: "u-boss", email: "boss@test.cz", displayName: "Boss", role: "manager" },
    { id: "u-eva", email: "eva@test.cz", displayName: "Eva", role: "admin" },
    { id: "u-clerk", email: "clerk@test.cz", displayName: "Clerk", role: "user" },
  ]);
  mail.emailConfigured.mockReturnValue(false);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the list", () => {
  it("answers the rows with their figures, facts and owners", async () => {
    repo.figures.mockResolvedValue([figures({ credited: 210, paid: 500, lastPaidOn: "2026-11-14", invoice: { dueDate: "2026-11-16" } })]);
    repo.creditNotesOf.mockResolvedValue([invoice({ id: CN, kind: "credit_note", number: "CN2026CZ00000031-001", correctsInvoiceId: INV, gross: "-210.00" })]);
    const answer = await service.list(manager);
    expect(repo.ensureRows).toHaveBeenCalledWith(COMPANY, { all: true });
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { openOrSince: "2026-08-20" }, 2001);
    expect(answer.rows).toEqual([
      expect.objectContaining({
        id: INV,
        customer: "Gama Elektro a.s.",
        jobNumber: "CZ00000031",
        gross: 1210,
        credited: 210,
        paid: 500,
        leftToPay: 500,
        status: "part_paid",
        marks: ["overdue", "part_credited"],
        daysOverdue: 2,
        agingBucket: "1-30",
        lastPaidOn: "2026-11-14",
        creditNoteNumbers: ["CN2026CZ00000031-001"],
        creditNotes: [{ number: "CN2026CZ00000031-001", issueDate: "2026-11-02", gross: -210, issuedBy: "libor@test.cz", issuedByName: "Libor" }],
        personInCharge: "jana@test.cz",
        salesOwner: "petr@test.cz",
        issuedBy: "libor@test.cz",
        mine: false,
        myCustomer: false,
        version: 3,
      }),
    ]);
    expect(answer).toMatchObject({ period: "90d", truncated: false, canAct: true, factsRead: true, today: "2026-11-18", dueThisWeek: 0, over60: 0, customersOwing: 1 });
    expect(answer.counts).toEqual({ unpaid: 1, overdue: 1, paid: 0, writtenOff: 0, creditedCancelled: 0, all: 1, promised: 0, disputed: 0, byCustomer: 1 });
    // The invoices' and the credit notes' issuers in one lookup.
    expect(names.userRefs).toHaveBeenCalledTimes(1);
    expect(answer.totals).toEqual({ toCollect: [{ currency: "CZK", amount: 500 }], overdue: [{ currency: "CZK", amount: 500 }] });
    expect(answer.byCustomer).toEqual([
      expect.objectContaining({ customerId: CUSTOMER, currency: "CZK", unpaid: 500, d1to30: 500, invoices: 1, salesOwner: "petr@test.cz", creditLimit: 200000, creditCurrency: "CZK" }),
    ]);
  });

  it("counts per currency, never one total, and tells mine and my customer", async () => {
    repo.figures.mockResolvedValue([
      figures({ invoice: { dueDate: "2026-08-01" } }),
      figures({ invoice: { id: INV_B, currency: "EUR", gross: "100.00", dueDate: "2026-11-20" } }),
      figures({ invoice: { id: INV_C, status: "credited" }, credited: 1210, paid: 0 }),
    ]);
    users.userEmailOf.mockResolvedValue("jana@test.cz");
    const answer = await service.list({ ...clerk, userID: "u-petr" });
    expect(answer.canAct).toBe(false);
    expect(answer.rows.map((r) => [r.status, r.mine, r.myCustomer])).toEqual([
      ["unpaid", true, true],
      ["unpaid", true, true],
      ["credited", true, true],
    ]);
    expect(answer.totals.toCollect).toEqual([
      { currency: "CZK", amount: 1210 },
      { currency: "EUR", amount: 100 },
    ]);
    expect(answer).toMatchObject({ dueThisWeek: 1, over60: 1 });
    expect(answer.counts).toMatchObject({ unpaid: 2, overdue: 1, creditedCancelled: 1, all: 3, byCustomer: 2 });
  });

  it("says when there are more than 2000 rows, and shows 2000", async () => {
    repo.figures.mockResolvedValue(Array.from({ length: 2001 }, () => figures()));
    const answer = await service.list(manager, "all");
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { openOrSince: null }, 2001);
    expect(answer).toMatchObject({ truncated: true, period: "all" });
    expect(answer.rows).toHaveLength(2000);
  });

  it("reads 12 months, and refuses a period it does not know", async () => {
    await service.list(manager, "12m");
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { openOrSince: "2025-11-18" }, 2001);
    await expect(service.list(manager, "7d")).rejects.toMatchObject({ code: "invalid_argument" });
  });

  it("still answers with blanks when the job and customer facts cannot be read", async () => {
    clients.receivableFacts.mockRejectedValue(new Error("customers down"));
    const answer = await service.list(manager);
    expect(answer.factsRead).toBe(false);
    expect(answer.rows[0]).toMatchObject({ customer: "Gama Elektro a.s.", salesOwner: "", jobNumber: "CZ00000031", personInCharge: "jana@test.cz" });
    expect(answer.byCustomer[0]).toMatchObject({ salesOwner: "", creditLimit: 0, creditCurrency: "" });
    expect(log.warn).toHaveBeenCalled();

    clients.receivableFacts.mockResolvedValue({ customers: [facts()] });
    clients.shipmentBasics.mockRejectedValue(new Error("shipments down"));
    const second = await service.list(manager);
    expect(second.factsRead).toBe(false);
    // The job number printed on the invoice still shows.
    expect(second.rows[0]).toMatchObject({ jobNumber: "CZ00000031", personInCharge: "", salesOwner: "petr@test.cz" });
  });

  it("marks an invoice whose hand-over to the customer's list failed", async () => {
    repo.failedFollowups.mockResolvedValue([{ id: "o1", invoiceId: INV, kind: "customer_invoice", actingUserId: "u-libor" }]);
    const answer = await service.list(manager);
    expect(repo.failedFollowups).toHaveBeenCalledWith(COMPANY, [INV], ["customer_invoice"]);
    expect(answer.rows[0]!.marks).toContain("not_in_customer_list");
  });
});

describe("carrying the customer's list's Paid over (D15)", () => {
  it("asks about issued invoices once, marks the others checked, and carries over those it says are paid", async () => {
    repo.notCarriedChecked.mockResolvedValueOnce([
      { invoiceId: INV, number: "INV-1", customerId: CUSTOMER, status: "issued", shipmentId: SHIP },
      { invoiceId: INV_B, number: "INV-2", customerId: CUSTOMER, status: "issued", shipmentId: SHIP },
      { invoiceId: INV_C, number: "INV-3", customerId: CUSTOMER, status: "credited", shipmentId: SHIP },
    ]);
    clients.invoiceStatuses.mockResolvedValue({
      items: [
        { invoiceId: INV, status: "Paid", paidOn: null },
        { invoiceId: INV_B, status: "Open", paidOn: null },
        // Not asked about: left alone.
        { invoiceId: CN, status: "Paid", paidOn: null },
      ],
    });
    await service.list(manager);
    expect(repo.markCarriedChecked).toHaveBeenCalledWith(COMPANY, [INV_C]);
    expect(clients.invoiceStatuses).toHaveBeenCalledWith(
      {
        items: [
          { invoiceId: INV, number: "INV-1", customerId: CUSTOMER },
          { invoiceId: INV_B, number: "INV-2", customerId: CUSTOMER },
        ],
      },
      { authData: { userID: "", companyID: COMPANY, role: "user" } },
    );
    expect(repo.carryOver).toHaveBeenCalledWith(
      COMPANY,
      [
        { invoiceId: INV, paid: true },
        { invoiceId: INV_B, paid: false },
      ],
      expect.any(Function),
    );
    // The follow-up it writes is the invoice's receivable_state, as the user who opened the list.
    const rowsFor = repo.carryOver.mock.calls[0]![2] as (i: { id: string }) => unknown[];
    expect(rowsFor({ id: INV })).toEqual([{ kind: "receivable_state", payload: { invoiceId: INV }, actingUserId: "u-boss" }]);

    // The next open finds nothing left to check: nobody is asked again.
    clients.invoiceStatuses.mockClear();
    await service.list(manager);
    expect(clients.invoiceStatuses).not.toHaveBeenCalled();
  });

  it("asks about one chunk of 500 per open at most, so a read never holds the company's writes up for long", async () => {
    repo.notCarriedChecked.mockResolvedValueOnce(
      Array.from({ length: 500 }, (_, i) => ({ invoiceId: `5d0c7a1e-3b2f-4e6d-9a8c-${String(i).padStart(12, "0")}`, number: `N${i}`, customerId: CUSTOMER, status: "issued", shipmentId: SHIP })),
    );
    await service.list(manager);
    expect(repo.notCarriedChecked).toHaveBeenCalledWith(COMPANY, { all: true }, 500);
    expect(clients.invoiceStatuses.mock.calls.map((c) => (c[0] as { items: unknown[] }).items.length)).toEqual([500]);
  });

  it("leaves invoices unchecked when the customer's list can't be asked, and the list still answers", async () => {
    repo.notCarriedChecked.mockResolvedValueOnce([{ invoiceId: INV, number: "INV-1", customerId: CUSTOMER, status: "issued", shipmentId: SHIP }]);
    clients.invoiceStatuses.mockRejectedValue(new Error("customers down"));
    const answer = await service.list(manager);
    expect(repo.carryOver).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
    expect(answer.rows).toHaveLength(1);
  });

  it("still lists when the rows can't be made", async () => {
    repo.ensureRows.mockRejectedValue(new Error("db hiccup"));
    const answer = await service.list(manager);
    expect(log.error).toHaveBeenCalled();
    expect(answer.rows).toHaveLength(1);
  });
});

describe("noting a payment (D11, D12)", () => {
  const pay = { version: 3, paidOn: "2026-11-14", amount: 100 };

  it("is for managers only", async () => {
    await expect(service.notePayment(clerk, INV, pay)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.figuresOne).not.toHaveBeenCalled();
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("notes it under the version read, with its follow-up in the same transaction, then sends it", async () => {
    const answer = await service.notePayment(manager, INV, { ...pay, note: " bank 14.11. ", idempotencyKey: " k-1 " });
    expect(lastDecision().current).toMatchObject({ invoiceId: INV, version: 3 });
    expect(lastDecision().event).toMatchObject({ action: "payment_noted", fromStatus: "unpaid", byUserId: "u-boss", by: "u-boss@test.cz", payload: { paidOn: "2026-11-14", amount: 100 } });
    expect(repo.insertPayment).toHaveBeenCalledWith(TX, {
      companyId: COMPANY,
      invoiceId: INV,
      kind: "payment",
      paidOn: "2026-11-14",
      amount: "100.00",
      note: "bank 14.11.",
      byUserId: "u-boss",
      by: "u-boss@test.cz",
      idempotencyKey: "k-1",
    });
    expect(repo.refreshPaid).toHaveBeenCalledWith(TX, COMPANY, INV);
    expect(outbox.enqueue).toHaveBeenCalledWith(TX, [{ kind: "receivable_state", payload: { invoiceId: INV }, actingUserId: "u-boss" }]);
    expect(followups.deliverInvoiceFollowups).toHaveBeenCalledWith(INV);
    expect(answer.row.id).toBe(INV);
    expect(answer.canAct).toBe(true);
    // Under the invoice's credit lock too (a credit note or cancellation being issued is waited for).
    expect(lastDecision().options).toEqual({ creditsOf: expect.objectContaining({ id: INV, companyId: COMPANY, shipment: { jobNumber: "CZ00000031", jobYear: 2026 } }) });
  });

  it("refuses more than is left to pay", async () => {
    repo.figuresOne.mockResolvedValue(figures({ credited: 210, paid: 500 }));
    await expect(service.notePayment(manager, INV, { ...pay, amount: 500.01 })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "More than is left to pay (500.00 CZK)",
    });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("checks again under the lock: a credit note issued meanwhile counts", async () => {
    repo.figuresOne.mockResolvedValueOnce(figures()).mockResolvedValue(figures({ credited: 1200 }));
    await expect(service.notePayment(manager, INV, pay)).rejects.toMatchObject({ code: "failed_precondition", message: "More than is left to pay (10.00 CZK)" });
    expect(repo.insertPayment).not.toHaveBeenCalled();
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("answers aborted when the version is not the one read, or changes meanwhile", async () => {
    await expect(service.notePayment(manager, INV, { ...pay, version: 2 })).rejects.toMatchObject({ code: "aborted" });
    expect(repo.decide).not.toHaveBeenCalled();
    repo.decide.mockResolvedValueOnce(null);
    await expect(service.notePayment(manager, INV, pay)).rejects.toMatchObject({ code: "aborted" });
    expect(followups.deliverInvoiceFollowups).not.toHaveBeenCalled();
  });

  it("refuses a day that is not one, after today or before the invoice; an amount of 0; a credited invoice", async () => {
    await expect(service.notePayment(manager, INV, { ...pay, paidOn: "14.11.2026" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.notePayment(manager, INV, { ...pay, amount: 0 })).rejects.toMatchObject({ code: "invalid_argument", message: "The amount must be above 0" });
    await expect(service.notePayment(manager, INV, { ...pay, paidOn: "2026-11-19" })).rejects.toMatchObject({ code: "failed_precondition", message: "The day it was paid cannot be after today" });
    await expect(service.notePayment(manager, INV, { ...pay, paidOn: "2026-11-01" })).rejects.toMatchObject({ code: "failed_precondition", message: /before the invoice was issued/ });
    repo.figuresOne.mockResolvedValue(figures({ invoice: { status: "credited" }, credited: 1210 }));
    await expect(service.notePayment(manager, INV, pay)).rejects.toMatchObject({ code: "failed_precondition", message: /credited/ });
  });

  it("gives back the payment a request with the same key noted, without writing again", async () => {
    repo.paymentByKey.mockResolvedValue({ id: PAYMENT, invoiceId: INV });
    const answer = await service.notePayment(manager, INV, { ...pay, idempotencyKey: "k-1" });
    expect(answer.row.id).toBe(INV);
    expect(repo.decide).not.toHaveBeenCalled();
    repo.paymentByKey.mockResolvedValue({ id: PAYMENT, invoiceId: INV_B });
    await expect(service.notePayment(manager, INV, { ...pay, idempotencyKey: "k-1" })).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("answers the first payment when a double click got there first (the key taken under the lock)", async () => {
    repo.insertPayment.mockResolvedValueOnce(null);
    repo.paymentByKey.mockResolvedValueOnce(null).mockResolvedValue({ id: PAYMENT, invoiceId: INV });
    const answer = await service.notePayment(manager, INV, { ...pay, idempotencyKey: "k-1" });
    expect(answer.row.id).toBe(INV);
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("waits while the customer's list could not be asked whether the invoice was paid before", async () => {
    repo.figuresOne.mockResolvedValue(figures({ receivable: { carriedChecked: false } }));
    await expect(service.notePayment(manager, INV, pay)).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("refuses an invoice that is not there", async () => {
    await expect(service.notePayment(manager, "nope", pay)).rejects.toMatchObject({ code: "not_found" });
    repo.figuresOne.mockResolvedValue(null);
    await expect(service.notePayment(manager, INV, pay)).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("taking a payment back", () => {
  const payment = (over: Record<string, unknown> = {}) => ({ id: PAYMENT, invoiceId: INV, kind: "payment", paidOn: "2026-11-14", amount: "100.00", takenBackAt: null, ...over });

  it("is for managers, with a reason", async () => {
    await expect(service.takeBackPayment(clerk, INV, PAYMENT, { version: 3, reason: "noted twice" })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.takeBackPayment(manager, INV, PAYMENT, { version: 3, reason: "no" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("takes a live payment back, and the customer's list follows", async () => {
    repo.paymentById.mockResolvedValue(payment());
    repo.takeBack.mockResolvedValue(payment({ takenBackAt: new Date() }));
    repo.figuresOne.mockResolvedValue(figures({ paid: 100 }));
    await service.takeBackPayment(manager, INV, PAYMENT, { version: 3, reason: " noted twice " });
    expect(repo.takeBack).toHaveBeenCalledWith(TX, COMPANY, INV, PAYMENT, { userId: "u-boss", email: "u-boss@test.cz", reason: "noted twice" });
    expect(lastDecision().event).toMatchObject({ action: "payment_taken_back", reason: "noted twice", payload: { paymentId: PAYMENT, amount: 100, paidOn: "2026-11-14", kind: "payment" } });
    expect(repo.refreshPaid).toHaveBeenCalledWith(TX, COMPANY, INV);
    expect(outbox.enqueue).toHaveBeenCalledWith(TX, expect.any(Array));
    expect(followups.deliverInvoiceFollowups).toHaveBeenCalledWith(INV);
  });

  it("refuses one taken back already, one not there, and a version not the one read", async () => {
    repo.paymentById.mockResolvedValue(payment({ takenBackAt: new Date() }));
    await expect(service.takeBackPayment(manager, INV, PAYMENT, { version: 3, reason: "noted twice" })).rejects.toMatchObject({ code: "failed_precondition", message: "This payment was taken back already" });
    repo.paymentById.mockResolvedValue(null);
    await expect(service.takeBackPayment(manager, INV, PAYMENT, { version: 3, reason: "noted twice" })).rejects.toMatchObject({ code: "not_found" });
    await expect(service.takeBackPayment(manager, INV, PAYMENT, { version: 1, reason: "noted twice" })).rejects.toMatchObject({ code: "aborted" });
    // Taken back by another manager between the read and the write.
    repo.paymentById.mockResolvedValue(payment());
    repo.takeBack.mockResolvedValue(null);
    await expect(service.takeBackPayment(manager, INV, PAYMENT, { version: 3, reason: "noted twice" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });
});

describe("chase notes (D16, D17)", () => {
  it("lets anyone record a reminder of level 1 or 2, and only a manager the final notice", async () => {
    await service.addNote(clerk, INV, { kind: "reminder", text: "", reminderLevel: 2, recipient: "ucetni@gama.cz" });
    expect(lastChase().values).toEqual({ reminderLevel: 2, lastRemindedOn: "2026-11-18" });
    expect(lastChase().event).toMatchObject({ action: "reminded", payload: { level: 2, recipient: "ucetni@gama.cz" } });
    expect(repo.addNote).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "reminder", reminderLevel: 2, recipient: "ucetni@gama.cz", byUserId: "u-clerk" }));

    repo.chase.mockClear();
    await expect(service.addNote(clerk, INV, { kind: "reminder", text: "", reminderLevel: 3, recipient: "ucetni@gama.cz" })).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.chase).not.toHaveBeenCalled();
    await service.addNote(manager, INV, { kind: "reminder", text: "", reminderLevel: 3, recipient: "ucetni@gama.cz" });
    expect(lastChase().values).toMatchObject({ reminderLevel: 3 });
  });

  it("sets the promised day and the dispute", async () => {
    await service.addNote(clerk, INV, { kind: "promise", text: "pays the rest by 25.11.", promisedOn: "2026-11-25" });
    expect(lastChase().values).toEqual({ promisedOn: "2026-11-25" });
    await service.addNote(clerk, INV, { kind: "dispute", text: "wrong rate" });
    expect(lastChase().values).toEqual({ disputed: true, disputedReason: "wrong rate" });
    expect(lastChase().event).toMatchObject({ action: "disputed", reason: "wrong rate" });
    repo.figuresOne.mockResolvedValue(figures({ receivable: { disputed: true } }));
    await service.addNote(clerk, INV, { kind: "dispute_closed", text: "credit note agreed" });
    expect(lastChase().values).toEqual({ disputed: false, disputedReason: "" });
  });

  it("does not move the version, so a payment dialog open meanwhile stays good, and never asks for one", async () => {
    for (const note of [
      { kind: "note", text: "Called them" },
      { kind: "promise", text: "", promisedOn: "2026-11-25" },
      { kind: "dispute", text: "wrong rate" },
      { kind: "reminder", text: "", reminderLevel: 1, recipient: "ucetni@gama.cz" },
    ]) {
      await service.addNote(clerk, INV, note);
    }
    expect(repo.chase).toHaveBeenCalledTimes(4);
    expect(repo.decide).not.toHaveBeenCalled();
    // Each one is written with its event (the note's id added to it).
    expect(lastChase().event).toMatchObject({ action: "reminded", byUserId: "u-clerk", by: "u-clerk@test.cz" });
    expect(repo.chase.mock.calls.map((c) => c[1])).toEqual([INV, INV, INV, INV]);
  });

  it("checks the note again under the lock: a dispute or a payment noted meanwhile counts, and nothing is written", async () => {
    // Read before the lock: owed and not disputed. Under the lock: disputed by someone else meanwhile.
    repo.figuresOne.mockResolvedValueOnce(figures()).mockResolvedValue(figures({ receivable: { disputed: true } }));
    await expect(service.addNote(clerk, INV, { kind: "dispute", text: "wrong rate" })).rejects.toMatchObject({ code: "failed_precondition", message: "This invoice is disputed already" });
    expect(repo.addNote).not.toHaveBeenCalled();
    repo.figuresOne.mockReset();
    repo.figuresOne.mockResolvedValueOnce(figures()).mockResolvedValue(figures({ paid: 1210 }));
    await expect(service.addNote(clerk, INV, { kind: "reminder", text: "", reminderLevel: 1, recipient: "a@b.cz" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.addNote).not.toHaveBeenCalled();
  });

  it("refuses what the rules refuse, as the right kind of error", async () => {
    await expect(service.addNote(clerk, INV, { kind: "note", text: " " })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.addNote(clerk, INV, { kind: "promise", text: "", promisedOn: "2026-11-01" })).rejects.toMatchObject({ code: "invalid_argument" });
    repo.figuresOne.mockResolvedValue(figures({ paid: 1210 }));
    await expect(service.addNote(clerk, INV, { kind: "reminder", text: "", reminderLevel: 1, recipient: "a@b.cz" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.chase).not.toHaveBeenCalled();
  });

  it("answers not found when the invoice has no receivable to write", async () => {
    repo.chase.mockResolvedValue(null);
    await expect(service.addNote(clerk, INV, { kind: "note", text: "Called them" })).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("the detail", () => {
  it("shows the lines, the credit notes (the full one last), the payments, the chasing and the customer's facts", async () => {
    repo.figuresOne.mockResolvedValue(figures({ invoice: { status: "credited" }, credited: 1210, paid: 300 }));
    repo.creditNotesOf.mockResolvedValue([
      invoice({ id: "cn-1", kind: "credit_note", number: "CN-1", correctsInvoiceId: INV, gross: "-210.00", creditReason: "rate corrected" }),
      invoice({ id: "cn-2", kind: "credit_note", number: "CN-2", correctsInvoiceId: INV, gross: "-1000.00", creditReason: "cancelled", issuedBy: "u-eva" }),
    ]);
    names.userRefs.mockResolvedValue(
      new Map([
        ["u-libor", { name: "Libor", email: "libor@test.cz", role: "user" }],
        ["u-eva", { name: "Eva Nová", email: "eva@test.cz", role: "manager" }],
      ]),
    );
    // Priced in EUR, billed in CZK: the line's figures are in the invoice's currency.
    repo.linesOf.mockResolvedValue([{ description: "Ocean freight", qty: "1.00", unitPrice: "40.00", unitCurrency: "EUR", net: "1000.00", vatRate: "21.00" }]);
    repo.paymentsOf.mockResolvedValue([
      { id: PAYMENT, kind: "payment", paidOn: "2026-11-14", amount: "300.00", note: "", by: "boss@test.cz", createdAt: new Date("2026-11-15T09:00:00Z"), takenBackAt: null, takenBackBy: "", takenBackReason: "" },
    ]);
    repo.figures.mockResolvedValue([figures({ invoice: { dueDate: "2026-11-10" } }), figures({ invoice: { id: INV_B, currency: "EUR", gross: "50.00" } })]);
    const answer = await service.detail(clerk, INV);
    expect(answer.row).toMatchObject({ status: "credited", leftToPay: -300, marks: ["to_refund"] });
    expect(answer.lines).toEqual([{ description: "Ocean freight", qty: 1, unit: "", unitPrice: 40, currency: "CZK", net: 1000, vatRate: 21, vat: 210, gross: 1210 }]);
    expect(answer.creditNotes.map((c) => [c.number, c.gross, c.full])).toEqual([
      ["CN-1", -210, false],
      ["CN-2", -1000, true],
    ]);
    // Who issued each credit note (D25), resolved with the invoice's issuer in one lookup.
    expect(answer.creditNotes.map((c) => [c.number, c.issuedBy, c.issuedByName])).toEqual([
      ["CN-1", "libor@test.cz", "Libor"],
      ["CN-2", "eva@test.cz", "Eva Nová"],
    ]);
    expect(answer.row.creditNotes.map((c) => c.issuedByName)).toEqual(["Libor", "Eva Nová"]);
    expect(names.userRefs).toHaveBeenCalledTimes(1);
    expect(names.userRefs).toHaveBeenCalledWith(["u-libor", "u-eva"]);
    expect(answer.payments[0]).toMatchObject({ id: PAYMENT, amount: 300, takenBack: null });
    expect(answer.customerFacts).toEqual({
      paymentTerms: "14 days",
      creditLimit: 200000,
      creditCurrency: "CZK",
      salesOwner: "petr@test.cz",
      unpaid: [
        { currency: "CZK", amount: 1210 },
        { currency: "EUR", amount: 50 },
      ],
      overdueCount: 1,
      reminderTo: { name: "Účtárna", email: "ucetni@gama.cz", role: "Accounts payable" },
    });
    expect(answer).toMatchObject({ canAct: false, sendAgain: false, today: "2026-11-18" });
    expect(repo.failedFollowups).toHaveBeenLastCalledWith(COMPANY, [INV, "cn-1", "cn-2"], ["customer_invoice", "mark_credited", "receivable_state"]);
  });

  it("leaves who issued blank when the users can't be looked up", async () => {
    repo.creditNotesOf.mockResolvedValue([invoice({ id: "cn-1", kind: "credit_note", number: "CN-1", correctsInvoiceId: INV, gross: "-210.00" })]);
    names.userRefs.mockResolvedValue(new Map());
    const answer = await service.detail(clerk, INV);
    expect(answer.row.issuedBy).toBe("");
    expect(answer.creditNotes[0]).toMatchObject({ issuedBy: "", issuedByName: "" });
    expect(answer.row.creditNotes[0]).toMatchObject({ issuedBy: "", issuedByName: "" });
  });

  it("has no customer facts when the Customer Database can't be read, and offers send again after a failed hand-over", async () => {
    clients.receivableFacts.mockRejectedValue(new Error("down"));
    repo.failedFollowups.mockResolvedValue([{ id: "o1", invoiceId: INV, kind: "receivable_state", actingUserId: "u-boss" }]);
    const answer = await service.detail(manager, INV);
    expect(answer.customerFacts).toBeNull();
    expect(answer.sendAgain).toBe(true);
  });

  it("says when a payment that may be for it waits on a bank statement (X5); nothing when none, or not owed, or not readable", async () => {
    bank.openIncoming.mockResolvedValue([bankEntry()]);
    expect((await service.detail(clerk, INV)).paymentWaiting).toEqual({
      statementId: "st-1",
      fileName: "vypis-2026-11-17.xml",
      bookingDate: "2026-11-17",
      amount: 1210,
      currency: "CZK",
      text: "A payment that may be for this invoice is waiting on bank statement vypis-2026-11-17.xml (booked 17.11.2026, 1210.00 CZK): a manager confirms it there",
    });
    // Another job's symbol, or money in another currency: not this invoice's.
    bank.openIncoming.mockResolvedValue([bankEntry({ variableSymbol: "99" }), bankEntry({ currency: "EUR" })]);
    expect((await service.detail(clerk, INV)).paymentWaiting).toBeNull();
    bank.openIncoming.mockResolvedValue([bankEntry()]);
    repo.figuresOne.mockResolvedValue(figures({ paid: 1210 }));
    expect((await service.detail(clerk, INV)).paymentWaiting).toBeNull();
    repo.figuresOne.mockResolvedValue(figures());
    bank.openIncoming.mockRejectedValue(new Error("db down"));
    expect((await service.detail(clerk, INV)).paymentWaiting).toBeNull();
  });

  it("writes the reminder as the app's own e-mail does: the customer's language, the account, the variable symbol (m3)", async () => {
    repo.figuresOne.mockResolvedValue(
      figures({
        invoice: {
          dueDate: "2026-11-10",
          supplier: { companyName: "CTO s.r.o.", bankAccount: { currency: "CZK", bankName: "ČSOB", accountNumber: "123456789/0300", iban: "CZ6503000000000123456789", swift: "CEKOCZPP" } },
        },
      }),
    );
    clients.receivableFacts.mockResolvedValue({ customers: [facts({ language: "cs" })] });
    const clerkDrafts = (await service.detail(clerk, INV)).reminderDrafts;
    // A user records reminders 1 and 2; the final notice is a manager's.
    expect(clerkDrafts.map((d) => [d.level, d.language])).toEqual([
      [1, "cs"],
      [2, "cs"],
    ]);
    expect(clerkDrafts[0]!.subject).toBe("Upomínka: faktura INV2026CZ00000031-001 (zakázka CZ00000031)");
    expect(clerkDrafts[0]!.body).toContain("účet 123456789/0300 (ČSOB)");
    expect(clerkDrafts[0]!.body).toContain("s variabilním symbolem 00000031");
    expect(clerkDrafts[0]!.body).toContain("8 dní po splatnosti");
    expect(clerkDrafts[0]!.body).not.toContain("přikládáme");
    expect((await service.detail(manager, INV)).reminderDrafts.map((d) => d.level)).toEqual([1, 2, 3]);
    // English when the customer's language is not known; none when nothing is owed.
    clients.receivableFacts.mockResolvedValue({ customers: [facts()] });
    expect((await service.detail(clerk, INV)).reminderDrafts[0]!.subject).toBe("Payment reminder: invoice INV2026CZ00000031-001 (job CZ00000031)");
    repo.figuresOne.mockResolvedValue(figures({ paid: 1210 }));
    expect((await service.detail(clerk, INV)).reminderDrafts).toEqual([]);
  });
});

describe("disputes that close by themselves (n4, L5)", () => {
  it("closes the settled disputes of what a read prepares, by the automatic run, and a failure never stops the read", async () => {
    await service.list(manager);
    expect(repo.closeSettledDisputes).toHaveBeenCalledWith(COMPANY, { all: true }, "Accounts Receivable (automatic)", expect.any(Function));
    await service.detail(clerk, INV);
    expect(repo.closeSettledDisputes).toHaveBeenLastCalledWith(COMPANY, { invoiceIds: [INV] }, "Accounts Receivable (automatic)", expect.any(Function));
    repo.closeSettledDisputes.mockRejectedValue(new Error("db blip"));
    await expect(service.detail(clerk, INV)).resolves.toMatchObject({ row: expect.objectContaining({ id: INV }) });
  });

  it("opens one that closed by itself again once the invoice is owed again, before closing what is settled - a failure never stops the read", async () => {
    await service.detail(clerk, INV);
    expect(repo.reopenAutoClosedDisputes).toHaveBeenCalledWith(COMPANY, { invoiceIds: [INV] }, "Accounts Receivable (automatic)", DISPUTE_REOPENED_REASON);
    expect(repo.reopenAutoClosedDisputes.mock.invocationCallOrder[0]!).toBeLessThan(repo.closeSettledDisputes.mock.invocationCallOrder[0]!);
    repo.reopenAutoClosedDisputes.mockRejectedValue(new Error("db blip"));
    await expect(service.detail(clerk, INV)).resolves.toMatchObject({ row: expect.objectContaining({ id: INV }) });
    expect(repo.closeSettledDisputes).toHaveBeenCalledTimes(2);
  });

  it("does not show a dispute on an invoice nothing is owed on any more", async () => {
    repo.figures.mockResolvedValue([figures({ receivable: { disputed: true }, paid: 1210 }), figures({ invoice: { id: INV_B }, receivable: { disputed: true } })]);
    const answer = await service.list(manager);
    expect(answer.counts.disputed).toBe(1);
    expect(answer.rows.find((r) => r.id === INV)!.marks).not.toContain("disputed");
  });
});

describe("send again (D24)", () => {
  it("is for managers, and only when something failed", async () => {
    await expect(service.sendAgain(clerk, INV)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.sendAgain(manager, INV)).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("requeues the invoice's and its credit notes' failed hand-overs, then what is left to pay once more, and sends them", async () => {
    repo.creditNotesOf.mockResolvedValue([invoice({ id: CN, kind: "credit_note", correctsInvoiceId: INV })]);
    repo.failedFollowups.mockResolvedValueOnce([
      { id: "o1", invoiceId: INV, kind: "customer_invoice", actingUserId: "u-gone" },
      { id: "o2", invoiceId: CN, kind: "customer_invoice", actingUserId: "u-gone" },
    ]);
    await service.sendAgain(manager, INV);
    expect(again.sendFailedAgain).toHaveBeenCalledWith(expect.anything(), COMPANY, expect.arrayContaining([expect.objectContaining({ id: "o1" }), expect.objectContaining({ id: "o2" })]));
    expect(lastChase().event).toMatchObject({ action: "sent_again", payload: { kinds: ["customer_invoice", "customer_invoice"] } });
    expect(repo.decide).not.toHaveBeenCalled();
    expect(outbox.enqueue).toHaveBeenCalledWith(TX, [{ kind: "receivable_state", payload: { invoiceId: INV }, actingUserId: "u-boss" }]);
    expect(followups.deliverInvoiceFollowups.mock.calls.map((c) => c[0])).toEqual([INV, CN]);
  });
});

describe("the release check (D20)", () => {
  it("warns for the job's owed invoice on prepayment", async () => {
    repo.figures.mockResolvedValue([figures({ invoice: { customer: { companyName: "Delta Import s.r.o.", paymentTerms: "PREPAYMENT" }, dueDate: "2026-11-17" } })]);
    const answer = await service.releaseCheck(clerk, SHIP);
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { shipmentId: SHIP }, 500);
    expect(answer).toMatchObject({ warn: true, prepayment: true, customer: "Delta Import s.r.o.", unpaid: [{ invoiceId: INV, leftToPay: 1210, daysOverdue: 1 }] });
  });

  it("warns when the customer has an overdue invoice elsewhere, and not when it has none", async () => {
    repo.overdueCountByCustomer.mockResolvedValue(new Map([[CUSTOMER, 2]]));
    expect(await service.releaseCheck(clerk, SHIP)).toMatchObject({ warn: true, prepayment: false, customerOverdueCount: 2 });
    expect(repo.overdueCountByCustomer).toHaveBeenCalledWith(COMPANY, [CUSTOMER], "2026-11-18");
    repo.overdueCountByCustomer.mockResolvedValue(new Map());
    expect(await service.releaseCheck(clerk, SHIP)).toMatchObject({ warn: false });
  });

  it("answers no warning for an id that is not one", async () => {
    expect(await service.releaseCheck(clerk, "nope")).toEqual({ warn: false, customer: "", prepayment: false, customerOverdueCount: 0, unpaid: [] });
  });
});

describe("the bell (D18)", () => {
  it("tells the Person in Charge the highest overdue milestone not yet seen", async () => {
    users.userEmailOf.mockResolvedValue("jana@test.cz");
    repo.figures.mockResolvedValue([figures({ invoice: { dueDate: "2026-11-03" } })]);
    const answer = await service.forMe(clerk);
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { overdueOn: "2026-11-18" }, 2000);
    // Polled by every page: nothing is made or carried over (nor locked) for it.
    expect(repo.ensureRows).not.toHaveBeenCalled();
    expect(repo.notCarriedChecked).not.toHaveBeenCalled();
    expect(clients.invoiceStatuses).not.toHaveBeenCalled();
    expect(answer.notices).toEqual([
      { key: `${INV}:overdue_14`, invoiceId: INV, milestone: "overdue_14", number: "INV2026CZ00000031-001", customer: "Gama Elektro a.s.", jobNumber: "CZ00000031", leftToPay: 1210, currency: "CZK", daysOverdue: 15, why: "person_in_charge", paymentWaiting: false },
    ]);
    repo.seenKeys.mockResolvedValue(new Set([`${INV}:overdue_14`]));
    expect((await service.forMe(clerk)).notices).toEqual([]);
  });

  it("says nothing of an invoice whose old Paid in the customer's list was not carried over yet (m4)", async () => {
    users.userEmailOf.mockResolvedValue("jana@test.cz");
    repo.figures.mockResolvedValue([figures({ invoice: { dueDate: "2026-11-03" }, receivable: { carriedChecked: false } }), figures({ invoice: { id: INV_B, dueDate: "2026-11-03" }, receivable: null })]);
    expect((await service.forMe(clerk)).notices).toEqual([]);
  });

  it("marks an overdue notice whose payment may be waiting on a bank statement (X5); a failed read says nothing", async () => {
    users.userEmailOf.mockResolvedValue("jana@test.cz");
    repo.figures.mockResolvedValue([figures({ invoice: { dueDate: "2026-11-03" } })]);
    bank.openIncoming.mockResolvedValue([bankEntry()]);
    expect((await service.forMe(clerk)).notices).toEqual([expect.objectContaining({ milestone: "overdue_14", paymentWaiting: true })]);
    bank.openIncoming.mockRejectedValue(new Error("db down"));
    expect((await service.forMe(clerk)).notices).toEqual([expect.objectContaining({ milestone: "overdue_14", paymentWaiting: false })]);
  });

  it("tells the Sales Owner an invoice paid this week that was overdue when it was paid", async () => {
    users.userEmailOf.mockResolvedValue("petr@test.cz");
    repo.figures.mockImplementation(async (_c: string, scope: Record<string, unknown>) =>
      "overdueOn" in scope ? [] : [figures({ invoice: { dueDate: "2026-11-10" }, paid: 1210 })],
    );
    repo.paidSince.mockResolvedValue([INV]);
    repo.paymentsOf.mockResolvedValue([{ id: PAYMENT, invoiceId: INV, kind: "payment", paidOn: "2026-11-16", createdAt: new Date("2026-11-17T08:00:00Z"), takenBackAt: null }]);
    const answer = await service.forMe({ ...clerk, userID: "u-petr" });
    expect(answer.notices).toEqual([expect.objectContaining({ key: `${INV}:paid`, milestone: "paid", why: "sales_owner", leftToPay: 0 })]);
  });

  it("tells a late invoice paid even when a small write-off was confirmed after the payment", async () => {
    users.userEmailOf.mockResolvedValue("petr@test.cz");
    repo.figures.mockImplementation(async (_c: string, scope: Record<string, unknown>) =>
      "overdueOn" in scope ? [] : [figures({ invoice: { dueDate: "2026-11-10" }, paid: 1200, writtenOff: 10 })],
    );
    repo.paidSince.mockResolvedValue([INV]);
    repo.paymentsOf.mockResolvedValue([
      { id: "wo-1", invoiceId: INV, kind: "write_off", paidOn: "2026-11-18", createdAt: new Date("2026-11-18T08:00:00Z"), takenBackAt: null },
      { id: PAYMENT, invoiceId: INV, kind: "payment", paidOn: "2026-11-16", createdAt: new Date("2026-11-17T08:00:00Z"), takenBackAt: null },
    ]);
    const answer = await service.forMe({ ...clerk, userID: "u-petr" });
    expect(answer.notices).toEqual([expect.objectContaining({ milestone: "paid" })]);
  });

  it("tells nobody who is neither, nor anyone whose e-mail can't be read", async () => {
    users.userEmailOf.mockResolvedValue("someone@test.cz");
    repo.figures.mockResolvedValue([figures({ invoice: { dueDate: "2026-11-03" } })]);
    expect((await service.forMe(clerk)).notices).toEqual([]);
    users.userEmailOf.mockRejectedValue(new Error("auth down"));
    expect((await service.forMe(clerk)).notices).toEqual([]);
  });

  it("marks seen only keys that are keys", async () => {
    await service.seen(clerk, [`${INV}:overdue_1`, `${INV}:overdue_1`, "nope:paid", `${INV}:later`]);
    expect(repo.markSeen).toHaveBeenCalledWith(COMPANY, "u-clerk", [{ invoiceId: INV, milestone: "overdue_1" }]);
  });
});

describe("the customers service's questions", () => {
  it("counts what a customer still owes after carrying its old Paid marks over", async () => {
    repo.owedCountOfCustomer.mockResolvedValue(2);
    expect(await service.customerUnpaidCount(manager, OTHER_CUSTOMER)).toBe(2);
    expect(repo.ensureRows).toHaveBeenCalledWith(COMPANY, { customerId: OTHER_CUSTOMER });
    expect(repo.notCarriedChecked).toHaveBeenCalledWith(COMPANY, { customerId: OTHER_CUSTOMER }, 500);
    expect(await service.customerUnpaidCount(manager, "nope")).toBe(0);
  });

  it("answers which numbers are issued documents", async () => {
    repo.issuedNumbers.mockResolvedValue(["INV-1"]);
    expect(await service.issuedNumbers(COMPANY, ["INV-1", "X"])).toEqual(["INV-1"]);
  });
});

// ── Step 7 (18 Nov 2026) ──

const LINE = "8a3f0d4b-6e5c-4b9a-8dbf-4c5d6e7f8091";
const writeOffLine = (over: Record<string, unknown> = {}) => ({
  id: LINE,
  invoiceId: INV,
  kind: "write_off",
  paidOn: "2026-11-18",
  amount: "10.00",
  note: "",
  reason: "short paid by the bank",
  bankRef: "",
  by: "eva@test.cz",
  byUserId: "u-eva",
  createdAt: new Date("2026-11-18T08:00:00Z"),
  confirmedAt: null,
  confirmedBy: "",
  confirmedByUserId: null,
  selfConfirmed: false,
  takenBackAt: null,
  takenBackBy: "",
  takenBackReason: "",
  ...over,
});

describe("writing off what is left (D13)", () => {
  const ask = { version: 3, kind: "write_off", amount: 10, reason: "short paid by the bank" };

  it("is for managers only, with a known kind, a reason and an amount", async () => {
    await expect(service.writeOff(clerk, INV, ask)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.writeOff(manager, INV, { ...ask, kind: "payment" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.writeOff(manager, INV, { ...ask, reason: "x" })).rejects.toMatchObject({ code: "invalid_argument", message: "Say why the write-off closes what is left" });
    await expect(service.writeOff(manager, INV, { ...ask, amount: -1 })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("writes a waiting line on today, under the version and the invoice's credit lock; the status does not move", async () => {
    repo.figuresOne.mockResolvedValue(figures({ paid: 1200 }));
    await service.writeOff(manager, INV, { ...ask, kind: "bank_charge" });
    expect(lastDecision().current).toMatchObject({ invoiceId: INV, version: 3 });
    expect(lastDecision().options).toEqual({ creditsOf: expect.objectContaining({ id: INV }) });
    expect(lastDecision().event).toMatchObject({ action: "write_off_noted", fromStatus: "part_paid", toStatus: "part_paid", reason: "short paid by the bank", payload: { kind: "bank_charge", amount: 10, paidOn: "2026-11-18" } });
    expect(repo.insertPayment).toHaveBeenCalledWith(TX, expect.objectContaining({ kind: "bank_charge", paidOn: "2026-11-18", amount: "10.00", reason: "short paid by the bank", byUserId: "u-boss", idempotencyKey: null }));
    // Nothing counts yet: the customer's list is not told.
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("refuses more than is left once what waits is counted, and checks again under the lock", async () => {
    repo.figuresOne.mockResolvedValue(figures({ paid: 1200, waiting: 4 }));
    await expect(service.writeOff(manager, INV, ask)).rejects.toMatchObject({ code: "failed_precondition", message: "More than is left to pay once what waits for a second manager is counted (6.00 CZK)" });
    repo.figuresOne.mockReset();
    repo.figuresOne.mockResolvedValueOnce(figures({ paid: 1200 })).mockResolvedValue(figures({ paid: 1205 }));
    await expect(service.writeOff(manager, INV, ask)).rejects.toMatchObject({ code: "failed_precondition", message: "More than is left to pay (5.00 CZK)" });
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("answers aborted on another version, and waits while the old Paid is not checked", async () => {
    await expect(service.writeOff(manager, INV, { ...ask, version: 2 })).rejects.toMatchObject({ code: "aborted" });
    repo.figuresOne.mockResolvedValue(figures({ receivable: { carriedChecked: false } }));
    await expect(service.writeOff(manager, INV, ask)).rejects.toMatchObject({ code: "unavailable" });
  });
});

describe("confirming a write-off (D13: a second manager)", () => {
  beforeEach(() => {
    repo.figuresOne.mockResolvedValue(figures({ paid: 1200, waiting: 10 }));
    repo.paymentById.mockResolvedValue(writeOffLine());
    repo.confirmLine.mockImplementation(async () => writeOffLine({ confirmedAt: new Date() }));
  });

  it("lets another manager confirm it: it counts, the customer's list follows", async () => {
    await service.confirmWriteOff(manager, INV, LINE, { version: 3 });
    // The writer is someone else: the company's managers are not even asked.
    expect(users.companyUsersWithRoles).not.toHaveBeenCalled();
    expect(repo.confirmLine).toHaveBeenCalledWith(TX, COMPANY, INV, LINE, { userId: "u-boss", email: "u-boss@test.cz", selfConfirmed: false });
    expect(writtenEvent()).toMatchObject({ action: "write_off_confirmed", fromStatus: "part_paid", toStatus: "paid", reason: "short paid by the bank", payload: { lineId: LINE, kind: "write_off", amount: 10, selfConfirmed: false } });
    expect(lastDecision().options).toEqual({ creditsOf: expect.objectContaining({ id: INV }) });
    expect(outbox.enqueue).toHaveBeenCalledWith(TX, [{ kind: "receivable_state", payload: { invoiceId: INV }, actingUserId: "u-boss" }]);
    expect(followups.deliverInvoiceFollowups).toHaveBeenCalledWith(INV);
  });

  it("refuses the manager who wrote it while another manager exists", async () => {
    await expect(service.confirmWriteOff({ ...manager, userID: "u-eva" }, INV, LINE, { version: 3 })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "You wrote this write-off: another manager confirms it",
    });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("lets the writer confirm it when the company has no other manager, marked self-confirmed", async () => {
    users.companyUsersWithRoles.mockResolvedValue([
      { id: "u-eva", email: "eva@test.cz", displayName: "Eva", role: "manager" },
      { id: "u-clerk", email: "clerk@test.cz", displayName: "Clerk", role: "user" },
    ]);
    await service.confirmWriteOff({ ...manager, userID: "u-eva" }, INV, LINE, { version: 3 });
    expect(repo.confirmLine).toHaveBeenCalledWith(TX, COMPANY, INV, LINE, expect.objectContaining({ userId: "u-eva", selfConfirmed: true }));
    expect(writtenEvent()).toMatchObject({ payload: { selfConfirmed: true } });
  });

  it("refuses (to try again) when who else is a manager can't be read, never self-confirming", async () => {
    users.companyUsersWithRoles.mockRejectedValue(new Error("auth down"));
    await expect(service.confirmWriteOff({ ...manager, userID: "u-eva" }, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("checks again under the lock: taken back, or a payment that leaves less, meanwhile", async () => {
    repo.paymentById.mockResolvedValueOnce(writeOffLine()).mockResolvedValue(writeOffLine({ takenBackAt: new Date() }));
    await expect(service.confirmWriteOff(manager, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "failed_precondition", message: "This write-off was taken back" });
    repo.paymentById.mockResolvedValue(writeOffLine());
    repo.figuresOne.mockReset();
    repo.figuresOne.mockResolvedValueOnce(figures({ paid: 1200, waiting: 10 })).mockResolvedValue(figures({ paid: 1205, waiting: 10 }));
    await expect(service.confirmWriteOff(manager, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "failed_precondition", message: /More than is left to pay now \(5\.00 CZK\)/ });
    repo.figuresOne.mockResolvedValue(figures({ paid: 1200, waiting: 10 }));
    repo.confirmLine.mockResolvedValue(null);
    await expect(service.confirmWriteOff(manager, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "failed_precondition", message: "This write-off no longer waits for a second manager" });
    expect(outbox.enqueue).not.toHaveBeenCalled();
  });

  it("is for managers, on a line of the invoice, from the version read", async () => {
    await expect(service.confirmWriteOff(clerk, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.confirmWriteOff(manager, INV, "nope", { version: 3 })).rejects.toMatchObject({ code: "not_found" });
    await expect(service.confirmWriteOff(manager, INV, LINE, { version: 2 })).rejects.toMatchObject({ code: "aborted" });
    repo.paymentById.mockResolvedValue(null);
    await expect(service.confirmWriteOff(manager, INV, LINE, { version: 3 })).rejects.toMatchObject({ code: "not_found" });
  });

  it("takes a write-off back as a write-off", async () => {
    repo.paymentById.mockResolvedValue(writeOffLine());
    repo.takeBack.mockResolvedValue(writeOffLine({ takenBackAt: new Date() }));
    await service.takeBackPayment(manager, INV, LINE, { version: 3, reason: "agreed with the customer" });
    expect(lastDecision().event).toMatchObject({ action: "write_off_taken_back", payload: { kind: "write_off", amount: 10 } });
  });
});

describe("the detail's lines and the waiting list", () => {
  it("shows a waiting write-off, who may confirm it, and a confirmed one with its confirmer", async () => {
    repo.paymentsOf.mockResolvedValue([
      writeOffLine(),
      writeOffLine({ id: "l-2", kind: "bank_charge", byUserId: "u-boss", confirmedAt: new Date("2026-11-18T09:00:00Z"), confirmedBy: "eva@test.cz", selfConfirmed: false }),
      { ...writeOffLine({ id: "l-3", kind: "payment", reason: "", bankRef: "VS 2026031" }), confirmedAt: new Date("2026-11-18T09:00:00Z") },
    ]);
    const answer = await service.detail(manager, INV);
    expect(answer.payments.map((p) => [p.id, p.kind, p.waiting, p.canConfirm, p.confirmed?.by ?? null, p.bankRef])).toEqual([
      [LINE, "write_off", true, true, null, ""],
      ["l-2", "bank_charge", false, false, "eva@test.cz", ""],
      ["l-3", "payment", false, false, null, "VS 2026031"],
    ]);
    // Only the writer needs the managers asked.
    expect(users.companyUsersWithRoles).not.toHaveBeenCalled();
    const asEva = await service.detail({ ...manager, userID: "u-eva" }, INV);
    expect(asEva.payments[0]).toMatchObject({ waiting: true, canConfirm: false });
    expect((await service.detail(clerk, INV)).payments[0]).toMatchObject({ waiting: true, canConfirm: false });
  });

  it("lists what waits for a second manager with its invoice", async () => {
    repo.waitingLines.mockResolvedValue([{ line: writeOffLine(), invoice: invoice(), version: 4 }]);
    const answer = await service.waiting(manager);
    expect(answer.lines).toEqual([
      {
        lineId: LINE,
        invoiceId: INV,
        number: "INV2026CZ00000031-001",
        customerId: CUSTOMER,
        customer: "Gama Elektro a.s.",
        jobNumber: "CZ00000031",
        currency: "CZK",
        kind: "write_off",
        amount: 10,
        reason: "short paid by the bank",
        by: "eva@test.cz",
        at: "2026-11-18T08:00:00.000Z",
        version: 4,
        canConfirm: true,
      },
    ]);
    expect((await service.waiting(clerk)).lines[0]!.canConfirm).toBe(false);
  });
});

describe("one bank payment over several invoices (noteAllocations)", () => {
  const items = [
    { invoiceId: INV, version: 3, amount: 1000 },
    { invoiceId: INV_B, version: 1, amount: 50 },
  ];
  const both = () => [figures(), figures({ invoice: { id: INV_B, number: "INV-B", gross: "100.00" }, receivable: { version: 1 } })];

  beforeEach(() => {
    repo.figures.mockImplementation(async () => both());
    let n = 0;
    repo.insertPayment.mockImplementation(async (_tx: unknown, values: Record<string, unknown>) => ({ id: `pay-${++n}`, ...values }));
  });

  it("notes every line in one transaction under the invoices' locks: the same day, bank reference and note", async () => {
    const answer = await service.noteAllocations(manager, { paidOn: "2026-11-14", bankRef: " VS 123 ", note: "one transfer", idempotencyKeyPrefix: "bank:e1", items });
    expect(answer).toEqual([
      { invoiceId: INV, paymentId: "pay-1" },
      { invoiceId: INV_B, paymentId: "pay-2" },
    ]);
    expect(repo.ensureRows).toHaveBeenCalledWith(COMPANY, { invoiceIds: [INV, INV_B] });
    expect(repo.underWriteLocks).toHaveBeenCalledTimes(1);
    expect(repo.underWriteLocks.mock.calls[0]![1]).toEqual([expect.objectContaining({ id: INV }), expect.objectContaining({ id: INV_B })]);
    expect(repo.bumpVersion.mock.calls).toEqual([
      [TX, COMPANY, INV, 3],
      [TX, COMPANY, INV_B, 1],
    ]);
    expect(repo.insertPayment.mock.calls.map((c) => c[1])).toEqual([
      expect.objectContaining({ invoiceId: INV, kind: "payment", paidOn: "2026-11-14", amount: "1000.00", bankRef: "VS 123", note: "one transfer", idempotencyKey: `bank:e1:${INV}` }),
      expect.objectContaining({ invoiceId: INV_B, amount: "50.00", bankRef: "VS 123", idempotencyKey: `bank:e1:${INV_B}` }),
    ]);
    expect(repo.addEvent.mock.calls.map((c) => [c[2], (c[3] as { action: string; toStatus: string }).action, (c[3] as { toStatus: string }).toStatus])).toEqual([
      [INV, "payment_noted", "part_paid"],
      [INV_B, "payment_noted", "part_paid"],
    ]);
    expect(outbox.enqueue).toHaveBeenCalledTimes(2);
    expect(followups.deliverInvoiceFollowups.mock.calls.map((c) => c[0])).toEqual([INV, INV_B]);
  });

  it("is all or nothing: one invoice that doesn't take it refuses the whole payment before anything is written", async () => {
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items: [items[0]!, { ...items[1]!, amount: 100.01 }] })).rejects.toMatchObject({
      code: "failed_precondition",
      message: "Invoice INV-B: More than is left to pay (100.00 CZK)",
    });
    expect(repo.insertPayment).not.toHaveBeenCalled();
    // Changed under the lock: the whole transaction throws (and is rolled back).
    repo.figures.mockReset();
    repo.figures.mockResolvedValueOnce(both()).mockResolvedValue([figures(), figures({ invoice: { id: INV_B, number: "INV-B", gross: "100.00" }, receivable: { version: 2 } })]);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items })).rejects.toMatchObject({ code: "aborted", message: /INV-B changed meanwhile/ });
    repo.figures.mockImplementation(async () => both());
    repo.bumpVersion.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items })).rejects.toMatchObject({ code: "aborted" });
    expect(followups.deliverInvoiceFollowups).not.toHaveBeenCalled();
  });

  it("refuses invoices in two currencies, or not in the bank's", async () => {
    repo.figures.mockImplementation(async () => [figures(), figures({ invoice: { id: INV_B, currency: "EUR", gross: "100.00" }, receivable: { version: 1 } })]);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items })).rejects.toMatchObject({ code: "failed_precondition", message: /one currency/ });
    repo.figures.mockImplementation(async () => both());
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", currency: "EUR", items })).rejects.toMatchObject({ code: "failed_precondition", message: /The payment is in EUR/ });
  });

  it("is for managers, refuses what the rules refuse, and an invoice that is not there", async () => {
    await expect(service.noteAllocations(clerk, { paidOn: "2026-11-14", items })).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items: [items[0]!, items[0]!] })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items: [] })).rejects.toMatchObject({ code: "invalid_argument" });
    repo.figures.mockResolvedValue([figures()]);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items })).rejects.toMatchObject({ code: "not_found" });
  });

  it("answers the lines a request with the same keys wrote, writing nothing; refuses keys used for other amounts", async () => {
    repo.paymentsByKeys.mockResolvedValue([
      { id: "pay-a", invoiceId: INV, amount: "1000.00" },
      { id: "pay-b", invoiceId: INV_B, amount: "50.00" },
    ]);
    expect(await service.noteAllocations(manager, { paidOn: "2026-11-14", idempotencyKeyPrefix: "bank:e1", items })).toEqual([
      { invoiceId: INV, paymentId: "pay-a" },
      { invoiceId: INV_B, paymentId: "pay-b" },
    ]);
    expect(repo.paymentsByKeys).toHaveBeenCalledWith(COMPANY, [`bank:e1:${INV}`, `bank:e1:${INV_B}`], undefined);
    expect(repo.underWriteLocks).not.toHaveBeenCalled();
    repo.paymentsByKeys.mockResolvedValue([{ id: "pay-a", invoiceId: INV, amount: "999.00" }]);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", idempotencyKeyPrefix: "bank:e1", items })).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("answers the first request's lines when it got there first, under the lock", async () => {
    repo.paymentsByKeys.mockResolvedValueOnce([]).mockResolvedValue([
      { id: "pay-a", invoiceId: INV, amount: "1000.00" },
      { id: "pay-b", invoiceId: INV_B, amount: "50.00" },
    ]);
    expect((await service.noteAllocations(manager, { paidOn: "2026-11-14", idempotencyKeyPrefix: "bank:e1", items })).map((a) => a.paymentId)).toEqual(["pay-a", "pay-b"]);
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("in the caller's transaction: no rows made on another connection, its savepoint used, the follow-ups left to the caller", async () => {
    const outer = { outer: true } as never;
    await service.noteAllocations(manager, { paidOn: "2026-11-14", idempotencyKeyPrefix: "bank:e1", items }, outer);
    expect(repo.ensureRows).not.toHaveBeenCalled();
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { invoiceIds: [INV, INV_B] }, 2, outer);
    expect(repo.underWriteLocks.mock.calls[0]![3]).toBe(outer);
    expect(repo.insertPayment.mock.calls[0]![0]).toBe(outer);
    expect(followups.deliverInvoiceFollowups).not.toHaveBeenCalled();
  });

  it("in the caller's transaction, an invoice not made or checked yet is to be tried again, never a payment on an unchecked one", async () => {
    repo.figures.mockImplementation(async () => [figures({ receivable: null }), figures({ invoice: { id: INV_B, gross: "100.00" }, receivable: { version: 1 } })]);
    await expect(service.noteAllocations(manager, { paidOn: "2026-11-14", items }, { outer: true } as never)).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.insertPayment).not.toHaveBeenCalled();
  });

  it("the batch endpoint keys its lines by the request's key and answers the rows in its order", async () => {
    const answer = await service.batchPayment(manager, { paidOn: "2026-11-14", idempotencyKey: "k-9", items: [...items].reverse() });
    expect(repo.insertPayment.mock.calls.map((c) => (c[1] as { idempotencyKey: string }).idempotencyKey)).toEqual([`batch:k-9:${INV_B}`, `batch:k-9:${INV}`]);
    expect(answer.rows.map((r) => r.id)).toEqual([INV_B, INV]);
  });
});

describe("month-end as at a day", () => {
  const candidate = (over: Record<string, unknown> = {}) => ({
    id: INV,
    number: "INV-1",
    status: "issued",
    customerId: CUSTOMER,
    customer: "Gama Elektro a.s.",
    shipmentId: SHIP,
    jobNumber: "CZ00000031",
    issueDate: "2026-10-10",
    dueDate: "2026-10-24",
    currency: "EUR",
    gross: 1000,
    fxRate: 25.1,
    carriedChecked: true,
    ...over,
  });

  it("lists what was owed at the end of the day, per currency and in CZK at each invoice's own rate", async () => {
    repo.asAtCandidates.mockResolvedValue([candidate(), candidate({ id: INV_B, number: "INV-2", currency: "CZK", gross: 500, fxRate: 1 }), candidate({ id: INV_C, number: "INV-3" })]);
    repo.creditNotesOf.mockResolvedValue([invoice({ id: CN, kind: "credit_note", correctsInvoiceId: INV, issueDate: "2026-10-15", gross: "-100.00" })]);
    repo.paymentsOf.mockResolvedValue([
      { invoiceId: INV, kind: "payment", amount: "400.00", paidOn: "2026-11-03", confirmedAt: new Date(), takenBackAt: null },
      { invoiceId: INV_C, kind: "payment", amount: "1000.00", paidOn: "2026-10-20", confirmedAt: new Date(), takenBackAt: null },
    ]);
    const answer = await service.asAt(clerk, "2026-10-31");
    expect(repo.asAtCandidates).toHaveBeenCalledWith(COMPANY, "2026-10-31", 20001);
    expect(answer.rows.map((r) => [r.number, r.leftToPay, r.leftToPayCzk, r.daysOverdue])).toEqual([
      ["INV-2", 500, 500, 7],
      ["INV-1", 900, 22590, 7],
    ]);
    expect(answer.totals).toEqual([
      { currency: "EUR", amount: 900 },
      { currency: "CZK", amount: 500 },
    ]);
    expect(answer).toMatchObject({ day: "2026-10-31", totalCzk: 23090, czkRate: "at each invoice's own ČNB rate", truncated: false, today: "2026-11-18" });
  });

  it("asks the Customer Database about every invoice the day can include, a chunk at a time, before answering", async () => {
    const pending = (from: number, n: number) => Array.from({ length: n }, (_, k) => ({ invoiceId: `i-${from + k}`, number: `N${from + k}`, customerId: CUSTOMER, status: "issued", shipmentId: SHIP }));
    repo.notCarriedChecked.mockResolvedValueOnce(pending(0, 500)).mockResolvedValueOnce(pending(500, 120)).mockResolvedValue([]);
    clients.invoiceStatuses.mockImplementation(async ({ items }: { items: { invoiceId: string }[] }) => ({ items: items.map((i) => ({ invoiceId: i.invoiceId, status: null })) }));
    repo.asAtCandidates.mockResolvedValue([candidate()]);
    const answer = await service.asAt(clerk, "2026-10-31");
    expect(repo.ensureRows).toHaveBeenCalledWith(COMPANY, { issuedOnOrBefore: "2026-10-31" });
    expect(repo.notCarriedChecked).toHaveBeenCalledWith(COMPANY, { issuedOnOrBefore: "2026-10-31" }, 500);
    expect(clients.invoiceStatuses).toHaveBeenCalledTimes(2);
    expect(answer.unchecked).toBeUndefined();
  });

  it("when the Customer Database can't be asked, answers the list and says how many may already be paid", async () => {
    repo.notCarriedChecked.mockResolvedValue([{ invoiceId: INV, number: "INV-1", customerId: CUSTOMER, status: "issued", shipmentId: SHIP }]);
    clients.invoiceStatuses.mockRejectedValue(new Error("customers down"));
    repo.asAtCandidates.mockResolvedValue([candidate({ carriedChecked: false }), candidate({ id: INV_B, number: "INV-2" })]);
    const answer = await service.asAt(clerk, "2026-10-31");
    expect(answer.rows).toHaveLength(2);
    expect(answer.unchecked).toBe(1);
    expect(answer.uncheckedNote).toMatch(/1 of these invoices could not be checked .* they may already be paid/);
    expect(clients.invoiceStatuses).toHaveBeenCalledTimes(1);
  });

  it("stops asking when the Customer Database answers nothing for a chunk (never loops)", async () => {
    repo.notCarriedChecked.mockResolvedValue([{ invoiceId: INV, number: "INV-1", customerId: CUSTOMER, status: "issued", shipmentId: SHIP }]);
    clients.invoiceStatuses.mockResolvedValue({ items: [] });
    repo.asAtCandidates.mockResolvedValue([candidate({ carriedChecked: false })]);
    expect((await service.asAt(clerk, "2026-10-31")).unchecked).toBe(1);
    expect(clients.invoiceStatuses).toHaveBeenCalledTimes(1);
  });

  it("refuses a day after today or not a day, and says when it read too many to be complete", async () => {
    await expect(service.asAt(clerk, "2026-11-19")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.asAt(clerk)).rejects.toMatchObject({ code: "invalid_argument" });
    repo.asAtCandidates.mockResolvedValue(Array.from({ length: 20001 }, () => candidate({ issueDate: "2026-12-01" })));
    expect((await service.asAt(clerk, "2026-10-31")).truncated).toBe(true);
  });
});

describe("work not yet invoiced", () => {
  it("sums the customer's open jobs' selling lines no open invoice was made from", async () => {
    clients.openJobIds.mockResolvedValue({ shipmentIds: [SHIP, "nope"], capped: true });
    selling.listLiveByShipments.mockResolvedValue([
      { id: "s1", shipmentId: SHIP, qty: "1", amount: "800.00", currency: "EUR", invoice: true },
      { id: "s2", shipmentId: SHIP, qty: "1", amount: "300.00", currency: "EUR", invoice: true },
    ]);
    invoices.listOpenInvoicesWithSources.mockResolvedValue([{ sourceSellingCostIds: ["s2"] }]);
    expect(await service.unbilled(clerk, CUSTOMER)).toEqual({ amounts: [{ currency: "EUR", amount: 800 }], jobs: 1, capped: true });
    expect(clients.openJobIds).toHaveBeenCalledWith({ customerId: CUSTOMER });
    expect(selling.listLiveByShipments).toHaveBeenCalledWith([SHIP], COMPANY);
  });

  it("never answers 0 when the open jobs can't be read", async () => {
    clients.openJobIds.mockRejectedValue(new Error("shipments down"));
    await expect(service.unbilled(clerk, CUSTOMER)).rejects.toMatchObject({ code: "unavailable" });
    expect(await service.unbilled(clerk, "nope")).toEqual({ amounts: [], jobs: 0, capped: false });
  });
});

describe("reminder settings", () => {
  it("reads the defaults, whether e-mail is on, and who may change them", async () => {
    expect(await service.settings(clerk)).toEqual({ autoReminders: false, reminder1Days: 7, reminder2Days: 21, replyTo: "", autoRemindersSince: null, emailOn: false, canEdit: false, updatedBy: "", updatedAt: null });
    mail.emailConfigured.mockReturnValue(true);
    expect(await service.settings(manager)).toMatchObject({ emailOn: true, canEdit: true });
  });

  it("is saved by a manager, within the rules; switched on, today is the day only newer overdue invoices are reminded from (L2)", async () => {
    const input = { autoReminders: true, reminder1Days: 5, reminder2Days: 20, replyTo: " ucetni@cto.cz " };
    await expect(service.saveSettings(clerk, input)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.saveSettings(manager, { ...input, reminder2Days: 5 })).rejects.toMatchObject({ code: "invalid_argument" });
    await service.saveSettings(manager, input);
    expect(repo.saveSettings).toHaveBeenCalledWith(COMPANY, {
      autoReminders: true,
      reminder1Days: 5,
      reminder2Days: 20,
      replyTo: "ucetni@cto.cz",
      autoRemindersSince: "2026-11-18",
      updatedByUserId: "u-boss",
      updatedBy: "u-boss@test.cz",
    });
    // Saved again while on: the day stays. Switched off: none; on again later: that day.
    repo.settingsOf.mockResolvedValue({ autoReminders: true, reminder1Days: 5, reminder2Days: 20, replyTo: "", autoRemindersSince: "2026-11-02", updatedBy: "", updatedAt: null });
    await service.saveSettings(manager, { ...input, reminder1Days: 6 });
    expect(repo.saveSettings).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ autoRemindersSince: "2026-11-02" }));
    await service.saveSettings(manager, { ...input, autoReminders: false });
    expect(repo.saveSettings).toHaveBeenLastCalledWith(COMPANY, expect.objectContaining({ autoReminders: false, autoRemindersSince: null }));
    expect(await service.settings(manager)).toMatchObject({ autoRemindersSince: "2026-11-02" });
  });
});

describe("the prepayment stop before any invoice (L3)", () => {
  const prepaymentCustomer = () => clients.receivableFacts.mockResolvedValue({ customers: [facts({ paymentTerms: "PREPAYMENT" })] });
  beforeEach(() => {
    repo.figures.mockResolvedValue([]);
    clients.shipmentBasics.mockResolvedValue({ shipments: [{ id: SHIP, jobNumber: "CZ00000031", customerId: CUSTOMER, personInCharge: "", holidayCover: "" }] });
    selling.listLiveByShipments.mockResolvedValue([
      { id: "s1", shipmentId: SHIP, qty: "1", amount: "825.00", currency: "EUR", invoice: true },
      { id: "s2", shipmentId: SHIP, qty: "2", amount: "100.00", currency: "CZK", invoice: true },
    ]);
    invoices.listOpenInvoicesWithSources.mockResolvedValue([{ sourceSellingCostIds: ["s2"] }]);
  });

  it("stops the release of a job on prepayment with selling not yet invoiced, naming what is not invoiced", async () => {
    prepaymentCustomer();
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: true, prepaymentInvoices: [], prepaymentUninvoiced: [{ currency: "EUR", amount: 825 }] });
    expect(clients.shipmentBasics).toHaveBeenCalledWith({ ids: [SHIP] });
  });

  it("does not stop a customer not on prepayment, nor a job whose selling is all invoiced (its terms then not asked)", async () => {
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: false, prepaymentUninvoiced: [] });
    prepaymentCustomer();
    invoices.listOpenInvoicesWithSources.mockResolvedValue([{ sourceSellingCostIds: ["s1", "s2"] }]);
    clients.shipmentBasics.mockClear();
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: false, prepaymentUninvoiced: [] });
    expect(clients.shipmentBasics).not.toHaveBeenCalled();
  });

  it("leaves L3 out, logs it and says so when the job's customer or its terms can't be read - never refuses every release for it", async () => {
    clients.shipmentBasics.mockRejectedValue(new Error("shipments down"));
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: false, prepaymentUninvoiced: [], prepaymentUninvoicedUnchecked: true });
    expect(log.warn).toHaveBeenCalled();
    clients.shipmentBasics.mockResolvedValue({ shipments: [{ id: SHIP, jobNumber: "CZ00000031", customerId: CUSTOMER, personInCharge: "", holidayCover: "" }] });
    clients.receivableFacts.mockRejectedValue(new Error("customers down"));
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: false, prepaymentUninvoiced: [], prepaymentUninvoicedUnchecked: true });
  });

  it("still stops on an owed prepayment invoice when the terms for the uninvoiced part can't be read, as before L3", async () => {
    clients.shipmentBasics.mockRejectedValue(new Error("shipments down"));
    repo.figures.mockResolvedValue([figures({ invoice: { customer: { companyName: "Delta Import s.r.o.", paymentTerms: "PREPAYMENT" } } })]);
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: true, prepaymentUninvoicedUnchecked: true });
  });

  it("says nothing of the uninvoiced part when it was checked", async () => {
    prepaymentCustomer();
    expect(await service.releaseCheckInternal(clerk, SHIP)).not.toHaveProperty("prepaymentUninvoicedUnchecked");
  });
});

describe("what a customer owes, for the credit warning (m5)", () => {
  it("answers Invoicing's own figures: left to pay per currency, the overdue ones and the oldest due", async () => {
    repo.figures.mockResolvedValue([
      figures({ invoice: { dueDate: "2026-11-03" } }),
      figures({ invoice: { id: INV_B, currency: "EUR", gross: "500.00", dueDate: "2026-11-25" }, paid: 100 }),
      figures({ invoice: { id: INV_C, dueDate: "2026-10-01" }, paid: 1210 }),
    ]);
    expect(await service.customerOwed(clerk, CUSTOMER)).toEqual({
      unpaid: [{ currency: "CZK", amount: 1210 }, { currency: "EUR", amount: 400 }],
      overdueCount: 1,
      oldestOverdueDue: "2026-11-03",
    });
    expect(repo.ensureRows).toHaveBeenCalledWith(COMPANY, { customerId: CUSTOMER });
    expect(repo.figures).toHaveBeenCalledWith(COMPANY, { customerId: CUSTOMER }, 2000);
    expect(await service.customerOwed(clerk, "nope")).toEqual({ unpaid: [], overdueCount: 0, oldestOverdueDue: null });
  });
});

describe("the release check for the shipments service (the prepayment stop)", () => {
  it("says whether an owed invoice on prepayment stops the release", async () => {
    repo.figures.mockResolvedValue([figures({ invoice: { customer: { companyName: "Delta Import s.r.o.", paymentTerms: "PREPAYMENT" } } })]);
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ warn: true, prepayment: true, prepaymentUnpaid: true });
    repo.figures.mockResolvedValue([figures({ invoice: { customer: { companyName: "Delta Import s.r.o.", paymentTerms: "PREPAYMENT" } }, paid: 1000, writtenOff: 210 })]);
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ warn: false, prepaymentUnpaid: false });
    expect(await service.releaseCheckInternal(clerk, "nope")).toMatchObject({ warn: false, prepaymentUnpaid: false });
  });

  it("throws unavailable when a prepayment invoice of the job is still not checked against the old Paid, never answers it as owed or paid", async () => {
    repo.notCarriedChecked.mockResolvedValue([{ invoiceId: INV, number: "INV-1", customerId: CUSTOMER, status: "issued", shipmentId: SHIP }]);
    clients.invoiceStatuses.mockRejectedValue(new Error("customers down"));
    const prepay = { customer: { companyName: "Delta Import s.r.o.", paymentTerms: "PREPAYMENT" } };
    repo.figures.mockResolvedValue([figures({ invoice: prepay, receivable: { carriedChecked: false } })]);
    await expect(service.releaseCheckInternal(clerk, SHIP)).rejects.toMatchObject({ code: "unavailable" });
    repo.figures.mockResolvedValue([figures({ invoice: prepay, receivable: null })]);
    await expect(service.releaseCheckInternal(clerk, SHIP)).rejects.toMatchObject({ code: "unavailable" });
    // An unchecked invoice not on prepayment can't change the stop: answered (it reads as owed in the warning).
    repo.figures.mockResolvedValue([figures({ receivable: { carriedChecked: false } })]);
    expect(await service.releaseCheckInternal(clerk, SHIP)).toMatchObject({ prepaymentUnpaid: false });
    // The person's warning (not a stop) still answers: an unchecked invoice reads as owed there.
    expect(await service.releaseCheck(clerk, SHIP)).toMatchObject({ warn: false });
  });

  it("throws when the invoices can't be read, so the release is refused there, never let through", async () => {
    repo.figures.mockRejectedValue(new Error("db down"));
    await expect(service.releaseCheckInternal(clerk, SHIP)).rejects.toThrow("db down");
  });
});

describe("the list with write-offs", () => {
  it("shows Written off and its count, and what was written off apart from what was paid", async () => {
    repo.figures.mockResolvedValue([figures({ writtenOff: 1210 }), figures({ invoice: { id: INV_B }, paid: 1200, bankCharges: 10 })]);
    const answer = await service.list(manager);
    expect(answer.rows.map((r) => [r.status, r.paid, r.writtenOff, r.bankCharges, r.leftToPay, r.marks])).toEqual([
      ["written_off", 0, 1210, 0, 0, []],
      ["paid", 1200, 0, 10, 0, ["bank_charge"]],
    ]);
    expect(answer.counts).toMatchObject({ writtenOff: 1, paid: 1, unpaid: 0 });
  });
});
