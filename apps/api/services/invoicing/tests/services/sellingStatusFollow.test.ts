import { beforeEach, describe, expect, it, vi } from "vitest";

// A charge added after invoicing (mock test council X1 / K14): what a selling line's write owes the
// shipment's statuses (services/sellingStatusFollow), the outbox rows it writes
// (invoiceFollowups followupsOfSellingChange), and what those rows do when they are sent - the job
// back to Not Invoiced as after a credit note, or Invoiced again as after an issue.
const repos = vi.hoisted(() => ({
  latestOpenInvoiceId: vi.fn(),
  listOpenInvoicesWithSources: vi.fn(),
  listLiveByShipments: vi.fn(),
  enqueue: vi.fn(),
  claimDue: vi.fn(),
}));
vi.mock("../../repositories/invoice.repository", () => ({
  invoiceRepository: { latestOpenInvoiceId: repos.latestOpenInvoiceId, listOpenInvoicesWithSources: repos.listOpenInvoicesWithSources },
}));
vi.mock("../../repositories/sellingCost.repository", () => ({ sellingCostRepository: { listLiveByShipments: repos.listLiveByShipments } }));
vi.mock("../../repositories/invoiceFollowupOutbox.repository", () => ({ invoiceFollowupOutboxRepository: { enqueue: repos.enqueue, claimDue: repos.claimDue } }));
vi.mock("../../repositories/receivable.repository", () => ({ receivableRepository: {} }));
const clients = vi.hoisted(() => ({ shipmentGet: vi.fn(), shipmentUpdate: vi.fn() }));
vi.mock("~encore/clients", () => ({ shipments: { shipmentGet: clients.shipmentGet, shipmentUpdate: clients.shipmentUpdate }, customers: {} }));
const auth = vi.hoisted(() => ({ getAuthData: vi.fn() }));
vi.mock("~encore/auth", () => auth);
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));

import log from "encore.dev/log";
import { followupsOfSellingChange, sendFollowup } from "../../services/invoiceFollowups.service";
import { chargeText, setChangeOf, statusesFollow } from "../../services/sellingStatusFollow";
import type { InvoiceFollowupOutboxRecord } from "../../schemas/invoiceFollowupOutbox.schema";
import type { InvoiceSellingCostRecord } from "../../schemas/invoiceSellingCost.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const SHIPMENT = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const TX = { tx: true } as never;

const line = (over: Partial<InvoiceSellingCostRecord> = {}) =>
  ({ id: "s1", shipmentId: SHIPMENT, category: "container_storage", description: "", qty: "2", amount: "150", currency: "EUR", invoice: true, ...over }) as InvoiceSellingCostRecord;

beforeEach(() => {
  vi.clearAllMocks();
  auth.getAuthData.mockReturnValue({ userID: "u-ops", companyID: COMPANY, role: "user" });
  repos.latestOpenInvoiceId.mockResolvedValue("inv-2");
  repos.enqueue.mockResolvedValue([]);
  repos.claimDue.mockResolvedValue([]);
});

describe("a selling line's write on a job with an open invoice", () => {
  it("owes a row as after a credit note when the line became a charge, named, under the job's newest open invoice - and sends it after", async () => {
    const follow = statusesFollow(COMPANY, SHIPMENT);
    await follow.after(TX, null, line());
    expect(repos.latestOpenInvoiceId).toHaveBeenCalledWith(SHIPMENT, COMPANY, TX);
    expect(repos.enqueue).toHaveBeenCalledWith(TX, [
      {
        companyId: COMPANY,
        invoiceId: "inv-2",
        shipmentId: SHIPMENT,
        actingUserId: "u-ops",
        actingRole: "user",
        kind: "status_after_credit",
        payload: { shipmentId: SHIPMENT, charge: "Container Storage 300.00 EUR" },
      },
    ]);
    // Sent once the write has committed: that invoice's rows only.
    await follow.deliver();
    expect(repos.claimDue).toHaveBeenCalledWith(expect.any(Number), "inv-2");
  });

  it("owes the same when a line is given a value, or its value changes", async () => {
    await statusesFollow(COMPANY, SHIPMENT).after(TX, line({ amount: "0" }), line());
    await statusesFollow(COMPANY, SHIPMENT).after(TX, line(), line({ amount: "175" }));
    expect(repos.enqueue.mock.calls.map(([, rows]) => (rows as { kind: string }[])[0]!.kind)).toEqual(["status_after_credit", "status_after_credit"]);
  });

  it("owes a row as after an issue when the line stops being a charge - deleted, or set to nothing - named as it was", async () => {
    await statusesFollow(COMPANY, SHIPMENT).after(TX, line(), null);
    await statusesFollow(COMPANY, SHIPMENT).after(TX, line({ description: "Late storage" }), line({ description: "Late storage", amount: "0" }));
    expect(repos.enqueue.mock.calls.map(([, rows]) => (rows as { kind: string; payload: unknown }[])[0]!)).toEqual([
      expect.objectContaining({ kind: "status_after_issue", payload: { shipmentId: SHIPMENT, charge: "Container Storage 300.00 EUR" } }),
      expect.objectContaining({ kind: "status_after_issue", payload: { shipmentId: SHIPMENT, charge: "Late storage 300.00 EUR" } }),
    ]);
  });

  it("owes nothing when the job's charges are as they were: its text, tick or VAT code changed, or a line of no value", async () => {
    const follow = statusesFollow(COMPANY, SHIPMENT);
    await follow.after(TX, line(), line({ description: "Storage 10 days", invoice: false }));
    await follow.after(TX, null, line({ amount: "0" }));
    await follow.after(TX, line({ amount: null }), null);
    expect(repos.latestOpenInvoiceId).not.toHaveBeenCalled();
    expect(repos.enqueue).not.toHaveBeenCalled();
    await follow.deliver();
    expect(repos.claimDue).not.toHaveBeenCalled();
  });

  it("owes nothing on a job with no open invoice: nothing is invoiced to move back from", async () => {
    repos.latestOpenInvoiceId.mockResolvedValue(null);
    const follow = statusesFollow(COMPANY, SHIPMENT);
    await follow.after(TX, null, line());
    expect(repos.enqueue).not.toHaveBeenCalled();
    await follow.deliver();
    expect(repos.claimDue).not.toHaveBeenCalled();
  });

  it("writes nothing without a signed-in user, and says so in the log", async () => {
    auth.getAuthData.mockReturnValue(null);
    await statusesFollow(COMPANY, SHIPMENT).after(TX, null, line());
    expect(repos.enqueue).not.toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalled();
  });
});

describe("a write of several lines at once (a Trucking push)", () => {
  const freight = (amount: string, over: Partial<InvoiceSellingCostRecord> = {}) => line({ category: "road_freight", description: "Freight", qty: "1", amount, currency: "CZK", ...over });

  it("owes one row as after a credit note for a difference line added to a set on an issued invoice", async () => {
    const follow = statusesFollow(COMPANY, SHIPMENT);
    await follow.afterSet(TX, [{ before: null, now: freight("2240", { description: "Price change after invoice" }) }]);
    expect(repos.enqueue).toHaveBeenCalledTimes(1);
    expect(repos.enqueue.mock.calls[0]![1]).toEqual([
      expect.objectContaining({ kind: "status_after_credit", invoiceId: "inv-2", payload: { shipmentId: SHIPMENT, charge: "Price change after invoice 2240.00 CZK" } }),
    ]);
    await follow.deliver();
    expect(repos.claimDue).toHaveBeenCalledWith(expect.any(Number), "inv-2");
  });

  it("owes nothing when the push puts the same price back: lines taken away and put back of the same value cancel out", async () => {
    await statusesFollow(COMPANY, SHIPMENT).afterSet(TX, [
      { before: freight("9000"), now: null },
      { before: null, now: freight("9000") },
    ]);
    expect(repos.latestOpenInvoiceId).not.toHaveBeenCalled();
    expect(repos.enqueue).not.toHaveBeenCalled();
  });

  it("counts a new charge first when the push also took lines away, and names at most three lines", async () => {
    await statusesFollow(COMPANY, SHIPMENT).afterSet(TX, [
      { before: freight("9000"), now: null },
      ...["100", "200", "300", "400"].map((amount) => ({ before: null, now: freight(amount) })),
    ]);
    expect(repos.enqueue.mock.calls[0]![1]).toEqual([
      expect.objectContaining({
        kind: "status_after_credit",
        payload: { shipmentId: SHIPMENT, charge: "Freight 100.00 CZK, Freight 200.00 CZK, Freight 300.00 CZK and 1 more" },
      }),
    ]);
  });

  it("owes a row as after an issue when the push only took charges away (a cancel)", async () => {
    await statusesFollow(COMPANY, SHIPMENT).afterSet(TX, [{ before: freight("9000"), now: null }]);
    expect(repos.enqueue.mock.calls[0]![1]).toEqual([expect.objectContaining({ kind: "status_after_issue", payload: { shipmentId: SHIPMENT, charge: "Freight 9000.00 CZK" } })]);
  });

  it("works the change out as one: a value changed is the old value gone and the new one come", () => {
    expect(setChangeOf([{ before: freight("100"), now: freight("150") }])).toEqual({ change: "added", lines: [freight("150")] });
    expect(setChangeOf([{ before: freight("100"), now: freight("0") }])).toEqual({ change: "removed", lines: [freight("100")] });
    expect(setChangeOf([{ before: freight("100"), now: freight("100", { description: "Renamed" }) }])).toBeNull();
    expect(setChangeOf([])).toBeNull();
  });
});

describe("the line in words", () => {
  it("names the line by its own text, else its charge, with what it comes to", () => {
    expect(chargeText(line())).toBe("Container Storage 300.00 EUR");
    expect(chargeText(line({ description: " Demurrage 4 days ", qty: null, amount: "320" }))).toBe("Demurrage 4 days 320.00 EUR");
    expect(chargeText(line({ category: "", description: "", currency: "" }))).toBe("Selling line 300.00");
  });
});

describe("the rows when they are sent", () => {
  const row = (kind: "status_after_credit" | "status_after_issue") =>
    ({
      id: "o1",
      companyId: COMPANY,
      invoiceId: "inv-2",
      shipmentId: SHIPMENT,
      actingUserId: "u-ops",
      actingRole: "user",
      kind,
      payload: { shipmentId: SHIPMENT, charge: "Container Storage 300.00 EUR" },
    }) as unknown as InvoiceFollowupOutboxRecord;
  const invoicedLine = { id: "s1", shipmentId: SHIPMENT, qty: "1", amount: "1000", currency: "EUR", invoice: true };
  const lateLine = { id: "s2", shipmentId: SHIPMENT, qty: "2", amount: "150", currency: "EUR", invoice: true };

  it("send a job that read Invoiced back to Not Invoiced (and Billed back to Billing) when a charge is not invoiced", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { status: "Billed [IMP]", invoicingStatus: "Invoiced" } });
    repos.listLiveByShipments.mockResolvedValue([invoicedLine, lateLine]);
    repos.listOpenInvoicesWithSources.mockResolvedValue([{ id: "inv-2", shipmentId: SHIPMENT, sourceSellingCostIds: ["s1"] }]);
    await sendFollowup(row("status_after_credit"));
    expect(clients.shipmentUpdate).toHaveBeenCalledWith(
      { shipmentId: SHIPMENT, invoicingStatus: "Not Invoiced", status: "Billing [IMP]" },
      { authData: { userID: "u-ops", companyID: COMPANY, role: "user", appWrite: true } },
    );
  });

  it("make it Invoiced again once the line is gone and the rest is all invoiced - and change nothing otherwise", async () => {
    clients.shipmentGet.mockResolvedValue({ shipment: { status: "Billing [IMP]", invoicingStatus: "Not Invoiced" } });
    repos.listOpenInvoicesWithSources.mockResolvedValue([{ id: "inv-2", shipmentId: SHIPMENT, sourceSellingCostIds: ["s1"] }]);
    repos.listLiveByShipments.mockResolvedValue([invoicedLine]);
    await sendFollowup(row("status_after_issue"));
    expect(clients.shipmentUpdate).toHaveBeenCalledWith({ shipmentId: SHIPMENT, invoicingStatus: "Invoiced", status: "Billed [IMP]" }, expect.anything());

    // Another charge still to bill: nothing moves.
    clients.shipmentUpdate.mockClear();
    repos.listLiveByShipments.mockResolvedValue([invoicedLine, lateLine]);
    await sendFollowup(row("status_after_issue"));
    expect(clients.shipmentUpdate).not.toHaveBeenCalled();
  });

  it("are rows like any other an issue writes: a charge in words beside the shipment", () => {
    const rows = followupsOfSellingChange({ companyId: COMPANY, shipmentId: SHIPMENT, invoiceId: "inv-2", change: "added", charge: "Storage 300.00 EUR" }, { userId: "u-ops", role: "user" });
    expect(rows.map((r) => [r.kind, r.invoiceId, r.payload])).toEqual([["status_after_credit", "inv-2", { shipmentId: SHIPMENT, charge: "Storage 300.00 EUR" }]]);
  });
});
