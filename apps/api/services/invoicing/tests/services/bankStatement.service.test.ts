import { beforeEach, describe, expect, it, vi } from "vitest";

// The bank statement import run for real - reading a file, the same file twice, an entry read again from another
// file, re-worked candidates, confirm over two invoices, a sum above the entry, version clashes, a double click, set
// aside - against stand-ins for its repository, Accounts Receivable (the owed invoices and noteAllocations) and users.
const repo = vi.hoisted(() => ({
  bySha: vi.fn(),
  importStatement: vi.fn(),
  list: vi.fn(),
  byId: vi.fn(),
  statusCounts: vi.fn(),
  entriesOf: vi.fn(),
  entryOf: vi.fn(),
  fileNames: vi.fn(),
  confirm: vi.fn(),
  ignore: vi.fn(),
  takenBack: vi.fn(),
}));
vi.mock("../../repositories/bankStatement.repository", () => ({ bankStatementRepository: repo }));
const receivables = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn(), prepareInvoices: vi.fn(), noteAllocations: vi.fn() }));
vi.mock("../../services/receivable.service", () => ({ receivableService: receivables }));
const followups = vi.hoisted(() => ({ deliverInvoiceFollowups: vi.fn() }));
vi.mock("../../services/invoiceFollowups.service", () => followups);
const users = vi.hoisted(() => ({ userEmailOf: vi.fn() }));
vi.mock("../../../../lib/companyUsers", () => users);
vi.mock("encore.dev/api", () => import("../../../../lib/tests/encoreApi.stub"));
vi.mock("encore.dev/log", () => ({ default: { warn: vi.fn(), error: vi.fn() } }));

import { bankStatementService as service } from "../../services/bankStatement.service";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ST = "1a2b3c4d-0000-4000-8000-000000000001";
const ST_OLD = "1a2b3c4d-0000-4000-8000-000000000002";
const E1 = "2b3c4d5e-0000-4000-8000-000000000001";
const E2 = "2b3c4d5e-0000-4000-8000-000000000002";
const INV_A = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6a";
const INV_B = "5d0c7a1e-3b2f-4e6d-9a8c-1f2e3d4c5b6b";
const IBAN = "CZ6508000000192000145399";
const TX = { tx: true };

const manager = { userID: "u-boss", companyID: COMPANY, role: "manager" };
const clerk = { userID: "u-clerk", companyID: COMPANY, role: "user" };

const statement = (over: Record<string, unknown> = {}) => ({
  id: ST,
  createdAt: new Date("2026-11-18T08:00:00Z"),
  updatedAt: new Date("2026-11-18T08:00:00Z"),
  deletedAt: null,
  companyId: COMPANY,
  fileName: "vypis-2026-11-17.xml",
  fileSha256: "abc",
  format: "camt.053.001.02",
  statementRef: "2026-11-17-0145399",
  accountIban: IBAN,
  currency: "CZK",
  fromDate: "2026-11-17",
  toDate: "2026-11-17",
  entries: 2,
  importedByUserId: "u-boss",
  importedBy: "jana@cto.cz",
  ...over,
});

const entry = (over: Record<string, unknown> = {}) => ({
  id: E1,
  createdAt: new Date("2026-11-18T08:00:00Z"),
  updatedAt: new Date("2026-11-18T08:00:00Z"),
  deletedAt: null,
  companyId: COMPANY,
  statementId: ST,
  entryKey: `${IBAN}|20261117-48211`,
  bookingDate: "2026-11-17",
  valueDate: "2026-11-17",
  amount: "2000.00",
  currency: "CZK",
  credit: true,
  variableSymbol: "0000000031",
  constantSymbol: "0308",
  specificSymbol: "",
  endToEndId: "/VS0000000031/SS/KS0308",
  counterpartyName: "Gama Elektro a.s.",
  counterpartyAccount: "CZ5503000000000123456789",
  message: "",
  status: "proposed",
  candidates: [],
  allocations: [],
  decidedAt: null,
  decidedByUserId: null,
  decidedBy: "",
  decisionReason: "",
  version: 1,
  ...over,
});

const row = (over: Record<string, unknown> = {}) => ({
  id: INV_A,
  number: "INV2026CZ00000031-001",
  customer: "Gama Elektro a.s.",
  jobNumber: "CZ00000031",
  currency: "CZK",
  dueDate: "2026-11-20",
  leftToPay: 1210,
  status: "unpaid",
  version: 4,
  ...over,
});

const owed = (...rows: ReturnType<typeof row>[]) => receivables.list.mockResolvedValue({ rows, truncated: false });

const V02 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><GrpHdr><MsgId>M</MsgId><CreDtTm>2026-11-18T05:12:00</CreDtTm></GrpHdr>
<Stmt><Id>2026-11-17-0145399</Id><FrToDt><FrDtTm>2026-11-17T00:00:00</FrDtTm><ToDtTm>2026-11-17T23:59:59</ToDtTm></FrToDt>
<Acct><Id><IBAN>${IBAN}</IBAN></Id><Ccy>CZK</Ccy></Acct>
<Ntry><Amt Ccy="CZK">1210.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-17</Dt></BookgDt><AcctSvcrRef>R1</AcctSvcrRef>
<NtryDtls><TxDtls><Refs><EndToEndId>/VS0000000031/SS/KS0308</EndToEndId></Refs><RltdPties><Dbtr><Nm>Gama Elektro a.s.</Nm></Dbtr></RltdPties></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="CZK">8400.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><Sts>BOOK</Sts><BookgDt><Dt>2026-11-17</Dt></BookgDt><AcctSvcrRef>R2</AcctSvcrRef></Ntry>
<Ntry><Amt Ccy="CZK">99.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><Sts>PDNG</Sts><BookgDt><Dt>2026-11-17</Dt></BookgDt><AcctSvcrRef>R3</AcctSvcrRef></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");

const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (err) {
    return { code: (err as { code?: string }).code, message: (err as Error).message };
  }
  throw new Error("not refused");
};

beforeEach(() => {
  vi.resetAllMocks();
  users.userEmailOf.mockResolvedValue("jana@cto.cz");
  repo.bySha.mockResolvedValue(null);
  repo.byId.mockResolvedValue(statement());
  repo.entriesOf.mockResolvedValue([]);
  repo.fileNames.mockResolvedValue(new Map());
  repo.statusCounts.mockResolvedValue([]);
  repo.takenBack.mockResolvedValue(new Set());
  followups.deliverInvoiceFollowups.mockResolvedValue(undefined);
  owed(row());
});

describe("reading a file", () => {
  it("a manager reads it: booked entries kept, money out for the record, the credit proposed, nothing noted", async () => {
    repo.importStatement.mockImplementation(async (st: Record<string, unknown>) => ({ statement: statement({ ...st, id: ST }), added: 2 }));
    await service.importFile(manager, { fileName: " vypis.xml ", contentBase64: b64(V02) });
    const [st, rows] = repo.importStatement.mock.calls[0]!;
    expect(st).toMatchObject({ companyId: COMPANY, fileName: "vypis.xml", format: "camt.053.001.02", statementRef: "2026-11-17-0145399", accountIban: IBAN, currency: "CZK", fromDate: "2026-11-17", toDate: "2026-11-17", entries: 2, importedBy: "jana@cto.cz" });
    expect(st.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ entryKey: `${IBAN}|R1`, amount: "1210.00", credit: true, variableSymbol: "0000000031", status: "proposed" });
    expect(rows[0].candidates).toEqual([expect.objectContaining({ invoiceId: INV_A, score: 3 })]);
    expect(rows[0].candidates[0]).not.toHaveProperty("version");
    expect(rows[1]).toMatchObject({ entryKey: `${IBAN}|R2`, credit: false, status: "not_incoming", candidates: [] });
    expect(receivables.noteAllocations).not.toHaveBeenCalled();
  });

  it("the same file twice is refused, saying when and by whom", async () => {
    repo.bySha.mockResolvedValue(statement({ createdAt: new Date("2026-11-17T23:30:00Z") }));
    expect(await code(service.importFile(manager, { fileName: "again.xml", contentBase64: b64(V02) }))).toEqual({ code: "already_exists", message: "This statement was read on 18.11.2026 by jana@cto.cz" });
    expect(repo.importStatement).not.toHaveBeenCalled();
  });

  it("the same file stored by someone else a moment ago is refused the same way", async () => {
    repo.bySha.mockResolvedValueOnce(null).mockResolvedValueOnce(statement({ importedBy: "petr@cto.cz" }));
    repo.importStatement.mockResolvedValue(null);
    expect((await code(service.importFile(manager, { fileName: "a.xml", contentBase64: b64(V02) }))).message).toBe("This statement was read on 18.11.2026 by petr@cto.cz");
  });

  it("a file that is not a statement is refused with what is wrong; a user may not read one", async () => {
    expect(await code(service.importFile(manager, { fileName: "a.xml", contentBase64: b64("<Document><x></Document>") }))).toEqual({
      code: "invalid_argument",
      message: "The file is not well-formed XML (line 1): </Document> closes <x>",
    });
    expect((await code(service.importFile(manager, { fileName: "a.xml", contentBase64: "%%%" }))).code).toBe("invalid_argument");
    expect((await code(service.importFile(clerk, { fileName: "a.xml", contentBase64: b64(V02) }))).code).toBe("permission_denied");
  });
});

describe("opening a statement", () => {
  it("re-works an open entry's candidates (an invoice paid meanwhile drops out) and shows an entry read first elsewhere as decided there", async () => {
    repo.entriesOf.mockResolvedValue([
      entry({ candidates: [{ invoiceId: INV_A, number: "INV2026CZ00000031-001", customer: "", jobNumber: "", leftToPay: 1210, currency: "CZK", reasons: [], score: 1 }] }),
      entry({ id: E2, statementId: ST_OLD, entryKey: `${IBAN}|R9`, status: "confirmed", allocations: [{ invoiceId: INV_B, number: "INV-B", amount: 1500, paymentId: "p-1" }], decidedBy: "petr@cto.cz", version: 2 }),
    ]);
    repo.fileNames.mockResolvedValue(new Map([[ST_OLD, "vypis-older.xml"]]));
    owed(row({ id: INV_B, jobNumber: "CZ00000099", number: "INV2026CZ00000099-001" })); // INV_A is paid now
    const d = await service.detail(clerk, ST);
    expect(d.entries[0]).toMatchObject({ status: "no_match", candidates: [], firstReadIn: null });
    expect(d.entries[1]).toMatchObject({ status: "confirmed", firstReadIn: { statementId: ST_OLD, fileName: "vypis-older.xml" }, unallocated: 500, decidedBy: "petr@cto.cz" });
    expect(d.statement.counts).toMatchObject({ toDecide: 1, noMatch: 1, seenBefore: 1 });
    expect(d).toMatchObject({ canAct: false, fileKept: false, candidatesCapped: false });
  });
});

describe("confirming an entry", () => {
  const items = [
    { invoiceId: INV_A, receivableVersion: 4, amount: 1210 },
    { invoiceId: INV_B, receivableVersion: 7, amount: 790 },
  ];
  beforeEach(() => {
    repo.entryOf.mockResolvedValue(entry());
    owed(row(), row({ id: INV_B, number: "INV2026CZ00000031-002", leftToPay: 790, version: 7 }));
    repo.confirm.mockImplementation(async (_c: string, _id: string, _v: number, _d: unknown, work: (tx: unknown) => Promise<unknown>) => entry({ status: "confirmed", allocations: await work(TX), version: 2 }));
    receivables.noteAllocations.mockResolvedValue([
      { invoiceId: INV_A, paymentId: "pay-a" },
      { invoiceId: INV_B, paymentId: "pay-b" },
    ]);
  });

  it("one bank payment over two invoices: noted by noteAllocations in the entry's transaction, the payments stored on it", async () => {
    await service.confirm(manager, ST, E1, { version: 1, items });
    expect(receivables.prepareInvoices).toHaveBeenCalledWith(manager, [INV_A, INV_B]);
    expect(receivables.prepareInvoices.mock.invocationCallOrder[0]).toBeLessThan(repo.confirm.mock.invocationCallOrder[0]!);
    expect(repo.confirm).toHaveBeenCalledWith(COMPANY, E1, 1, { userId: "u-boss", by: "jana@cto.cz" }, expect.any(Function), false);
    expect(receivables.noteAllocations).toHaveBeenCalledWith(
      manager,
      {
        paidOn: "2026-11-17",
        bankRef: `${IBAN}|20261117-48211`,
        note: "Bank statement vypis-2026-11-17.xml, Gama Elektro a.s.",
        idempotencyKeyPrefix: `bank:${E1}`,
        currency: "CZK",
        items: [
          { invoiceId: INV_A, version: 4, amount: 1210 },
          { invoiceId: INV_B, version: 7, amount: 790 },
        ],
      },
      TX,
    );
    const work = repo.confirm.mock.calls[0]![4];
    expect(await work(TX)).toEqual([
      { invoiceId: INV_A, number: "INV2026CZ00000031-001", amount: 1210, paymentId: "pay-a" },
      { invoiceId: INV_B, number: "INV2026CZ00000031-002", amount: 790, paymentId: "pay-b" },
    ]);
    expect(followups.deliverInvoiceFollowups).toHaveBeenCalledWith(INV_A);
    expect(followups.deliverInvoiceFollowups).toHaveBeenCalledWith(INV_B);
  });

  it("together above the entry's amount is refused and nothing is noted", async () => {
    owed(row({ leftToPay: 5000 }), row({ id: INV_B, number: "INV2026CZ00000031-002", leftToPay: 5000, version: 7 }));
    const r = await code(service.confirm(manager, ST, E1, { version: 1, items: [{ ...items[0]!, amount: 1500 }, { ...items[1]!, amount: 500.01 }] }));
    expect(r).toEqual({ code: "failed_precondition", message: "Together more than the payment (2000.00 CZK)" });
    expect(repo.confirm).not.toHaveBeenCalled();
    expect(receivables.noteAllocations).not.toHaveBeenCalled();
  });

  it("an invoice in another currency, or one beyond the page read on its own and found paid, is refused", async () => {
    owed(row({ currency: "EUR" }));
    expect((await code(service.confirm(manager, ST, E1, { version: 1, items: [items[0]!] }))).message).toBe("INV2026CZ00000031-001 is in EUR, the payment in CZK");
    owed();
    receivables.detail.mockResolvedValue({ row: row({ status: "paid", leftToPay: 0 }) });
    expect((await code(service.confirm(manager, ST, E1, { version: 1, items: [items[0]!] }))).message).toBe("INV2026CZ00000031-001 is not owed any more: open the statement again");
    expect(receivables.noteAllocations).not.toHaveBeenCalled();
  });

  it("a version clash: an old version is refused; a second manager who loses the race too", async () => {
    expect(await code(service.confirm(manager, ST, E1, { version: 0, items }))).toEqual({ code: "aborted", message: "This entry changed meanwhile: open the statement again to see how it is now" });
    repo.confirm.mockResolvedValue(null);
    repo.entryOf.mockResolvedValueOnce(entry()).mockResolvedValueOnce(entry({ status: "confirmed", decidedBy: "petr@cto.cz", decidedAt: new Date("2026-11-18T09:00:00Z"), allocations: [{ invoiceId: INV_A, number: "x", amount: 2000, paymentId: "p" }], version: 2 }));
    expect(await code(service.confirm(manager, ST, E1, { version: 1, items }))).toEqual({ code: "failed_precondition", message: "This entry was confirmed already by petr@cto.cz on 18.11.2026" });
  });

  it("a double click: the entry confirmed with the same invoices and amounts answers as the first did, nothing noted twice", async () => {
    repo.entryOf.mockResolvedValue(entry({ status: "confirmed", version: 2, allocations: [
      { invoiceId: INV_B, number: "b", amount: 790, paymentId: "pay-b" },
      { invoiceId: INV_A, number: "a", amount: 1210, paymentId: "pay-a" },
    ] }));
    await service.confirm(manager, ST, E1, { version: 1, items });
    expect(repo.confirm).not.toHaveBeenCalled();
    expect(receivables.noteAllocations).not.toHaveBeenCalled();
  });

  it("a payment noteAllocations can't name rolls the confirm back", async () => {
    receivables.noteAllocations.mockResolvedValue([{ invoiceId: INV_A, paymentId: "pay-a" }]);
    await expect(service.confirm(manager, ST, E1, { version: 1, items })).rejects.toThrow(/named no payment/);
  });

  it("money out, an entry with no day, a user: refused", async () => {
    repo.entryOf.mockResolvedValue(entry({ credit: false, status: "not_incoming" }));
    expect((await code(service.confirm(manager, ST, E1, { version: 1, items }))).message).toMatch(/money out/);
    repo.entryOf.mockResolvedValue(entry({ bookingDate: null, valueDate: null }));
    expect((await code(service.confirm(manager, ST, E1, { version: 1, items }))).message).toMatch(/no booking day/);
    expect((await code(service.confirm(clerk, ST, E1, { version: 1, items }))).code).toBe("permission_denied");
  });
});

describe("an entry whose payment was taken back", () => {
  // Confirmed over two invoices; the payment on INV_B (790) was taken back on the invoice since.
  const confirmed = () =>
    entry({
      status: "confirmed",
      version: 2,
      decidedBy: "petr@cto.cz",
      decidedAt: new Date("2026-11-18T09:00:00Z"),
      allocations: [
        { invoiceId: INV_A, number: "INV-A", amount: 1210, paymentId: "pay-a" },
        { invoiceId: INV_B, number: "INV-B", amount: 790, paymentId: "pay-b" },
      ],
    });
  beforeEach(() => {
    repo.entriesOf.mockResolvedValue([confirmed()]);
    repo.entryOf.mockResolvedValue(confirmed());
    repo.takenBack.mockResolvedValue(new Set(["pay-b"]));
    owed(row({ id: INV_B, number: "INV-B", leftToPay: 790, version: 9 }));
    repo.confirm.mockImplementation(async (_c: string, _id: string, _v: number, _d: unknown, work: (tx: unknown) => Promise<unknown>) => entry({ status: "confirmed", allocations: await work(TX), version: 3 }));
    receivables.noteAllocations.mockResolvedValue([{ invoiceId: INV_B, paymentId: "pay-b2" }]);
  });

  it("shows that allocation as taken back and the entry as to decide again, for what is free on it", async () => {
    const d = await service.detail(clerk, ST);
    expect(d.entries[0]).toMatchObject({ status: "proposed", reopened: true, unallocated: 790 });
    expect(d.entries[0]!.allocations.map((a) => [a.paymentId, a.takenBack])).toEqual([
      ["pay-a", false],
      ["pay-b", true],
    ]);
    expect(d.entries[0]!.candidates.map((c) => c.invoiceId)).toEqual([INV_B]);
    expect(d.statement.counts).toMatchObject({ toDecide: 1, confirmed: 0 });
  });

  it("a manager confirms it again for what is free, with keys of its own, the earlier allocations kept", async () => {
    await service.confirm(manager, ST, E1, { version: 2, items: [{ invoiceId: INV_B, receivableVersion: 9, amount: 790 }] });
    expect(repo.confirm).toHaveBeenCalledWith(COMPANY, E1, 2, { userId: "u-boss", by: "jana@cto.cz" }, expect.any(Function), true);
    expect(receivables.noteAllocations.mock.calls[0]![1]).toMatchObject({ idempotencyKeyPrefix: `bank:${E1}:2`, items: [{ invoiceId: INV_B, version: 9, amount: 790 }] });
    const work = repo.confirm.mock.calls[0]![4];
    expect(await work(TX)).toEqual([
      { invoiceId: INV_A, number: "INV-A", amount: 1210, paymentId: "pay-a" },
      { invoiceId: INV_B, number: "INV-B", amount: 790, paymentId: "pay-b" },
      { invoiceId: INV_B, number: "INV-B", amount: 790, paymentId: "pay-b2", round: 2 },
    ]);
  });

  it("more than is free is refused; with nothing taken back a confirmed entry stays decided", async () => {
    owed(row({ id: INV_B, number: "INV-B", leftToPay: 5000, version: 9 }));
    expect((await code(service.confirm(manager, ST, E1, { version: 2, items: [{ invoiceId: INV_B, receivableVersion: 9, amount: 800 }] }))).message).toBe("Together more than the payment (790.00 CZK)");
    repo.takenBack.mockResolvedValue(new Set());
    expect((await code(service.confirm(manager, ST, E1, { version: 2, items: [{ invoiceId: INV_B, receivableVersion: 9, amount: 790 }] }))).message).toBe("This entry was confirmed already by petr@cto.cz on 18.11.2026");
    expect(receivables.noteAllocations).not.toHaveBeenCalled();
  });

  it("a double click of the second confirmation answers as the first did", async () => {
    repo.entryOf.mockResolvedValue(
      entry({
        status: "confirmed",
        version: 3,
        allocations: [...confirmed().allocations, { invoiceId: INV_B, number: "INV-B", amount: 790, paymentId: "pay-b2", round: 2 }],
      }),
    );
    await service.confirm(manager, ST, E1, { version: 2, items: [{ invoiceId: INV_B, receivableVersion: 9, amount: 790 }] });
    expect(repo.confirm).not.toHaveBeenCalled();
  });

  it("or a manager sets the rest aside", async () => {
    repo.ignore.mockResolvedValue(entry({ status: "ignored", version: 3 }));
    await service.ignore(manager, ST, E1, { version: 2, reason: "Refunded to the customer" });
    expect(repo.ignore).toHaveBeenCalledWith(COMPANY, E1, 2, { userId: "u-boss", by: "jana@cto.cz", reason: "Refunded to the customer" }, true);
  });
});

describe("setting an entry aside", () => {
  beforeEach(() => repo.entryOf.mockResolvedValue(entry({ status: "no_match" })));

  it("with a reason, from the version seen", async () => {
    repo.ignore.mockResolvedValue(entry({ status: "ignored", version: 2 }));
    await service.ignore(manager, ST, E1, { version: 1, reason: "  Owner's loan  " });
    expect(repo.ignore).toHaveBeenCalledWith(COMPANY, E1, 1, { userId: "u-boss", by: "jana@cto.cz", reason: "Owner's loan" }, false);
  });

  it("refused: no reason, an old version, an entry decided already, a user", async () => {
    expect(await code(service.ignore(manager, ST, E1, { version: 1, reason: "ok" }))).toEqual({ code: "invalid_argument", message: "Say why this entry is set aside" });
    expect((await code(service.ignore(manager, ST, E1, { version: 3, reason: "Owner's loan" }))).code).toBe("aborted");
    repo.entryOf.mockResolvedValue(entry({ status: "confirmed", decidedBy: "petr@cto.cz" }));
    expect((await code(service.ignore(manager, ST, E1, { version: 1, reason: "Owner's loan" }))).message).toBe("This entry was confirmed already by petr@cto.cz");
    expect((await code(service.ignore(clerk, ST, E1, { version: 1, reason: "Owner's loan" }))).code).toBe("permission_denied");
    expect(repo.ignore).not.toHaveBeenCalled();
  });
});
