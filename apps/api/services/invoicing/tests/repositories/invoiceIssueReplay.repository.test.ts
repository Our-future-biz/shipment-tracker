import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName, type Table } from "drizzle-orm";

// Issuing against a stand-in for the database: the transaction records the series lock, what is
// read and what is written, and each read of a table is answered with the rows a test laid out.
const fake = vi.hoisted(() => {
  const state = {
    rows: {} as Record<string, Record<string, unknown>[]>,
    steps: [] as string[],
  };
  const read = (table: Table) => {
    const name = getTableName(table);
    state.steps.push(`read ${name}`);
    const rows = state.rows[name] ?? [];
    return Object.assign(Promise.resolve(rows), { limit: async () => rows, orderBy: async () => rows });
  };
  const tx = {
    execute: async () => {
      state.steps.push("lock");
    },
    select: () => ({ from: (table: Table) => ({ where: () => read(table) }) }),
    insert: (table: Table) => ({
      values: (values: Record<string, unknown> | Record<string, unknown>[]) => ({
        returning: async () => {
          state.steps.push(`insert ${getTableName(table)}`);
          return (Array.isArray(values) ? values : [values]).map((v, i) => ({ id: `new-${i}`, ...v }));
        },
      }),
    }),
  };
  const db = { transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx) };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { invoiceRepository } from "../../repositories/invoice.repository";

const header = { companyId: "c1", shipmentId: "s1", kind: "invoice", idempotencyKey: "k1" } as never;
const lines = [{ seq: 1, description: "Ocean freight" }] as never;

beforeEach(() => {
  fake.state.rows = {};
  fake.state.steps = [];
});

describe("issuing under the series lock", () => {
  it("gives back the document a request with the same key made while this one waited, before beforeInsert refuses its rows", async () => {
    fake.state.rows = { invoice: [{ id: "inv0", number: "INV2026CZ00000028-001" }], invoice_line: [{ id: "l0", invoiceId: "inv0" }] };
    const beforeInsert = vi.fn(async () => {
      throw new Error("Some of these selling rows were invoiced a moment ago");
    });
    const result = await invoiceRepository.issue("INV2026CZ00000028-", header, lines, { beforeInsert });
    expect(result).toEqual({ invoice: { id: "inv0", number: "INV2026CZ00000028-001" }, lines: [{ id: "l0", invoiceId: "inv0" }], replayed: true });
    expect(beforeInsert).not.toHaveBeenCalled();
    expect(fake.state.steps).toEqual(["lock", "read invoice", "read invoice_line"]);
  });

  it("issues when nobody used the key, and without a key never looks for one", async () => {
    const beforeInsert = vi.fn(async () => undefined);
    const keyed = await invoiceRepository.issue("INV2026CZ00000028-", header, lines, { beforeInsert });
    expect(keyed.replayed).toBe(false);
    expect(keyed.invoice).toMatchObject({ number: "INV2026CZ00000028-001", idempotencyKey: "k1" });
    expect(beforeInsert).toHaveBeenCalledTimes(1);
    expect(fake.state.steps).toEqual(["lock", "read invoice", "read invoice", "insert invoice", "insert invoice_line"]);

    fake.state.steps = [];
    await invoiceRepository.issue("INV2026CZ00000028-", { ...(header as object), idempotencyKey: null } as never, lines);
    expect(fake.state.steps).toEqual(["lock", "read invoice", "insert invoice", "insert invoice_line"]);
  });
});
