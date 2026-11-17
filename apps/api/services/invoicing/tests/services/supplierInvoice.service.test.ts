import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Finance → Accounts Payable (Council Outlay 9) run for real - approve, refuse, paid, the take-backs, the
// supplier link, the details, the bell, the list and the hooks of the cost writes - against stand-ins for its
// repository, the other services (customers, shipments, trucking) and the company's users.
const repo = vi.hoisted(() => ({
  sync: vi.fn(),
  list: vi.fn(),
  expectedLines: vi.fn(),
  costLinesOf: vi.fn(),
  masterLinesOf: vi.fn(),
  byId: vi.fn(),
  events: vi.fn(),
  decide: vi.fn(),
  takeLinesOff: vi.fn(),
  storeRefusedLines: vi.fn(),
  setLinesPaid: vi.fn(),
  linkSupplier: vi.fn(),
  setDetails: vi.fn(),
  countByStatus: vi.fn(),
  bookedSince: vi.fn(),
  seenIds: vi.fn(),
  markSeen: vi.fn(),
  idOf: vi.fn(async () => null),
}));
vi.mock("../../repositories/supplierInvoice.repository", () => ({ supplierInvoiceRepository: repo }));
// The day each job was first billed (arrived after billing): none billed unless a test says so.
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: { firstBilledOn: vi.fn(async () => new Map()) } }));
const clients = vi.hoisted(() => ({
  supplierFacts: vi.fn(),
  shipmentBasics: vi.fn(),
  masterJobBasics: vi.fn(),
  costClaims: vi.fn(),
  haulierInvoices: vi.fn(),
}));
vi.mock("~encore/clients", () => ({
  customers: { _internalSupplierFacts: clients.supplierFacts },
  shipments: { _internalShipmentBasics: clients.shipmentBasics, _internalMasterJobBasics: clients.masterJobBasics, _internalCostClaims: clients.costClaims },
  trucking: { _internalHaulierInvoiceList: clients.haulierInvoices },
}));
const users = vi.hoisted(() => ({ companyUsersWithRoles: vi.fn(), userEmailOf: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => users);
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

import log from "encore.dev/log";
import { supplierInvoiceService as service } from "../../services/supplierInvoice.service";
import { invoiceRepository } from "../../repositories/invoice.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const OTHER_INV = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b";
const SUPPLIER = "3f2b8c1a-0d4e-4c55-9a7b-1e2d3c4b5a69";
const SHIP_A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const SHIP_B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";
const LINE = "9a1c6f8e-2b7d-4c1e-8f3a-5d6b7c8e9f01";
const TX = { tx: true };

const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const clerk = { userID: "u-clerk", companyID: COMPANY, role: "user" };
const superadmin = { userID: "u-root", companyID: COMPANY, role: "superadmin" };

type Header = Record<string, unknown> & { id: string; version: number; status: string };
const header = (over: Record<string, unknown> = {}): Header => ({
  id: INV,
  createdAt: new Date("2026-11-03T09:00:00Z"),
  updatedAt: new Date("2026-11-03T09:00:00Z"),
  deletedAt: null,
  companyId: COMPANY,
  supplierKey: `c:${SUPPLIER}`,
  supplierCustomerId: SUPPLIER,
  haulierId: null,
  vendor: "MSC",
  invoiceNumber: "FV-1",
  numberKey: "FV-1",
  kind: "invoice",
  issueDate: null,
  dueDate: null,
  receivedAt: new Date("2026-11-03T09:00:00Z"),
  currency: "EUR",
  totalNet: null,
  vatAmount: null,
  totalGross: null,
  status: "booked",
  decidedByUserId: null,
  decidedBy: "",
  decidedAt: null,
  decisionReason: "",
  selfDecision: false,
  paidOn: null,
  paidAt: null,
  paidByUserId: null,
  paidBy: "",
  source: "typed",
  documentShipmentId: null,
  documentAttachmentId: null,
  documentName: "",
  enteredByUserId: "u-clerk",
  enteredBy: "u-clerk@test.cz",
  refusedLines: [],
  version: 3,
  ...over,
});

const costLine = (over: Record<string, unknown> = {}) => ({
  id: LINE,
  createdAt: new Date("2026-11-01T09:00:00Z"),
  updatedAt: new Date("2026-11-01T09:00:00Z"),
  deletedAt: null,
  companyId: COMPANY,
  shipmentId: SHIP_A,
  category: "ocean_freight",
  description: "",
  estQty: null,
  estAmount: "900.00",
  estCurrency: "EUR",
  realQty: null,
  realAmount: "1000.00",
  realCurrency: "EUR",
  unit: "",
  invoiceNumber: "FV-1",
  received: true,
  vendor: "MSC",
  haulierId: null,
  supplierCustomerId: SUPPLIER,
  receivedAt: new Date("2026-11-03T09:00:00Z"),
  paidOn: null,
  paidAt: null,
  paidByUserId: null,
  paidBy: null,
  sortOrder: 0,
  sourceQuoteNumber: "",
  sourceTruckingRef: null,
  sourceMasterJobRef: null,
  postedFromLines: true,
  supplierInvoiceId: INV,
  ...over,
});

const supplierFacts = (over: Record<string, unknown> = {}) => ({
  id: SUPPLIER,
  companyName: "MSC Czech s.r.o.",
  dic: "CZ12345678",
  country: "CZ",
  paymentDays: 14,
  vatUnreliable: false,
  bankAccountPublished: true,
  vatCheckedAt: "2026-11-10T08:00:00Z",
  bankAccountsChangedAt: null,
  approvalStatus: "approved",
  rating: null,
  ...over,
});

const JOBS: Record<string, Record<string, unknown>> = {
  [SHIP_A]: { id: SHIP_A, jobNumber: "CZFCL00000023", customer: "ITTEC s.r.o.", status: "Booked", invoicingStatus: "", personInCharge: "u-boss@test.cz", holidayCover: "" },
  [SHIP_B]: { id: SHIP_B, jobNumber: "CZFCL00000030", customer: "Other a.s.", status: "Cancelled Shipment", invoicingStatus: "", personInCharge: "someone@test.cz", holidayCover: "" },
};

const claim = (over: Record<string, unknown> = {}) => ({
  id: "claim-1",
  shipmentId: SHIP_A,
  supplierInvoiceId: INV,
  supplier: "MSC",
  invoiceNumber: "FV-1",
  reason: "Damaged",
  amount: "",
  claimAmount: "100.00",
  claimCurrency: "EUR",
  status: "open",
  ...over,
});

/** The values and event the last decision wrote. */
const lastDecision = () => {
  const call = repo.decide.mock.calls.at(-1)!;
  return { current: call[1], values: call[2], event: call[3] };
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-17T10:00:00Z"));
  repo.byId.mockResolvedValue(header());
  repo.costLinesOf.mockResolvedValue([costLine()]);
  repo.masterLinesOf.mockResolvedValue([]);
  repo.events.mockResolvedValue([]);
  repo.sync.mockResolvedValue({ touched: [], gained: [] });
  repo.list.mockResolvedValue([header()]);
  repo.expectedLines.mockResolvedValue([]);
  repo.takeLinesOff.mockResolvedValue([{ table: "invoice_cost", lineId: LINE, ownerId: SHIP_A, category: "ocean_freight", description: "", realQty: null, realAmount: "1000.00", realCurrency: "EUR" }]);
  repo.decide.mockImplementation(async (_company: string, current: Header, values: Record<string, unknown>, _event: unknown, work?: (tx: unknown) => Promise<void>) => {
    if (work) await work(TX);
    return { ...current, ...values, version: current.version + 1 };
  });
  repo.countByStatus.mockResolvedValue(0);
  repo.bookedSince.mockResolvedValue([]);
  repo.seenIds.mockResolvedValue(new Set());
  clients.supplierFacts.mockImplementation(async ({ ids }: { ids: string[] }) => ({ suppliers: ids.includes(SUPPLIER) ? [supplierFacts()] : [] }));
  clients.shipmentBasics.mockImplementation(async ({ ids }: { ids: string[] }) => ({ shipments: ids.map((id) => JOBS[id]).filter(Boolean) }));
  clients.masterJobBasics.mockResolvedValue({ masterJobs: [] });
  clients.costClaims.mockResolvedValue({ claims: [] });
  clients.haulierInvoices.mockResolvedValue({ invoices: [], truncated: false });
  users.companyUsersWithRoles.mockResolvedValue([
    { id: "u-boss", email: "u-boss@test.cz", displayName: "Boss", role: "manager" },
    { id: "u-other", email: "u-other@test.cz", displayName: "Other", role: "admin" },
    { id: "u-clerk", email: "u-clerk@test.cz", displayName: "Clerk", role: "user" },
  ]);
  users.userEmailOf.mockImplementation(async (id: string) => `${id}@test.cz`);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("approve", () => {
  it("lets a manager approve a linked supplier's invoice, and answers it as it is now", async () => {
    repo.byId.mockResolvedValueOnce(header()).mockResolvedValue(header({ status: "approved", version: 4 }));
    const answer = await service.approve(manager, INV, 3);
    expect(lastDecision().current).toMatchObject({ id: INV, status: "booked", version: 3 });
    expect(lastDecision().values).toMatchObject({ status: "approved", decidedByUserId: "u-boss", decidedBy: "u-boss@test.cz", decisionReason: "", selfDecision: false });
    expect(lastDecision().event).toMatchObject({ action: "approved", fromStatus: "booked", toStatus: "approved", byUserId: "u-boss", payload: {} });
    expect(answer.invoice).toMatchObject({ id: INV, status: "approved", version: 4, supplier: "MSC Czech s.r.o." });
    expect(answer.canDecide).toBe(true);
  });

  it("is for managers only (D8)", async () => {
    await expect(service.approve(clerk, INV, 3)).rejects.toMatchObject({ code: "permission_denied" });
    expect(repo.byId).not.toHaveBeenCalled();
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one, and an invoice that is not there", async () => {
    await expect(service.approve(manager, "nope", 3)).rejects.toMatchObject({ code: "not_found" });
    repo.byId.mockResolvedValueOnce(null);
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "not_found" });
  });

  it("answers aborted when the invoice changed since it was read, or changes while it is approved", async () => {
    await expect(service.approve(manager, INV, 2)).rejects.toMatchObject({ code: "aborted" });
    expect(repo.decide).not.toHaveBeenCalled();
    repo.decide.mockResolvedValueOnce(null);
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "aborted" });
  });

  it("needs the supplier linked to a company the Customer Database still has (D13)", async () => {
    repo.byId.mockResolvedValue(header({ supplierCustomerId: null, supplierKey: "n:msc" }));
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/Link the supplier first/) });
    expect(clients.supplierFacts).not.toHaveBeenCalled();
    // Linked to a company that is gone.
    repo.byId.mockResolvedValue(header());
    clients.supplierFacts.mockResolvedValue({ suppliers: [] });
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/Link the supplier first/) });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("does not approve when the VAT checks can't be read", async () => {
    clients.supplierFacts.mockRejectedValue(new Error("customers down"));
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("stops a Czech VAT payer that is unreliable or whose account is not published (D14)", async () => {
    clients.supplierFacts.mockResolvedValue({ suppliers: [supplierFacts({ vatUnreliable: true })] });
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/unreliable VAT payer/) });
    clients.supplierFacts.mockResolvedValue({ suppliers: [supplierFacts({ bankAccountPublished: false })] });
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/not published/) });
    // A supplier from abroad is not checked in the Czech register.
    clients.supplierFacts.mockResolvedValue({ suppliers: [supplierFacts({ dic: "DE123456789", bankAccountPublished: false })] });
    await expect(service.approve(manager, INV, 3)).resolves.toBeDefined();
  });

  it("four eyes: the manager who entered it does not approve it while another manager can (D9)", async () => {
    repo.byId.mockResolvedValue(header({ enteredByUserId: "u-boss" }));
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/another manager approves it/) });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("lets the only manager approve what they entered, stored as a self-approval", async () => {
    repo.byId.mockResolvedValue(header({ enteredByUserId: "u-boss" }));
    users.companyUsersWithRoles.mockResolvedValue([
      { id: "u-boss", email: "", displayName: "", role: "manager" },
      { id: "u-clerk", email: "", displayName: "", role: "user" },
    ]);
    await service.approve(manager, INV, 3);
    expect(lastDecision().values).toMatchObject({ status: "approved", selfDecision: true });
    expect(lastDecision().event).toMatchObject({ payload: { selfDecision: true } });
  });

  it("does not approve an approved or a refused invoice", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/approved already/) });
    repo.byId.mockResolvedValue(header({ status: "refused", decisionReason: "Wrong rate" }));
    await expect(service.approve(manager, INV, 3)).rejects.toMatchObject({ code: "failed_precondition" });
  });
});

describe("refuse", () => {
  it("needs a reason the supplier is told (D8, D12)", async () => {
    await expect(service.refuse(manager, INV, 3, "  ")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.refuse(manager, INV, 3, " no ")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.byId).not.toHaveBeenCalled();
  });

  it("is for managers only", async () => {
    await expect(service.refuse(clerk, INV, 3, "Wrong rate")).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("takes the lines off the jobs and keeps them on the invoice, in the decision's own transaction", async () => {
    await service.refuse(manager, INV, 3, "  Wrong rate applied  ");
    expect(lastDecision().values).toMatchObject({ status: "refused", decidedByUserId: "u-boss", decisionReason: "Wrong rate applied", selfDecision: false });
    expect(lastDecision().event).toMatchObject({ action: "refused", fromStatus: "booked", toStatus: "refused", reason: "Wrong rate applied" });
    expect(repo.takeLinesOff).toHaveBeenCalledWith(TX, COMPANY, INV);
    expect(repo.storeRefusedLines).toHaveBeenCalledWith(TX, COMPANY, INV, [expect.objectContaining({ lineId: LINE, realAmount: "1000.00" })]);
  });

  it("refuses an approved invoice too, but not a paid or a refused one", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await service.refuse(manager, INV, 3, "Wrong rate");
    expect(lastDecision().event).toMatchObject({ fromStatus: "approved" });
    repo.decide.mockClear();
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10" }));
    await expect(service.refuse(manager, INV, 3, "Wrong rate")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/take the payment back first/) });
    repo.byId.mockResolvedValue(header({ status: "refused" }));
    await expect(service.refuse(manager, INV, 3, "Wrong rate")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/refused already/) });
    expect(repo.decide).not.toHaveBeenCalled();
    expect(repo.takeLinesOff).toHaveBeenCalledTimes(1);
  });

  it("takes nothing off when the invoice changed meanwhile", async () => {
    await expect(service.refuse(manager, INV, 2, "Wrong rate")).rejects.toMatchObject({ code: "aborted" });
    // The repository runs the work only once it wrote the decision.
    repo.decide.mockResolvedValueOnce(null);
    await expect(service.refuse(manager, INV, 3, "Wrong rate")).rejects.toMatchObject({ code: "aborted" });
    expect(repo.takeLinesOff).not.toHaveBeenCalled();
  });
});

describe("markPaid", () => {
  beforeEach(() => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
  });

  it("notes the day for the whole invoice and its job lines (D11)", async () => {
    await service.markPaid(manager, INV, 3, " 2026-11-15 ");
    const { values, event } = lastDecision();
    expect(values).toMatchObject({ paidOn: "2026-11-15", paidByUserId: "u-boss", paidBy: "u-boss@test.cz" });
    expect(values.paidAt).toBeInstanceOf(Date);
    expect(values).not.toHaveProperty("status");
    expect(event).toMatchObject({ action: "paid", fromStatus: "approved", toStatus: "approved", payload: { paidOn: "2026-11-15" } });
    expect(repo.setLinesPaid).toHaveBeenCalledWith(TX, COMPANY, INV, { paidOn: "2026-11-15", paidAt: values.paidAt, paidByUserId: "u-boss", paidBy: "u-boss@test.cz" });
    expect(clients.costClaims).toHaveBeenCalledWith({ shipmentIds: [SHIP_A] });
    expect(clients.costClaims).toHaveBeenCalledWith({ supplierInvoiceIds: [INV] });
  });

  it("is for managers only, with a real day", async () => {
    await expect(service.markPaid(clerk, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.markPaid(manager, INV, 3, "15.11.2026")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.markPaid(manager, INV, 3, "2026-02-30")).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("pays only an approved invoice", async () => {
    repo.byId.mockResolvedValue(header({ status: "booked" }));
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/Approve the invoice first/) });
    expect(repo.setLinesPaid).not.toHaveBeenCalled();
  });

  it("is held by an open claim tied to it, or typed with its number on one of its jobs (D15)", async () => {
    clients.costClaims.mockImplementation(async (q: { shipmentIds?: string[] }) => ({ claims: q.shipmentIds ? [] : [claim()] }));
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/claim on this invoice is open/) });
    clients.costClaims.mockImplementation(async (q: { shipmentIds?: string[] }) => ({ claims: q.shipmentIds ? [claim({ supplierInvoiceId: null, invoiceNumber: "fv-1" })] : [] }));
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "failed_precondition" });
    // A settled claim holds nothing; one with another number on the job is another invoice's.
    clients.costClaims.mockResolvedValue({ claims: [claim({ status: "accepted" }), claim({ id: "c2", supplierInvoiceId: null, invoiceNumber: "FV-2" })] });
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).resolves.toBeDefined();
  });

  it("does not pay when the claims can't be read", async () => {
    clients.costClaims.mockRejectedValue(new Error("shipments down"));
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "unavailable" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("refuses a day after today, before it was booked, or a second payment", async () => {
    await expect(service.markPaid(manager, INV, 3, "2026-11-18")).rejects.toMatchObject({ message: expect.stringMatching(/after today/) });
    await expect(service.markPaid(manager, INV, 3, "2026-11-02")).rejects.toMatchObject({ message: expect.stringMatching(/before it was booked \(2026-11-03\)/) });
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10" }));
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ message: expect.stringMatching(/marked paid already/) });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("answers aborted when another manager decided first", async () => {
    await expect(service.markPaid(manager, INV, 4, "2026-11-15")).rejects.toMatchObject({ code: "aborted" });
    repo.decide.mockResolvedValueOnce(null);
    await expect(service.markPaid(manager, INV, 3, "2026-11-15")).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("taking an approval or a payment back", () => {
  it("sends an approved, unpaid invoice back to wait for approval, with a reason", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved", decidedByUserId: "u-other", decidedBy: "u-other@test.cz", selfDecision: true }));
    await service.takeBackApproval(manager, INV, 3, "Approved by mistake");
    expect(lastDecision().values).toEqual({ status: "booked", decidedByUserId: null, decidedBy: "", decidedAt: null, decisionReason: "", selfDecision: false });
    expect(lastDecision().event).toMatchObject({ action: "approval_taken_back", fromStatus: "approved", toStatus: "booked", reason: "Approved by mistake" });
  });

  it("takes back only an approval that is there and not paid, with a reason, by a manager", async () => {
    await expect(service.takeBackApproval(clerk, INV, 3, "Mistake")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.takeBackApproval(manager, INV, 3, "")).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.takeBackApproval(manager, INV, 3, "Mistake")).rejects.toMatchObject({ code: "failed_precondition", message: "This invoice is not approved" });
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10" }));
    await expect(service.takeBackApproval(manager, INV, 3, "Mistake")).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/take the payment back first/) });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("takes a payment back with a reason: the lines are unpaid again, the old day kept in the history", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10", paidBy: "u-other@test.cz" }));
    await service.takeBackPayment(manager, INV, 3, "Noted on the wrong invoice");
    expect(lastDecision().values).toEqual({ paidOn: null, paidAt: null, paidByUserId: null, paidBy: "" });
    expect(lastDecision().event).toMatchObject({ action: "payment_taken_back", fromStatus: "approved", toStatus: "approved", reason: "Noted on the wrong invoice", payload: { paidOn: "2026-11-10" } });
    expect(repo.setLinesPaid).toHaveBeenCalledWith(TX, COMPANY, INV, null);
  });

  it("takes back only a payment that is there, with a reason, by a manager", async () => {
    await expect(service.takeBackPayment(clerk, INV, 3, "Mistake")).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.takeBackPayment(manager, INV, 3, "x")).rejects.toMatchObject({ code: "invalid_argument" });
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await expect(service.takeBackPayment(manager, INV, 3, "Mistake")).rejects.toMatchObject({ code: "failed_precondition", message: "This invoice is not marked paid" });
    expect(repo.setLinesPaid).not.toHaveBeenCalled();
  });
});

describe("linkSupplier", () => {
  const assertSupplier = vi.fn(async () => undefined);
  beforeEach(() => {
    repo.byId.mockResolvedValue(header({ supplierCustomerId: null, supplierKey: "n:msc" }));
    repo.linkSupplier.mockImplementation(async (_c: string, current: Header) => ({ ...current, supplierCustomerId: SUPPLIER, version: current.version + 1 }));
  });

  it("links a booked invoice to a supplier of the Customer Database, named as it is there (D13)", async () => {
    await service.linkSupplier(manager, INV, 3, SUPPLIER, assertSupplier);
    expect(assertSupplier).toHaveBeenCalledWith(SUPPLIER);
    expect(repo.linkSupplier).toHaveBeenCalledWith(
      COMPANY,
      expect.objectContaining({ id: INV, version: 3 }),
      { id: SUPPLIER, name: "MSC Czech s.r.o." },
      expect.objectContaining({ action: "details_changed", byUserId: "u-boss", payload: { supplierCustomerId: SUPPLIER, from: "MSC" } }),
    );
  });

  it("answers the invoice the lines are on when they joined the supplier's invoice of that number", async () => {
    repo.linkSupplier.mockResolvedValue(header({ id: OTHER_INV, version: 8 }));
    repo.byId.mockResolvedValueOnce(header({ supplierCustomerId: null, supplierKey: "n:msc" })).mockResolvedValue(header({ id: OTHER_INV, version: 8 }));
    const answer = await service.linkSupplier(manager, INV, 3, SUPPLIER, assertSupplier);
    expect(repo.byId).toHaveBeenLastCalledWith(COMPANY, OTHER_INV);
    expect(answer.invoice.id).toBe(OTHER_INV);
  });

  // The merge itself sends an approved invoice back to booked, in the repository's transaction; a paid one takes no
  // lines (the repository answers "paid", writing nothing).
  it("refuses to merge the lines into the supplier's invoice that is paid already", async () => {
    repo.linkSupplier.mockResolvedValue("paid");
    repo.byId.mockResolvedValue(header({ supplierCustomerId: null, supplierKey: "n:msc" }));
    await expect(service.linkSupplier(manager, INV, 3, SUPPLIER, assertSupplier)).rejects.toMatchObject({ code: "failed_precondition" });
  });

  it("is for a manager, a supplier id, an invoice waiting for approval, and a supplier the user may pick", async () => {
    await expect(service.linkSupplier(clerk, INV, 3, SUPPLIER, assertSupplier)).rejects.toMatchObject({ code: "permission_denied" });
    await expect(service.linkSupplier(manager, INV, 3, "MSC", assertSupplier)).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.linkSupplier(manager, INV, 2, SUPPLIER, assertSupplier)).rejects.toMatchObject({ code: "aborted" });
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await expect(service.linkSupplier(manager, INV, 3, SUPPLIER, assertSupplier)).rejects.toMatchObject({ code: "failed_precondition" });
    repo.byId.mockResolvedValue(header({ supplierCustomerId: null }));
    const refused = Object.assign(new Error("not a supplier"), { code: "failed_precondition" });
    await expect(service.linkSupplier(manager, INV, 3, SUPPLIER, vi.fn(async () => Promise.reject(refused)))).rejects.toBe(refused);
    expect(repo.linkSupplier).not.toHaveBeenCalled();
  });

  it("answers aborted when the invoice changed meanwhile", async () => {
    repo.linkSupplier.mockResolvedValue(null);
    await expect(service.linkSupplier(manager, INV, 3, SUPPLIER, assertSupplier)).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("setDetails", () => {
  it("lets anyone change the details of an invoice waiting for approval, as on the document", async () => {
    await service.setDetails(clerk, INV, 3, { issueDate: "2026-11-01", dueDate: " ", totalNet: "1000.50", currency: " eur ", kind: "credit_note" });
    const { values, event } = lastDecision();
    expect(values).toEqual({ issueDate: "2026-11-01", dueDate: null, totalNet: "1000.50", currency: "EUR", kind: "credit_note" });
    expect(event).toMatchObject({
      action: "details_changed",
      fromStatus: "booked",
      byUserId: "u-clerk",
      payload: { issueDate: { from: null, to: "2026-11-01" }, dueDate: { from: null, to: null }, totalNet: { from: null, to: "1000.50" }, currency: { from: "EUR", to: "EUR" }, kind: { from: "invoice", to: "credit_note" } },
    });
  });

  it("lets only a manager change an approved invoice; nobody a paid or refused one", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await expect(service.setDetails(clerk, INV, 3, { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "permission_denied" });
    await service.setDetails(manager, INV, 3, { dueDate: "2026-12-01" });
    expect(lastDecision().values).toEqual({ dueDate: "2026-12-01" });
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10" }));
    await expect(service.setDetails(manager, INV, 3, { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "failed_precondition" });
    repo.byId.mockResolvedValue(header({ status: "refused" }));
    await expect(service.setDetails(manager, INV, 3, { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "failed_precondition" });
    expect(repo.decide).toHaveBeenCalledTimes(1);
  });

  it("refuses a day that is no date, an amount that is no number, and a currency that is not 3 letters", async () => {
    await expect(service.setDetails(clerk, INV, 3, { dueDate: "1.12.2026" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.setDetails(clerk, INV, 3, { totalGross: "12,50" })).rejects.toMatchObject({ code: "invalid_argument" });
    await expect(service.setDetails(clerk, INV, 3, { currency: "EURO" })).rejects.toMatchObject({ code: "invalid_argument" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("writes nothing when nothing is given, and nothing over a newer version", async () => {
    await service.setDetails(clerk, INV, 3, {});
    expect(repo.decide).not.toHaveBeenCalled();
    await expect(service.setDetails(clerk, INV, 2, { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "aborted" });
    repo.decide.mockResolvedValueOnce(null);
    await expect(service.setDetails(clerk, INV, 3, { dueDate: "2026-12-01" })).rejects.toMatchObject({ code: "aborted" });
  });
});

describe("forMe (the bell, D10)", () => {
  const booked = (id: string, over: Record<string, unknown> = {}) => header({ id, createdAt: new Date("2026-11-16T08:00:00Z"), ...over });
  const ids = ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002", "00000000-0000-4000-8000-000000000003", "00000000-0000-4000-8000-000000000004", "00000000-0000-4000-8000-000000000005", "00000000-0000-4000-8000-000000000006"];

  beforeEach(() => {
    repo.bookedSince.mockResolvedValue([
      booked(ids[0]!), // on my job, by the clerk: told
      booked(ids[1]!, { source: "backfill", enteredByUserId: null }), // gathered from older lines: not news
      booked(ids[2]!, { status: "refused" }),
      booked(ids[3]!, { enteredByUserId: "u-boss" }), // my own
      booked(ids[4]!), // seen already
      booked(ids[5]!), // not on my job
    ]);
    repo.seenIds.mockResolvedValue(new Set([ids[4]]));
    repo.costLinesOf.mockImplementation(async (_c: string, invoiceIds: string[]) =>
      invoiceIds.map((id) => costLine({ id: `line-${id}`, supplierInvoiceId: id, shipmentId: id === ids[5] ? SHIP_B : SHIP_A, realAmount: "1200.00" })),
    );
  });

  it("tells a manager how many wait, and of an invoice booked on their job by someone else, until seen", async () => {
    repo.countByStatus.mockResolvedValue(4);
    const answer = await service.forMe(manager);
    expect(repo.countByStatus).toHaveBeenCalledWith(COMPANY, "booked");
    expect(repo.bookedSince).toHaveBeenCalledWith(COMPANY, new Date("2026-11-10T10:00:00Z"));
    expect(repo.seenIds).toHaveBeenCalledWith(COMPANY, "u-boss", [ids[0], ids[4], ids[5]]);
    expect(answer.toApprove).toBe(4);
    expect(answer.booked).toEqual([
      {
        invoiceId: ids[0],
        supplier: "MSC Czech s.r.o.",
        invoiceNumber: "FV-1",
        jobs: ["CZFCL00000023"],
        amounts: [{ currency: "EUR", amount: 1200 }],
        aboveEstimate: true,
        jobBilled: false,
        bookedAt: "2026-11-16T08:00:00.000Z",
      },
    ]);
  });

  it("tells a user who is no manager nothing of approvals", async () => {
    const answer = await service.forMe({ ...clerk, userID: "u-boss" });
    expect(repo.countByStatus).not.toHaveBeenCalled();
    expect(answer.toApprove).toBe(0);
    expect(answer.booked).toHaveLength(1);
  });

  it("tells a holiday cover too", async () => {
    clients.shipmentBasics.mockResolvedValue({ shipments: [{ ...JOBS[SHIP_A], personInCharge: "x@test.cz", holidayCover: "U-BOSS@test.cz " }] });
    expect((await service.forMe(manager)).booked.map((b) => b.invoiceId)).toEqual([ids[0]]);
  });

  it("answers the count alone when who the user is can't be read", async () => {
    repo.countByStatus.mockResolvedValue(2);
    users.userEmailOf.mockRejectedValue(new Error("auth down"));
    expect(await service.forMe(manager)).toEqual({ toApprove: 2, booked: [] });
    expect(repo.bookedSince).not.toHaveBeenCalled();
  });

  it("marks seen only ids", async () => {
    await service.seen(manager, [ids[0]!, "nope", ids[0]!]);
    expect(repo.markSeen).toHaveBeenCalledWith(COMPANY, "u-boss", [ids[0]]);
  });
});

describe("beforeLineChange", () => {
  const actor = { userID: "u-clerk", companyID: COMPANY };
  const line = (over: Record<string, unknown> = {}) => costLine(over) as unknown as Parameters<typeof service.beforeLineChange>[1];

  it("does nothing for a line on no supplier invoice", async () => {
    await service.beforeLineChange(actor, line({ supplierInvoiceId: null }), { realAmount: "5.00", paidOn: "2026-11-10" });
    await service.beforeLineChange(actor, line({ supplierInvoiceId: null }), "delete");
    expect(repo.byId).not.toHaveBeenCalled();
  });

  it("refuses a Paid day typed on a line of an invoice: it is noted for the whole invoice (D11)", async () => {
    await expect(service.beforeLineChange(actor, line(), { paidOn: "2026-11-10" })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/Accounts Payable/) });
    await expect(service.beforeLineChange(actor, line({ paidOn: "2026-11-10" }), { paidOn: null })).rejects.toMatchObject({ code: "failed_precondition" });
    // The same day again is no change.
    await service.beforeLineChange(actor, line({ paidOn: "2026-11-10" }), { paidOn: "2026-11-10", sortOrder: 2 });
    expect(repo.byId).not.toHaveBeenCalled();
  });

  it("keeps a paid invoice's lines as paid: no change of what it bills, no unticking Received, no delete", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved", paidOn: "2026-11-10" }));
    await expect(service.beforeLineChange(actor, line(), { realAmount: "1100.00" })).rejects.toMatchObject({ code: "failed_precondition", message: expect.stringMatching(/FV-1 is marked paid \(2026-11-10\)/) });
    await expect(service.beforeLineChange(actor, line(), { received: false })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.beforeLineChange(actor, line(), "delete")).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.beforeLineChange(actor, line(), { invoiceNumber: "FV-2" })).rejects.toMatchObject({ code: "failed_precondition" });
    await expect(service.beforeLineChange(actor, line(), { supplierCustomerId: null })).rejects.toMatchObject({ code: "failed_precondition" });
    // What it does not bill stays open.
    await service.beforeLineChange(actor, line(), { description: "Ocean freight Hamburg", sortOrder: 3, estAmount: "950.00" });
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("sends an approved invoice back to be approved before a change of what it bills", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved", decidedByUserId: "u-boss" }));
    await service.beforeLineChange(actor, line(), { realAmount: "1100.00", realCurrency: "EUR" });
    expect(repo.byId).toHaveBeenCalledWith(COMPANY, INV);
    expect(lastDecision().values).toEqual({ status: "booked", decidedByUserId: null, decidedBy: "", decidedAt: null, decisionReason: "", selfDecision: false });
    expect(lastDecision().event).toMatchObject({ action: "line_changed", fromStatus: "approved", toStatus: "booked", byUserId: "u-clerk", by: "u-clerk@test.cz", payload: { line: LINE, changed: ["realAmount"] } });
  });

  it("sends it back when a line goes, and still when who changed it can't be read", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    users.userEmailOf.mockRejectedValue(new Error("auth down"));
    await service.beforeLineChange({ userID: "", companyID: COMPANY }, line(), "delete");
    expect(lastDecision().event).toMatchObject({ byUserId: null, by: "", payload: { changed: ["deleted"] } });
  });

  it("leaves an approved invoice approved when only Received is unticked or nothing it bills changes", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await service.beforeLineChange(actor, line(), { received: false });
    expect(repo.byId).toHaveBeenCalledTimes(1);
    expect(repo.decide).not.toHaveBeenCalled();
  });

  it("does nothing when the values given are the ones the line has", async () => {
    await service.beforeLineChange(actor, line(), { realAmount: "1000.00", realCurrency: "EUR", invoiceNumber: "FV-1", vendor: "MSC", supplierCustomerId: SUPPLIER, haulierId: null, received: true });
    // A supplier picked as none and one never set are the same.
    await service.beforeLineChange(actor, line({ supplierCustomerId: null }), { supplierCustomerId: "" });
    expect(repo.byId).not.toHaveBeenCalled();
  });

  it("leaves a booked or a refused invoice as it is", async () => {
    repo.byId.mockResolvedValue(header({ status: "booked" }));
    await service.beforeLineChange(actor, line(), { realAmount: "1100.00" });
    repo.byId.mockResolvedValue(header({ status: "refused" }));
    await service.beforeLineChange(actor, line(), "delete");
    repo.byId.mockResolvedValue(null);
    await service.beforeLineChange(actor, line(), "delete");
    expect(repo.decide).not.toHaveBeenCalled();
  });

  // The invoice changed meanwhile (another edit bumped its version) and is still approved: the line write waits.
  it("does not let the line change go on when the invoice could not be sent back (changed meanwhile)", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    repo.decide.mockResolvedValue(null);
    await expect(service.beforeLineChange(actor, line(), { realAmount: "1100.00" })).rejects.toMatchObject({ code: "aborted" });
  });

  // Amounts are compared as numbers: "1000" from a reading is the stored "1000.00".
  it("takes the same amount written another way as no change", async () => {
    repo.byId.mockResolvedValue(header({ status: "approved" }));
    await service.beforeLineChange(actor, line(), { realAmount: "1000" });
    expect(repo.decide).not.toHaveBeenCalled();
  });
});

describe("afterLineWrite", () => {
  const actor = { userID: "u-clerk", companyID: COMPANY };

  it("matches the lines again, as who wrote them, and answers the invoices it touched", async () => {
    repo.sync.mockResolvedValue({ touched: [INV, OTHER_INV], gained: [] });
    await expect(service.afterLineWrite(actor, { shipmentIds: [SHIP_A] }, "reading")).resolves.toEqual([INV, OTHER_INV]);
    expect(repo.sync).toHaveBeenCalledWith(COMPANY, { shipmentIds: [SHIP_A] }, { source: "reading", userId: "u-clerk", userEmail: "u-clerk@test.cz" });
  });

  it("never fails the write: an error is logged and nothing is answered", async () => {
    repo.sync.mockRejectedValue(new Error("deadlock"));
    await expect(service.afterLineWrite(actor, { masterJobIds: ["m1"] }, "master_job")).resolves.toEqual([]);
    expect(log.error).toHaveBeenCalled();
    repo.sync.mockResolvedValue({ touched: [INV], gained: [INV] });
    repo.byId.mockRejectedValue(new Error("db down"));
    await expect(service.afterLineWrite(actor, { shipmentIds: [SHIP_A] }, "typed")).resolves.toEqual([]);
  });

  it("matches still when who wrote it can't be read, and without asking when nobody is known", async () => {
    users.userEmailOf.mockRejectedValueOnce(new Error("auth down"));
    await service.afterLineWrite(actor, { shipmentIds: [SHIP_A] }, "typed");
    expect(repo.sync).toHaveBeenLastCalledWith(COMPANY, { shipmentIds: [SHIP_A] }, { source: "typed", userId: "u-clerk", userEmail: "" });
    users.userEmailOf.mockClear();
    await service.afterLineWrite({ userID: "", companyID: COMPANY }, { shipmentIds: [SHIP_A] }, "typed");
    expect(users.userEmailOf).not.toHaveBeenCalled();
    expect(repo.sync).toHaveBeenLastCalledWith(COMPANY, { shipmentIds: [SHIP_A] }, { source: "typed", userId: null, userEmail: "" });
  });

  it("sends an approved, unpaid invoice that gained a line back to be approved; a booked or paid one stays", async () => {
    repo.sync.mockResolvedValue({ touched: [INV, OTHER_INV, "x"], gained: [INV, OTHER_INV, "x"] });
    repo.byId.mockImplementation(async (_c: string, id: string) =>
      id === INV ? header({ status: "approved" }) : id === OTHER_INV ? header({ id: OTHER_INV, status: "approved", paidOn: "2026-11-10" }) : header({ id, status: "booked" }),
    );
    await service.afterLineWrite(actor, { shipmentIds: [SHIP_A] }, "typed");
    expect(repo.decide).toHaveBeenCalledTimes(1);
    expect(lastDecision().current).toMatchObject({ id: INV });
    expect(lastDecision().event).toMatchObject({ action: "line_changed", payload: { changed: ["line added"] } });
  });
});

describe("payables (the page)", () => {
  const H = (n: number) => `00000000-0000-4000-8000-0000000000a${n}`;
  beforeEach(() => {
    repo.list.mockResolvedValue([
      header({ id: H(1), status: "approved", dueDate: "2026-11-10", numberKey: "A1", invoiceNumber: "A1" }), // to pay, 7 days overdue
      header({ id: H(2), status: "booked", receivedAt: new Date("2026-11-10T09:00:00Z"), numberKey: "A2", invoiceNumber: "A2" }), // due by terms 24 Nov
      header({ id: H(3), status: "refused", decisionReason: "Wrong", numberKey: "A3", refusedLines: [{ table: "invoice_cost", lineId: "l", ownerId: SHIP_A, category: "", description: "", realQty: "2", realAmount: "25.00", realCurrency: "EUR" }] }),
      header({ id: H(4), status: "approved", paidOn: "2026-11-12", dueDate: "2026-11-01", numberKey: "A4" }), // paid: not overdue
      header({ id: H(5), status: "approved", kind: "credit_note", numberKey: "A5" }), // a credit note is not paid out
      header({ id: H(6), status: "booked", supplierCustomerId: null, supplierKey: "n:other", numberKey: "A1", invoiceNumber: "A1", receivedAt: null, createdAt: new Date("2026-11-15T09:00:00Z") }),
    ]);
    repo.costLinesOf.mockResolvedValue([
      costLine({ id: "l1", supplierInvoiceId: H(1), realAmount: "500.00", realQty: "2" }),
      costLine({ id: "l2", supplierInvoiceId: H(2), realAmount: "200.00", realCurrency: "USD", estAmount: null }),
      costLine({ id: "l4", supplierInvoiceId: H(4), realAmount: "80.00" }),
      costLine({ id: "l5", supplierInvoiceId: H(5), realAmount: "-30.00", estAmount: null }),
    ]);
    repo.expectedLines.mockResolvedValue([
      costLine({ id: "e1", supplierInvoiceId: null, realAmount: null, invoiceNumber: "", estAmount: "150.00", estQty: "2", estCurrency: "CZK", createdAt: new Date("2026-11-05T09:00:00Z") }),
      costLine({ id: "e2", shipmentId: SHIP_B, supplierInvoiceId: null, realAmount: null, invoiceNumber: "", estAmount: "999.00" }), // a cancelled job
    ]);
    clients.costClaims.mockImplementation(async (q: { supplierInvoiceIds?: string[] }) => ({ claims: q.supplierInvoiceIds ? [claim({ supplierInvoiceId: H(2) })] : [] }));
  });

  it("says which invoices came on or after the day their job was first invoiced to the customer", async () => {
    // The job of every line here was billed on 5 Nov: A1 was booked on 3 Nov (before), A2 on 10 Nov (after).
    vi.mocked(invoiceRepository.firstBilledOn).mockResolvedValueOnce(new Map([[SHIP_A, "2026-11-05"]]));
    const page = await service.payables(manager);
    const row = (id: string) => page.invoices.find((i) => i.id === id)!;
    expect(row(H(1)).arrivedAfterBilling).toBe(false);
    expect(row(H(2)).arrivedAfterBilling).toBe(true);
    // A refused invoice has no lines on the job any more.
    expect(row(H(3)).arrivedAfterBilling).toBe(false);
  });

  it("gathers older lines first, then counts and totals per currency what is to pay, overdue and expected", async () => {
    const page = await service.payables(manager);
    expect(repo.sync).toHaveBeenCalledWith(COMPANY, { all: true }, { source: "backfill" });
    expect(page.today).toBe("2026-11-17");
    expect(page.counts).toEqual({ all: 6, toPay: 1, overdue: 1, toApprove: 2, refused: 1, claimed: 1, paid: 1, expected: 1 });
    expect(page.totals).toEqual({ toPay: [{ currency: "EUR", amount: 1000 }], overdue: [{ currency: "EUR", amount: 1000 }], expected: [{ currency: "CZK", amount: 300 }] });
    expect(page.dueThisWeek).toBe(1);
    expect(page.truncated).toBe(false);
    expect(page.canDecide).toBe(true);

    const row = (id: string) => page.invoices.find((i) => i.id === id)!;
    expect(row(H(1))).toMatchObject({ due: "2026-11-10", dueSource: "invoice", daysOverdue: 7, bookedOn: "2026-11-03", amounts: [{ currency: "EUR", amount: 1000 }], jobs: ["CZFCL00000023"], mine: true, aboveEstimate: true });
    expect(row(H(1)).lines[0]).toMatchObject({ kind: "job", jobNumber: "CZFCL00000023", estimate: 900, amount: 1000, difference: 100 });
    expect(row(H(2))).toMatchObject({ due: "2026-11-24", dueSource: "terms", daysOverdue: 0, claimed: true, amounts: [{ currency: "USD", amount: 200 }] });
    expect(row(H(2)).claims).toEqual([expect.objectContaining({ id: "claim-1", linked: true, status: "open" })]);
    // A refused invoice shows what it billed when refused; its lines are off the jobs.
    expect(row(H(3))).toMatchObject({ amounts: [{ currency: "EUR", amount: 50 }], daysOverdue: 0 });
    expect(row(H(4))).toMatchObject({ paidOn: "2026-11-12", daysOverdue: 0 });
    expect(row(H(5))).toMatchObject({ due: null, dueSource: "none", amounts: [{ currency: "EUR", amount: -30 }] });
    // The same number from two suppliers among the live invoices: both marked; the unlinked one has no terms.
    expect(row(H(1)).marks).toEqual(["same_number_other_supplier"]);
    expect(row(H(6)).marks).toEqual(["not_linked", "no_terms", "same_number_other_supplier"]);
    expect(row(H(6))).toMatchObject({ supplier: "MSC", bookedOn: "2026-11-15", lines: [] });

    expect(page.expected).toEqual([
      expect.objectContaining({ lineId: "e1", jobNumber: "CZFCL00000023", estimate: 300, currency: "CZK", createdOn: "2026-11-05", mine: true, jobStatus: "Booked" }),
    ]);
  });

  it("still answers the page when the lines could not be gathered, or the supplier facts or claims not read", async () => {
    repo.sync.mockRejectedValue(new Error("lock timeout"));
    clients.supplierFacts.mockRejectedValue(new Error("customers down"));
    clients.costClaims.mockRejectedValue(new Error("shipments down"));
    const page = await service.payables(clerk);
    expect(log.error).toHaveBeenCalled();
    expect(page.counts.all).toBe(6);
    expect(page.counts.claimed).toBe(0);
    expect(page.canDecide).toBe(false);
    // Without the facts the due day is the invoice's own or none.
    expect(page.invoices.find((i) => i.id === H(2))).toMatchObject({ supplier: "MSC", due: null, marks: ["no_terms"] });
  });

  it("says when there are more invoices than the list holds", async () => {
    repo.list.mockResolvedValue(Array.from({ length: 2001 }, (_, i) => header({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, numberKey: `N${i}` })));
    repo.costLinesOf.mockResolvedValue([]);
    const page = await service.payables(manager);
    expect(repo.list).toHaveBeenCalledWith(COMPANY, 2001);
    expect(page.truncated).toBe(true);
    expect(page.invoices).toHaveLength(2000);
  });

  it("lists Trucking's haulier invoices for superadmins only (D17)", async () => {
    clients.haulierInvoices.mockResolvedValue({
      truncated: false,
      invoices: [
        { id: "h1", haulierCustomerId: "hc", haulierName: "Haulier XY", invoiceNumber: "2611004", issueDate: "2026-11-05", dueDate: "2026-11-12", currency: "CZK", net: 100, vat: 21, gross: 121, status: "APPROVED", paidOn: null, claimed: 0, refs: ["TCZ1"] },
        { id: "h2", haulierCustomerId: "hc", haulierName: "Haulier XY", invoiceNumber: "2611005", issueDate: null, dueDate: "2026-11-01", currency: "CZK", net: 1, vat: 0, gross: 1, status: "REJECTED", paidOn: null, claimed: 0, refs: [] },
      ],
    });
    const asManager = await service.payables(manager);
    expect(asManager.haulier).toEqual({ status: "hidden", invoices: [], truncated: false });
    expect(clients.haulierInvoices).not.toHaveBeenCalled();

    const asRoot = await service.payables(superadmin);
    expect(asRoot.haulier.status).toBe("included");
    expect(asRoot.haulier.invoices.map((i) => [i.id, i.daysOverdue])).toEqual([
      ["h1", 5],
      ["h2", 0],
    ]);
    // Never added to the totals: they are with VAT, the lines without.
    expect(asRoot.totals.toPay).toEqual([{ currency: "EUR", amount: 1000 }]);

    clients.haulierInvoices.mockRejectedValue(new Error("trucking down"));
    expect((await service.payables(superadmin)).haulier).toEqual({ status: "unavailable", invoices: [], truncated: false });
  });
});

describe("detail", () => {
  it("answers the invoice with its history, newest first as kept, and a refused invoice's lines as they were", async () => {
    repo.byId.mockResolvedValue(
      header({
        status: "refused",
        decisionReason: "Wrong rate",
        refusedLines: [
          { table: "invoice_cost", lineId: "l1", ownerId: SHIP_A, category: "ocean_freight", description: "Sea", realQty: "2", realAmount: "100.00", realCurrency: "EUR" },
          { table: "master_job_cost", lineId: "m1", ownerId: "mj1", category: "thc", description: "", realQty: null, realAmount: null, realCurrency: "EUR" },
        ],
      }),
    );
    repo.costLinesOf.mockResolvedValue([]);
    repo.events.mockResolvedValue([{ id: "e1", action: "refused", fromStatus: "booked", toStatus: "refused", by: "u-boss@test.cz", reason: "Wrong rate", payload: {}, createdAt: new Date("2026-11-16T10:00:00Z") }]);
    const answer = await service.detail(clerk, INV);
    expect(answer.events).toEqual([{ id: "e1", action: "refused", fromStatus: "booked", toStatus: "refused", by: "u-boss@test.cz", reason: "Wrong rate", payload: {}, at: "2026-11-16T10:00:00.000Z" }]);
    expect(answer.refusedLines).toEqual([
      { kind: "job", ownerId: SHIP_A, category: "ocean_freight", description: "Sea", amount: 200, currency: "EUR" },
      { kind: "master_job", ownerId: "mj1", category: "thc", description: "", amount: null, currency: "EUR" },
    ]);
    expect(answer.invoice.amounts).toEqual([{ currency: "EUR", amount: 200 }]);
    expect(answer.canDecide).toBe(false);
  });
});
