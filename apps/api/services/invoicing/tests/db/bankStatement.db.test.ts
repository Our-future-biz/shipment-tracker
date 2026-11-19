import { createHash, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

// The bank statement and accounting export repositories against the invoicing database: a file once, an entry once
// per company whichever file brings it, an entry shown under every statement of its account and days, confirms and
// set-asides from the version seen (two at once: one wins, the other's work never runs), and the export lock that
// keeps two exports one after another - the SQL the service tests stand in for. Each test works in a company of its
// own. Runs only under `encore test` (INVOICING_DB_TESTS=1 encore test services/invoicing/tests/db).

import { db } from "../../db/db";
import { bankStatementRepository as repo } from "../../repositories/bankStatement.repository";
import { accountingExportRepository as exportsRepo } from "../../repositories/accountingExport.repository";
import { bankStatementEntryTable as e, type NewBankStatementEntryRecord } from "../../schemas/bankStatement.schema";
import { invoiceTable as t, type InvoiceRecord } from "../../schemas/invoice.schema";
import { receivablePaymentTable as rp } from "../../schemas/receivable.schema";

const IBAN = "CZ6508000000192000145399";
const sha = () => createHash("sha256").update(randomUUID()).digest("hex");

const statement = (companyId: string, over: { fromDate?: string; toDate?: string; accountIban?: string } = {}) => ({
  companyId,
  fileName: `vypis-${randomUUID().slice(0, 8)}.xml`,
  fileSha256: sha(),
  statementRef: "S-1",
  accountIban: over.accountIban ?? IBAN,
  currency: "CZK",
  fromDate: over.fromDate ?? "2026-11-16",
  toDate: over.toDate ?? "2026-11-16",
  entries: 1,
  importedBy: "boss@test.cz",
});

const entry = (companyId: string, key: string, over: Partial<NewBankStatementEntryRecord> = {}): Omit<NewBankStatementEntryRecord, "statementId"> => ({
  companyId,
  entryKey: key,
  bookingDate: "2026-11-16",
  valueDate: "2026-11-16",
  amount: "1210.00",
  currency: "CZK",
  credit: true,
  variableSymbol: "31",
  counterpartyName: "Gama Elektro a.s.",
  ...over,
});

const decision = { userId: randomUUID(), by: "boss@test.cz" };

describe("a statement read (importStatement)", () => {
  it("stores the file once: the same file again answers null", async () => {
    const company = randomUUID();
    const file = statement(company);
    expect(await repo.importStatement(file, [entry(company, `${IBAN}|A-1`)])).toMatchObject({ added: 1 });
    expect(await repo.importStatement({ ...file, fileName: "again.xml" }, [entry(company, `${IBAN}|A-1`)])).toBeNull();
  });

  it("stores an entry once per company, whichever file brings it, and another company's on its own", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const key = `${IBAN}|h:${randomUUID()}`;
    expect((await repo.importStatement(statement(a), [entry(a, key)]))!.added).toBe(1);
    // A monthly file of the same days brings the same movement again, and one new one.
    const monthly = await repo.importStatement(statement(a, { fromDate: "2026-11-01", toDate: "2026-11-30" }), [entry(a, key), entry(a, `${IBAN}|h:${randomUUID()}`)]);
    expect(monthly!.added).toBe(1);
    expect((await repo.importStatement(statement(b), [entry(b, key)]))!.added).toBe(1);
    expect(await db.select().from(e).where(eq(e.entryKey, key))).toHaveLength(2);
  });

  it("shows an entry another file stored first under every statement of its account and days, and nowhere else", async () => {
    const company = randomUUID();
    const key = `${IBAN}|A-${randomUUID()}`;
    const daily = (await repo.importStatement(statement(company), [entry(company, key)]))!.statement;
    const monthly = (await repo.importStatement(statement(company, { fromDate: "2026-11-01", toDate: "2026-11-30" }), [entry(company, key)]))!.statement;
    const otherAccount = (await repo.importStatement(statement(company, { accountIban: "CZ5508000000001234567899", fromDate: "2026-11-01", toDate: "2026-11-30" }), []))!.statement;
    const october = (await repo.importStatement(statement(company, { fromDate: "2026-10-01", toDate: "2026-10-31" }), []))!.statement;
    const [stored] = await repo.entriesOf(daily);
    expect(stored!.statementId).toBe(daily.id);
    expect((await repo.entriesOf(monthly)).map((x) => x.id)).toEqual([stored!.id]);
    expect(await repo.entryOf(monthly, stored!.id)).toMatchObject({ id: stored!.id });
    expect(await repo.entriesOf(otherAccount)).toEqual([]);
    expect(await repo.entriesOf(october)).toEqual([]);
  });

  it("never reads another company's statement or entry", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const made = (await repo.importStatement(statement(a), [entry(a, `${IBAN}|A-${randomUUID()}`)]))!.statement;
    const [own] = await repo.entriesOf(made);
    expect(await repo.byId(b, made.id)).toBeNull();
    expect(await repo.bySha(b, made.fileSha256)).toBeNull();
    expect(await repo.entryOf({ ...made, companyId: b }, own!.id)).toBeNull();
    expect(await repo.confirm(b, own!.id, own!.version, decision, async () => [])).toBeNull();
    expect(await repo.ignore(b, own!.id, own!.version, { ...decision, reason: "not ours" })).toBeNull();
  });
});

describe("the open incoming entries (openIncoming, mock test council X5)", () => {
  it("reads the undecided money in with its file's name, the newest booked first, never money out, a decided one or another company's", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const file = statement(a, { fromDate: "2026-11-10", toDate: "2026-11-16" });
    const made = (await repo.importStatement(file, [
      entry(a, `${IBAN}|open-1`, { bookingDate: "2026-11-12" }),
      entry(a, `${IBAN}|open-2`, { bookingDate: "2026-11-16", status: "no_match" }),
      entry(a, `${IBAN}|out`, { credit: false, status: "not_incoming" }),
      entry(a, `${IBAN}|decided`, { bookingDate: "2026-11-15" }),
    ]))!.statement;
    await repo.importStatement(statement(b), [entry(b, `${IBAN}|theirs`)]);
    const decided = (await repo.entriesOf(made)).find((x) => x.entryKey === `${IBAN}|decided`)!;
    await repo.ignore(a, decided.id, decided.version, { ...decision, reason: "not ours" });

    const open = await repo.openIncoming(a);
    expect(open.map((x) => x.entryKey)).toEqual([`${IBAN}|open-2`, `${IBAN}|open-1`]);
    expect(open[0]).toMatchObject({ fileName: file.fileName, statementId: made.id, credit: true, amount: "1210.00", variableSymbol: "31" });
    expect(await repo.openIncoming(a, 1)).toHaveLength(1);
  });
});

describe("deciding an entry (confirm, ignore)", () => {
  const stored = async () => {
    const company = randomUUID();
    const made = (await repo.importStatement(statement(company), [entry(company, `${IBAN}|A-${randomUUID()}`)]))!.statement;
    const [row] = await repo.entriesOf(made);
    return { company, row: row! };
  };

  it("confirms from the version seen and stores what was noted", async () => {
    const { company, row } = await stored();
    const allocations = [{ invoiceId: randomUUID(), number: "INV-1", amount: 1210, paymentId: randomUUID() }];
    const done = await repo.confirm(company, row.id, row.version, decision, async () => allocations);
    expect(done).toMatchObject({ status: "confirmed", version: row.version + 1, decidedBy: "boss@test.cz", allocations });
  });

  it("two managers confirming at once: one wins, the other gets null and its payments are never noted", async () => {
    const { company, row } = await stored();
    let noted = 0;
    const work = async () => {
      noted += 1;
      // Holds the entry while the second confirm waits on it.
      await new Promise((r) => setTimeout(r, 150));
      return [{ invoiceId: randomUUID(), number: "INV-1", amount: 1210, paymentId: randomUUID() }];
    };
    const results = await Promise.all([repo.confirm(company, row.id, row.version, decision, work), repo.confirm(company, row.id, row.version, { ...decision, by: "eva@test.cz" }, work)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(noted).toBe(1);
  });

  it("anything the work throws rolls the confirm back: the entry is open as it was", async () => {
    const { company, row } = await stored();
    await expect(
      repo.confirm(company, row.id, row.version, decision, async () => {
        throw new Error("the invoice changed meanwhile");
      }),
    ).rejects.toThrow("the invoice changed meanwhile");
    const [after] = await db.select().from(e).where(eq(e.id, row.id));
    expect(after).toMatchObject({ status: row.status, version: row.version, allocations: [] });
  });

  it("refuses an old version and a decided entry; a reopened one is decided again from its version", async () => {
    const { company, row } = await stored();
    expect(await repo.ignore(company, row.id, row.version - 1, { ...decision, reason: "old" })).toBeNull();
    const confirmed = (await repo.confirm(company, row.id, row.version, decision, async () => []))!;
    // Decided: a set-aside or a second confirm from the new version is refused, unless a payment of it was taken back.
    expect(await repo.ignore(company, row.id, confirmed.version, { ...decision, reason: "late" })).toBeNull();
    expect(await repo.confirm(company, row.id, confirmed.version, decision, async () => [])).toBeNull();
    expect(await repo.confirm(company, row.id, confirmed.version, decision, async () => [], true)).toMatchObject({ status: "confirmed", version: confirmed.version + 1 });
  });
});

const issue = async (companyId: string, issueDate: string): Promise<InvoiceRecord> => {
  const customerId = randomUUID();
  return (
    await db
      .insert(t)
      .values({
        companyId,
        shipmentId: randomUUID(),
        kind: "invoice",
        status: "issued",
        number: `INV-${randomUUID()}`,
        customerId,
        issueDate,
        duzp: issueDate,
        dueDate: "2026-11-30",
        currency: "CZK",
        fxRate: "1.000000",
        net: "1000.00",
        vat: "210.00",
        gross: "1210.00",
        netCzk: "1000.00",
        vatCzk: "210.00",
        grossCzk: "1210.00",
        vatSummary: [],
        supplier: {} as never,
        customer: { customerId, companyName: "Gama Elektro a.s.", address: "", city: "", country: "CZ", ico: "", dic: "", paymentTerms: "14 days" },
        shipment: { jobNumber: "CZ00000031", jobYear: 2026, tradeDirection: "", shipper: "", consignee: "", bookingNumber: "", containerNumber: "", personalReference: "" },
        issuedBy: randomUUID(),
      })
      .returning()
  )[0]!;
};

describe("an export to the accounting system (accountingExportRepository)", () => {
  const record = (tx: Parameters<Parameters<typeof exportsRepo.inExport>[2]>[0], companyId: string, ids: string[]) =>
    exportsRepo.record(
      tx,
      { id: randomUUID(), companyId, system: "pohoda", fromDate: "2026-11-01", toDate: "2026-11-30", fileName: "pohoda.xml", fileSha256: sha(), createdByUserId: randomUUID(), createdBy: "boss@test.cz" },
      ids,
    );

  it("two exports at once run one after another: the second sees what the first handed over", async () => {
    const company = randomUUID();
    const invoice = await issue(company, "2026-11-10");
    const seen: number[] = [];
    const run = () =>
      exportsRepo.inExport(company, "pohoda", async (tx) => {
        const before = await exportsRepo.exportedBefore(tx, company, "pohoda", [invoice.id]);
        seen.push(before.size);
        await new Promise((r) => setTimeout(r, 100));
        return record(tx, company, [invoice.id]);
      });
    await Promise.all([run(), run()]);
    expect(seen.sort()).toEqual([0, 1]);
  });

  it("reads the documents of the period and what was exported before a moment, for its own company only", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const inside = await issue(a, "2026-11-10");
    await issue(a, "2026-12-01");
    await issue(b, "2026-11-10");
    const made = await exportsRepo.inExport(a, "pohoda", async (tx) => {
      expect((await exportsRepo.issuedIn(tx, a, "2026-11-01", "2026-11-30", 100)).map((i) => i.id)).toEqual([inside.id]);
      return record(tx, a, [inside.id]);
    });
    await exportsRepo.inExport(a, "pohoda", async (tx) => {
      expect((await exportsRepo.exportedBefore(tx, a, "pohoda", [inside.id])).get(inside.id)).toMatchObject({ exportId: made.id });
      // Answered again for its idempotency key: it sees what its first answer saw (nothing exported before it).
      expect((await exportsRepo.exportedBefore(tx, a, "pohoda", [inside.id], made.createdAt)).size).toBe(0);
      expect((await exportsRepo.exportedBefore(tx, b, "pohoda", [inside.id])).size).toBe(0);
      expect(await exportsRepo.exportById(tx, b, made.id)).toBeNull();
    });
  });

  it("reads an export's recorded documents back by their ids, whatever their day, for its own company only (m1)", async () => {
    const [a, b] = [randomUUID(), randomUUID()];
    const one = await issue(a, "2026-11-10");
    const two = await issue(a, "2026-10-02");
    const theirs = await issue(b, "2026-11-10");
    const made = await exportsRepo.inExport(a, "pohoda", (tx) => record(tx, a, [one.id, two.id]));
    await exportsRepo.inExport(a, "pohoda", async (tx) => {
      const ids = await exportsRepo.documentIdsOf(tx, a, made.id);
      expect([...ids].sort()).toEqual([one.id, two.id].sort());
      expect((await exportsRepo.documentsByIds(tx, a, [...ids, theirs.id])).map((d) => d.id).sort()).toEqual([one.id, two.id].sort());
      expect(await exportsRepo.documentsByIds(tx, b, [one.id])).toEqual([]);
    });
  });
});

// ── Mock test council fixes (19 Nov 2026) ──

describe("an entry opened again by a take-back, and when statements were read (n2, P8, P11)", () => {
  /** A payment on an invoice of the company, taken back by mistake, as reversed, or live. */
  const payment = async (companyId: string, takeBack: "mistake" | "reversed" | null) => {
    const inv = await issue(companyId, "2026-11-10");
    const [made] = await db
      .insert(rp)
      .values({
        companyId,
        invoiceId: inv.id,
        kind: "payment",
        paidOn: "2026-11-16",
        amount: "1210.00",
        by: "boss@test.cz",
        confirmedAt: new Date(),
        ...(takeBack
          ? { takenBackAt: new Date(), takenBackBy: "boss@test.cz", takenBackReason: "wrong invoice", takenBackKind: takeBack, reversedOn: takeBack === "reversed" ? "2026-11-17" : null }
          : {}),
      })
      .returning();
    return { invoiceId: inv.id, number: inv.number, amount: 1210, paymentId: made!.id };
  };

  it("finds a confirmed entry a payment of which was taken back by mistake - not one reversed, not a live one, not one booked too long ago", async () => {
    const a = randomUUID();
    const st = (await repo.importStatement(statement(a, { fromDate: "2026-10-01", toDate: "2026-11-30" }), [
      entry(a, `${IBAN}|M-${randomUUID()}`),
      entry(a, `${IBAN}|R-${randomUUID()}`),
      entry(a, `${IBAN}|L-${randomUUID()}`),
      entry(a, `${IBAN}|O-${randomUUID()}`, { bookingDate: "2026-10-01" }),
    ]))!.statement;
    const rows = await repo.entriesOf(st);
    const [mistake, reversed, live, old] = await Promise.all([payment(a, "mistake"), payment(a, "reversed"), payment(a, null), payment(a, "mistake")]);
    for (const [row, allocation] of [
      [rows[1]!, mistake],
      [rows[2]!, reversed],
      [rows[3]!, live],
      [rows[0]!, old],
    ] as const) {
      await repo.confirm(a, row.id, row.version, decision, async () => [allocation]);
    }
    const found = await repo.reopenedIncoming(a, "2026-10-20");
    expect(found.map((x) => x.allocations[0]!.paymentId)).toEqual([mistake.paymentId]);
    expect(found[0]).toMatchObject({ status: "confirmed", fileName: st.fileName });
    // Another company's are never read.
    expect(await repo.reopenedIncoming(randomUUID(), "2026-10-20")).toEqual([]);

    const kinds = await repo.takenBackKinds(a, [mistake.paymentId, reversed.paymentId, live.paymentId]);
    expect([...kinds.takenBack].sort()).toEqual([mistake.paymentId, reversed.paymentId].sort());
    expect([...kinds.reversed]).toEqual([reversed.paymentId]);
    expect(await repo.takenBack(a, [mistake.paymentId, live.paymentId])).toEqual(new Set([mistake.paymentId]));
  });

  it("knows when the company last read a statement, null when never", async () => {
    const a = randomUUID();
    expect(await repo.lastImportAt(a)).toBeNull();
    const before = Date.now();
    await repo.importStatement(statement(a), []);
    const at = await repo.lastImportAt(a);
    expect(at).toBeInstanceOf(Date);
    expect(at!.getTime()).toBeGreaterThanOrEqual(before - 60_000);
    expect(await repo.lastImportAt(randomUUID())).toBeNull();
  });
});
