import { beforeEach, describe, expect, it, vi } from "vitest";

// Which owed invoices an open bank entry holds (services/paymentWaiting): the invoice's issue day and the entry's own
// day are what keep an old entry of the job from holding its later invoices for good (lib/bankMatch waitingPaymentsOf).
const bank = vi.hoisted(() => ({ openIncoming: vi.fn() }));
vi.mock("../../repositories/bankStatement.repository", () => ({ bankStatementRepository: bank }));

import { waitingPaymentsFor } from "../../services/paymentWaiting";
import type { InvoiceFigures } from "../../repositories/receivable.repository";
import type { ReceivableState } from "../../lib/receivables";

const figures = (id: string, issueDate: string) =>
  ({
    invoice: { id, number: `INV2026CZ00000031-00${id.slice(-1)}`, customer: { companyName: "Gama Elektro a.s." }, shipment: { jobNumber: "CZ00000031" }, currency: "CZK", dueDate: "2026-11-16", issueDate },
    receivable: { version: 1 },
  }) as unknown as InvoiceFigures;
const owed = { status: "unpaid", leftToPay: 1210 } as ReceivableState;
const entry = (over: Record<string, unknown> = {}) => ({
  statementId: "st-1",
  fileName: "vypis-1.xml",
  bookingDate: "2026-11-05",
  createdAt: new Date("2026-11-05T09:00:00Z"),
  credit: true,
  amount: "1210.00",
  currency: "CZK",
  variableSymbol: "31",
  endToEndId: "",
  message: "",
  ...over,
});

beforeEach(() => vi.clearAllMocks());

describe("the payment waiting check", () => {
  it("holds only the job's invoices issued on or before the entry's day", async () => {
    bank.openIncoming.mockResolvedValue([entry()]);
    const out = await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-11-02"), s: owed }, { f: figures("i-2", "2026-11-12"), s: owed }], "2026-11-19");
    expect([...out.keys()]).toEqual(["i-1"]);
  });

  it("takes an entry with no booking day as old as the statement it was read from", async () => {
    bank.openIncoming.mockResolvedValue([entry({ bookingDate: null, createdAt: new Date("2026-09-01T09:00:00Z") })]);
    expect((await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-08-20"), s: owed }], "2026-11-19")).size).toBe(0);
    bank.openIncoming.mockResolvedValue([entry({ bookingDate: null, createdAt: new Date("2026-11-10T09:00:00Z") })]);
    expect((await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-08-20"), s: owed }], "2026-11-19")).size).toBe(1);
  });

  it("reads no entries when nothing is owed", async () => {
    expect((await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-11-02"), s: { ...owed, status: "paid", leftToPay: 0 } }], "2026-11-19")).size).toBe(0);
    expect(bank.openIncoming).not.toHaveBeenCalled();
  });
});
