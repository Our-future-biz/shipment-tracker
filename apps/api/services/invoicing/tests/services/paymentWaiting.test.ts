import { beforeEach, describe, expect, it, vi } from "vitest";

// Which owed invoices an open bank entry holds (services/paymentWaiting): the invoice's issue day and the entry's own
// day are what keep an old entry of the job from holding its later invoices for good (lib/bankMatch waitingPaymentsOf).
const bank = vi.hoisted(() => ({
  openIncoming: vi.fn(),
  reopenedIncoming: vi.fn(async () => [] as unknown[]),
  takenBackKinds: vi.fn(async () => ({ takenBack: new Set<string>(), reversed: new Set<string>() })),
  lastImportAt: vi.fn(async () => null as Date | null),
}));
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

  it("lets an entry booked before the issue day hold an invoice on prepayment, or one issued again after a credit note (Y2)", async () => {
    bank.openIncoming.mockResolvedValue([entry({ bookingDate: "2026-11-05" })]);
    const prepaid = { ...figures("i-1", "2026-11-12"), invoice: { ...figures("i-1", "2026-11-12").invoice, customer: { companyName: "Gama Elektro a.s.", paymentTerms: "PREPAYMENT" } } } as InvoiceFigures;
    expect([...(await waitingPaymentsFor("c1", [{ f: prepaid, s: owed }], "2026-11-19")).keys()]).toEqual(["i-1"]);
    // Issued again on the 12th after a credit note of the one issued on the 3rd: an entry of the 5th holds it, one of the 2nd not.
    const again = { ...figures("i-2", "2026-11-12"), issuedAgainFrom: "2026-11-03" } as InvoiceFigures;
    expect([...(await waitingPaymentsFor("c1", [{ f: again, s: owed }], "2026-11-19")).keys()]).toEqual(["i-2"]);
    bank.openIncoming.mockResolvedValue([entry({ bookingDate: "2026-11-02" })]);
    expect((await waitingPaymentsFor("c1", [{ f: again, s: owed }], "2026-11-19")).size).toBe(0);
    // The 30 days still bound an early entry on prepayment.
    bank.openIncoming.mockResolvedValue([entry({ bookingDate: "2026-10-10" })]);
    expect((await waitingPaymentsFor("c1", [{ f: prepaid, s: owed }], "2026-11-19")).size).toBe(0);
  });

  it("counts a confirmed entry a payment of which was taken back by mistake as waiting, for what is free on it (n2)", async () => {
    bank.openIncoming.mockResolvedValue([]);
    const confirmed = entry({
      status: "confirmed",
      amount: "2420.00",
      allocations: [
        { invoiceId: "i-9", number: "INV-9", amount: 1210, paymentId: "p-1" },
        { invoiceId: "i-8", number: "INV-8", amount: 1210, paymentId: "p-2" },
      ],
    });
    bank.reopenedIncoming.mockResolvedValue([confirmed]);
    bank.takenBackKinds.mockResolvedValue({ takenBack: new Set(["p-1"]), reversed: new Set() });
    const out = await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-11-02"), s: owed }], "2026-11-19");
    expect(bank.reopenedIncoming).toHaveBeenCalledWith("c1", "2026-10-20");
    expect(out.get("i-1")).toMatchObject({ statementId: "st-1", amount: 1210 });
    // Taken back as reversed (a bank return): the money went back, nothing is free, nothing waits.
    bank.takenBackKinds.mockResolvedValue({ takenBack: new Set(["p-1"]), reversed: new Set(["p-1"]) });
    expect((await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-11-02"), s: owed }], "2026-11-19")).size).toBe(0);
  });

  it("reads no entries when nothing is owed", async () => {
    expect((await waitingPaymentsFor("c1", [{ f: figures("i-1", "2026-11-02"), s: { ...owed, status: "paid", leftToPay: 0 } }], "2026-11-19")).size).toBe(0);
    expect(bank.openIncoming).not.toHaveBeenCalled();
  });
});
