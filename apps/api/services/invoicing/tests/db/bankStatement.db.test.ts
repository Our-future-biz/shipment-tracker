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
});
