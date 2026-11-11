import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// What the Invoicing queue reads, against a stand-in for the database that records each read (its
// table, any join and its condition) and answers it with the rows a test laid out for that table.
const fake = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Record<string, unknown>[]>,
    reads: [] as { table: string; joined: string | null; where: unknown }[],
  };
  const from = (table: Table) => {
    let joined: string | null = null;
    const query = {
      innerJoin: (other: Table) => {
        joined = getTableName(other);
        return query;
      },
      where: async (where: unknown) => {
        const name = getTableName(table);
        state.reads.push({ table: name, joined, where });
        return state.rows[name] ?? [];
      },
    };
    return query;
  };
  const db = { select: () => ({ from }) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("../../repositories/truckingLines.repository", () => ({ truckingLinesLock: vi.fn() }));

import { invoiceRepository } from "../../repositories/invoice.repository";
import { sellingCostRepository } from "../../repositories/sellingCost.repository";
import { billingSettingsRepository } from "../../repositories/billingSettings.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";

const dialect = new PgDialect();
const sent = (piece: unknown) => dialect.sqlToQuery(piece as SQL);

beforeEach(() => {
  fake.state.rows = {};
  fake.state.reads = [];
});

describe("the Invoicing queue's reads", () => {
  it("reads the open invoices of the listed shipments only, and their lines through a join on the same shipments", async () => {
    fake.state.rows.invoice = [
      { id: "i1", shipmentId: A, number: "INV-001" },
      { id: "i2", shipmentId: B, number: "INV-002" },
    ];
    fake.state.rows.invoice_line = [
      { invoiceId: "i1", source: "s1" },
      { invoiceId: "i1", source: null },
      { invoiceId: "i2", source: "s9" },
    ];
    const open = await invoiceRepository.listOpenInvoicesWithSources([A, B, A], COMPANY);
    expect(open.map((i) => [i.id, i.sourceSellingCostIds])).toEqual([["i1", ["s1", null]], ["i2", ["s9"]]]);
    const [invoices, lines] = fake.state.reads;
    expect(sent(invoices!.where).params).toEqual([COMPANY, "invoice", "issued", A, B]);
    expect(sent(invoices!.where).sql).toContain(`"invoice"."shipment_id" in ($4, $5)`);
    // The lines are not asked for by a list of every invoice id (Postgres refuses past 65,535 parameters).
    expect(lines).toMatchObject({ table: "invoice_line", joined: "invoice" });
    expect(sent(lines!.where).params).toEqual([COMPANY, "invoice", "issued", A, B, COMPANY]);
    expect(sent(lines!.where).sql).not.toContain("invoice_id");
  });

  it("reads the selling rows and billing settings of the listed shipments only", async () => {
    await sellingCostRepository.listLiveByShipments([A, B], COMPANY);
    await billingSettingsRepository.listByShipments([A], COMPANY);
    const [rows, settings] = fake.state.reads;
    expect(rows!.table).toBe("invoice_selling_cost");
    expect(sent(rows!.where).params).toEqual([COMPANY, A, B]);
    expect(settings!.table).toBe("billing_settings");
    expect(sent(settings!.where).params).toEqual([COMPANY, A]);
  });

  it("reads nothing for a view that lists no shipments", async () => {
    await expect(invoiceRepository.listOpenInvoicesWithSources([], COMPANY)).resolves.toEqual([]);
    await expect(sellingCostRepository.listLiveByShipments([], COMPANY)).resolves.toEqual([]);
    await expect(billingSettingsRepository.listByShipments([], COMPANY)).resolves.toEqual([]);
    expect(fake.state.reads).toEqual([]);
  });
});
