import { beforeEach, describe, expect, it, vi } from "vitest";

// A new link where the database already keeps another live form for the shipment: the one-live-form
// index (shipment_import_instruction_live_uq) refuses it, and the repository says so instead of failing.
const transaction = vi.hoisted(() => vi.fn());
// A read: what it was asked, and the rows it returns.
const read = vi.hoisted(() => ({ where: undefined as unknown, orderBy: [] as unknown[], limit: 0, rows: [] as unknown[] }));
const select = vi.hoisted(() =>
  vi.fn(() => ({
    from: () => ({
      where: (where: unknown) => {
        read.where = where;
        return {
          orderBy: (...orderBy: unknown[]) => {
            read.orderBy = orderBy;
            return { limit: async (n: number) => ((read.limit = n), read.rows) };
          },
        };
      },
    }),
  })),
);
vi.mock("../../db/db", () => ({ db: { transaction, select } }));

import { PgDialect } from "drizzle-orm/pg-core";
import { LIVE_FORM_INDEX, shipmentImportInstructionRepository as repository } from "../../repositories/shipmentImportInstruction.repository";

const dialect = new PgDialect();
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as never);
  return { sql, params };
};

const values = { companyId: "c", shipmentId: "s", tokenHash: "h", prefill: {}, createdByUserId: "u", expiresAt: new Date() } as never;
// Drizzle wraps the driver's error: the SQLSTATE and the constraint are on its cause.
const refused = (constraint: string) => Object.assign(new Error("duplicate key"), { cause: { code: "23505", constraint } });

beforeEach(() => {
  transaction.mockReset();
});

describe("replaceOpen", () => {
  it("answers null when another live form of the shipment is kept already", async () => {
    transaction.mockRejectedValue(refused(LIVE_FORM_INDEX));
    await expect(repository.replaceOpen(values)).resolves.toBeNull();
  });

  it("lets any other refusal through", async () => {
    transaction.mockRejectedValue(refused("shipment_import_instruction_token_idx"));
    await expect(repository.replaceOpen(values)).rejects.toThrow("duplicate key");
    transaction.mockRejectedValue(new Error("connection lost"));
    await expect(repository.replaceOpen(values)).rejects.toThrow("connection lost");
  });

  it("returns the new row", async () => {
    transaction.mockResolvedValue({ id: "r1" });
    await expect(repository.replaceOpen(values)).resolves.toEqual({ id: "r1" });
  });
});

// System-21 mock council review: who pays the duty is read from the latest approved form, past a newer one.
describe("latestApproved", () => {
  it("reads the shipment's approved forms of the company, the latest decided first", async () => {
    read.rows = [{ id: "r1" }];
    await expect(repository.latestApproved("s", "c")).resolves.toEqual({ id: "r1" });
    expect(sent(read.where)).toEqual({
      sql: '("shipment_import_instruction"."shipment_id" = $1 and "shipment_import_instruction"."company_id" = $2 and "shipment_import_instruction"."status" = $3)',
      params: ["s", "c", "approved"],
    });
    expect(read.orderBy.map((o) => sent(o).sql)).toEqual(['"shipment_import_instruction"."decided_at" DESC NULLS LAST', '"shipment_import_instruction"."created_at" desc']);
    expect(read.limit).toBe(1);
  });

  it("is null when none was approved", async () => {
    read.rows = [];
    await expect(repository.latestApproved("s", "c")).resolves.toBeNull();
  });
});
