import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type SQL, type Table } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// Which shipments have had an invoice - issued here or by the old generator - read against a
// stand-in for the database that records each read and answers it with the rows a test laid out
// for that table. What the statements do to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = {
    /** What a read of each table finds, by table name. */
    rows: {} as Record<string, { shipmentId: string }[]>,
    reads: [] as { table: string; fields: Record<string, unknown>; where: unknown }[],
  };
  const db = {
    selectDistinct: (fields: Record<string, unknown>) => ({
      from: (table: Table) => ({
        where: async (where: unknown) => {
          const name = getTableName(table);
          state.reads.push({ table: name, fields, where });
          return state.rows[name] ?? [];
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { generatedInvoiceRepository } from "../../repositories/generatedInvoice.repository";
import { invoiceRepository } from "../../repositories/invoice.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const A = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
const B = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02";

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};

beforeEach(() => {
  fake.state.rows = {};
  fake.state.reads = [];
});

describe("invoiceRepository.shipmentIdsWithInvoices", () => {
  it("reads the caller's company's live invoices - credited ones too, credit notes not - of the shipments asked about", async () => {
    fake.state.rows.invoice = [{ shipmentId: A }];
    await expect(invoiceRepository.shipmentIdsWithInvoices([A, B], COMPANY)).resolves.toEqual([A]);
    const [read] = fake.state.reads;
    expect(read!.table).toBe("invoice");
    expect(sent(read!.where)).toEqual({
      sql: `("invoice"."company_id" = $1 and "invoice"."kind" = $2 and "invoice"."deleted_at" is null and "invoice"."shipment_id" in ($3, $4))`,
      params: [COMPANY, "invoice", A, B],
    });
    // No status: a credited invoice keeps its number, and with it the job's reference.
    expect(sent(read!.where).sql).not.toContain("status");
  });

  it("reads nothing for no shipments", async () => {
    await expect(invoiceRepository.shipmentIdsWithInvoices([], COMPANY)).resolves.toEqual([]);
    expect(fake.state.reads).toEqual([]);
  });
});

describe("generatedInvoiceRepository.shipmentIdsWithInvoices", () => {
  it("reads the caller's company's live invoices of the old generator, of the shipments asked about", async () => {
    fake.state.rows.generated_invoice = [{ shipmentId: B }];
    await expect(generatedInvoiceRepository.shipmentIdsWithInvoices([A, B], COMPANY)).resolves.toEqual([B]);
    const [read] = fake.state.reads;
    expect(read!.table).toBe("generated_invoice");
    expect(sent(read!.where)).toEqual({
      sql: `("generated_invoice"."company_id" = $1 and "generated_invoice"."deleted_at" is null and "generated_invoice"."shipment_id" in ($2, $3))`,
      params: [COMPANY, A, B],
    });
  });

  it("reads nothing for no shipments", async () => {
    await expect(generatedInvoiceRepository.shipmentIdsWithInvoices([], COMPANY)).resolves.toEqual([]);
    expect(fake.state.reads).toEqual([]);
  });
});
