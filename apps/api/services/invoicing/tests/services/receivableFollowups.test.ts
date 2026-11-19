import { beforeEach, describe, expect, it, vi } from "vitest";

// The receivable_state follow-up (Accounts Receivable): which issued documents write it, and what it tells the
// customer's list when it is sent - the state as it is then, read fresh.
const receivables = vi.hoisted(() => ({
  figuresOne: vi.fn(),
  creditNotesOf: vi.fn(),
  paymentsOf: vi.fn(),
  ensureRows: vi.fn(),
  notCarriedChecked: vi.fn(),
  markCarriedChecked: vi.fn(),
  carryOver: vi.fn(),
}));
vi.mock("../../repositories/receivable.repository", () => ({ receivableRepository: receivables }));
vi.mock("../../repositories/invoiceFollowupOutbox.repository", () => ({ invoiceFollowupOutboxRepository: {} }));
vi.mock("../../repositories/invoice.repository", () => ({ invoiceRepository: {} }));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: {} }));
const clients = vi.hoisted(() => ({ invoiceReceivable: vi.fn(), invoicePost: vi.fn(), invoiceStatuses: vi.fn() }));
vi.mock("~encore/clients", () => ({
  customers: {
    _internalCustomerInvoiceReceivable: clients.invoiceReceivable,
    _internalCustomerInvoicePost: clients.invoicePost,
    _internalCustomerInvoiceStatuses: clients.invoiceStatuses,
  },
  shipments: {},
}));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import {
  followupsOfCancellation,
  followupsOfCreditNote,
  followupsOfInvoice,
  followupsOfPartialCreditNote,
  followupsOfReceivable,
  sendFollowup,
} from "../../services/invoiceFollowups.service";
import type { InvoiceFollowupOutboxRecord } from "../../schemas/invoiceFollowupOutbox.schema";
import { outboxGivesUp } from "../../../../lib/outbox/outboxRetry";
import type { InvoiceRecord } from "../../schemas/invoice.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
/** A receivable whose old Paid in the customer's list was carried over (or checked) already. */
const CHECKED = { carriedChecked: true, version: 2 };
const ACTOR = { userId: "u-boss", role: "manager" };

const doc = (over: Record<string, unknown> = {}) =>
  ({
    id: "inv1",
    companyId: COMPANY,
    shipmentId: "ship1",
    kind: "invoice",
    status: "issued",
    number: "INV2026CZ00000031-001",
    customerId: "cust1",
    issueDate: "2026-11-02",
    dueDate: "2026-11-16",
    currency: "CZK",
    gross: "1210.00",
    createdAt: new Date("2026-11-02T09:00:00Z"),
    ...over,
  }) as unknown as InvoiceRecord;

const row = (payload: Record<string, unknown>) =>
  ({ id: "o1", companyId: COMPANY, invoiceId: "cn1", shipmentId: "ship1", kind: "receivable_state", payload, actingUserId: "u-boss", actingRole: "manager", attempts: 1 }) as unknown as InvoiceFollowupOutboxRecord;

beforeEach(() => {
  vi.resetAllMocks();
  receivables.creditNotesOf.mockResolvedValue([]);
  receivables.paymentsOf.mockResolvedValue([]);
  clients.invoiceReceivable.mockResolvedValue({ ok: true });
});

describe("which documents write it", () => {
  const invoice = doc();
  const partial = doc({ id: "cn1", kind: "credit_note", number: "CN-1", gross: "-210.00", correctsInvoiceId: "inv1" });

  it("a payment or take-back: the invoice's own row", () => {
    expect(followupsOfReceivable(invoice, ACTOR)).toEqual([
      { kind: "receivable_state", payload: { invoiceId: "inv1" }, companyId: COMPANY, invoiceId: "inv1", shipmentId: "ship1", actingUserId: "u-boss", actingRole: "manager" },
    ]);
  });

  it("a credit note, full or partial: after the rows it wrote before, naming the invoice", () => {
    expect(followupsOfCreditNote(partial, invoice, ACTOR).map((r) => [r.kind, r.invoiceId, r.payload])).toEqual([
      ["customer_invoice", "cn1", expect.objectContaining({ invoiceId: "cn1", status: "Credited" })],
      ["mark_credited", "cn1", { invoiceNumbers: ["INV2026CZ00000031-001"] }],
      ["status_after_credit", "cn1", { shipmentId: "ship1" }],
      ["receivable_state", "cn1", { invoiceId: "inv1" }],
    ]);
    expect(followupsOfPartialCreditNote(partial, invoice, ACTOR).map((r) => [r.kind, r.payload])).toEqual([
      ["customer_invoice", expect.objectContaining({ invoiceId: "cn1", status: "Open", dueDate: "2026-11-16", amount: -210 })],
      ["status_after_credit", { shipmentId: "ship1" }],
      ["receivable_state", { invoiceId: "inv1" }],
    ]);
  });

  it("an issued invoice names itself in the customer's list; a cancellation writes no receivable state", () => {
    expect(followupsOfInvoice(invoice, ACTOR)[0]!.payload).toEqual({
      invoiceId: "inv1",
      customerId: "cust1",
      invoiceNumber: "INV2026CZ00000031-001",
      amount: 1210,
      currency: "CZK",
      dueDate: "2026-11-16",
      status: "Open",
      issuedAt: "2026-11-02",
    });
    expect(followupsOfCancellation(invoice, ACTOR).map((r) => r.kind)).toEqual(["mark_credited", "status_after_credit"]);
  });
});

describe("sending it", () => {
  it("tells what is left to pay now, the last day paid and the partial credit notes, as the acting user", async () => {
    receivables.figuresOne.mockResolvedValue({ invoice: doc(), credited: 210, paid: 500, lastPaidOn: "2026-11-14", receivable: CHECKED });
    receivables.creditNotesOf.mockResolvedValue([doc({ id: "cn1", number: "CN-1" })]);
    receivables.paymentsOf.mockResolvedValue([
      { paidOn: "2026-11-14", takenBackAt: null },
      { paidOn: "2026-11-15", takenBackAt: new Date() },
    ]);
    await sendFollowup(row({ invoiceId: "inv1" }));
    expect(receivables.figuresOne).toHaveBeenCalledWith(COMPANY, "inv1");
    expect(clients.invoiceReceivable).toHaveBeenCalledWith(
      { customerId: "cust1", invoiceId: "inv1", invoiceNumber: "INV2026CZ00000031-001", leftToPay: 500, lastPaidOn: "2026-11-14", settled: false, invoiceStatus: "issued", creditNoteNumbers: ["CN-1"] },
      { authData: { userID: "u-boss", companyID: COMPANY, role: "manager" } },
    );
  });

  it("settles a paid invoice, and leaves the full credit note of a credited one out of the partial ones", async () => {
    receivables.figuresOne.mockResolvedValue({ invoice: doc({ status: "credited" }), credited: 1210, paid: 300, lastPaidOn: "2026-11-14", receivable: CHECKED });
    receivables.creditNotesOf.mockResolvedValue([doc({ id: "cn1", number: "CN-1" }), doc({ id: "cn2", number: "CN-2" })]);
    receivables.paymentsOf.mockResolvedValue([{ paidOn: "2026-11-14", takenBackAt: null }]);
    await sendFollowup(row({ invoiceId: "inv1" }));
    // The invoice's own status goes with it: the customer's list makes it Credited, never Paid.
    expect(clients.invoiceReceivable).toHaveBeenCalledWith(expect.objectContaining({ leftToPay: -300, settled: true, invoiceStatus: "credited", creditNoteNumbers: ["CN-1"] }), expect.anything());
  });

  it("sends nothing for an invoice that is not there, and lets a refusal through to be retried", async () => {
    receivables.figuresOne.mockResolvedValue(null);
    await sendFollowup(row({ invoiceId: "inv1" }));
    expect(clients.invoiceReceivable).not.toHaveBeenCalled();
    receivables.figuresOne.mockResolvedValue({ invoice: doc(), credited: 0, paid: 0, lastPaidOn: null, receivable: CHECKED });
    clients.invoiceReceivable.mockRejectedValue(new Error("customers down"));
    await expect(sendFollowup(row({ invoiceId: "inv1" }))).rejects.toThrow("customers down");
  });

  it("passes the document's id with its entry in the customer's list", async () => {
    clients.invoicePost.mockResolvedValue({});
    const payload = { invoiceId: "inv1", customerId: "cust1", invoiceNumber: "INV-1", amount: 1, currency: "CZK", dueDate: "", status: "Open", issuedAt: "" };
    await sendFollowup({ ...row(payload), kind: "customer_invoice" } as InvoiceFollowupOutboxRecord);
    expect(clients.invoicePost).toHaveBeenCalledWith(payload, expect.anything());
  });

  describe("an invoice whose old Paid in the customer's list was not carried over yet", () => {
    const unchecked = { carriedChecked: false, version: 1 };
    const pending = [{ invoiceId: "inv1", number: "INV2026CZ00000031-001", customerId: "cust1", status: "issued", shipmentId: "ship1" }];

    beforeEach(() => {
      receivables.notCarriedChecked.mockResolvedValue(pending);
      receivables.carryOver.mockResolvedValue(["inv1"]);
    });

    it("carries it over first (a partial credit note's word never wipes the old Paid), then tells the state after it", async () => {
      receivables.figuresOne
        .mockResolvedValueOnce({ invoice: doc(), credited: 210, paid: 0, lastPaidOn: null, receivable: unchecked })
        .mockResolvedValue({ invoice: doc(), credited: 210, paid: 1000, lastPaidOn: null, receivable: CHECKED });
      clients.invoiceStatuses.mockResolvedValue({ items: [{ invoiceId: "inv1", status: "Paid", paidOn: null }] });
      await sendFollowup(row({ invoiceId: "inv1" }));
      expect(receivables.ensureRows).toHaveBeenCalledWith(COMPANY, { invoiceIds: ["inv1"] });
      expect(receivables.notCarriedChecked).toHaveBeenCalledWith(COMPANY, { invoiceIds: ["inv1"] }, 500);
      // As the company: the cron that sends this has nobody signed in, and the customers service needs a company.
      expect(clients.invoiceStatuses).toHaveBeenCalledWith(
        { items: [{ invoiceId: "inv1", number: "INV2026CZ00000031-001", customerId: "cust1" }] },
        { authData: { userID: "", companyID: COMPANY, role: "user" } },
      );
      expect(receivables.carryOver).toHaveBeenCalledWith(COMPANY, [{ invoiceId: "inv1", paid: true }], expect.any(Function));
      // It sends the state right after, so the carry-over writes no follow-up of its own.
      expect((receivables.carryOver.mock.calls[0]![2] as (i: unknown) => unknown[])(doc())).toEqual([]);
      expect(clients.invoiceReceivable).toHaveBeenCalledWith(expect.objectContaining({ leftToPay: 0, settled: true }), expect.anything());
      expect(receivables.carryOver.mock.invocationCallOrder[0]!).toBeLessThan(clients.invoiceReceivable.mock.invocationCallOrder[0]!);
    });

    it("tells nothing and is tried again later (a retryable error) when the customer's list can't be asked", async () => {
      receivables.figuresOne.mockResolvedValue({ invoice: doc(), credited: 210, paid: 0, lastPaidOn: null, receivable: unchecked });
      clients.invoiceStatuses.mockRejectedValue(new Error("customers down"));
      const err = await sendFollowup(row({ invoiceId: "inv1" })).catch((e: unknown) => e);
      expect(err).toMatchObject({ code: "unavailable" });
      expect(outboxGivesUp(err, 1)).toBe(false);
      expect(receivables.carryOver).not.toHaveBeenCalled();
      expect(clients.invoiceReceivable).not.toHaveBeenCalled();
    });

    it("is tried again later when the invoice is still not checked after asking", async () => {
      receivables.figuresOne.mockResolvedValue({ invoice: doc(), credited: 0, paid: 0, lastPaidOn: null, receivable: null });
      clients.invoiceStatuses.mockResolvedValue({ items: [] });
      await expect(sendFollowup(row({ invoiceId: "inv1" }))).rejects.toMatchObject({ code: "unavailable" });
      expect(clients.invoiceReceivable).not.toHaveBeenCalled();
    });
  });
});
