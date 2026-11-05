import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// A manager's answer to a new supplier, a decline taken back, a restore and the pickers' list, run against
// a stand-in for the database that records what is written - and whether inside the transaction. What
// the statements do to real rows is not checked here.
const fake = vi.hoisted(() => {
  const state = {
    inTx: false,
    updates: [] as { table: unknown; values: Record<string, unknown>; where: unknown; inTx: boolean }[],
    selects: [] as { where: unknown }[],
    /** What each `.returning()` answers, in turn. */
    returning: [] as unknown[][],
    /** What each select answers, in turn. */
    found: [] as unknown[][],
  };
  const update = (table: unknown) => ({
    set: (values: Record<string, unknown>) => ({
      where: (where: unknown) => {
        state.updates.push({ table, values, where, inTx: state.inTx });
        return Object.assign(Promise.resolve(undefined), { returning: async () => state.returning.shift() ?? [] });
      },
    }),
  });
  const select = () => ({
    from: () => ({
      where: (where: unknown) => {
        state.selects.push({ where });
        const rows = async () => state.found.shift() ?? [];
        return { limit: rows, orderBy: rows };
      },
    }),
  });
  const db = {
    update,
    select,
    transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      state.inTx = true;
      try {
        return await work({ update, select });
      } finally {
        state.inTx = false;
      }
    },
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";
import { supplierApprovalRepository } from "../../repositories/supplierApproval.repository";
import { customerTable } from "../../schemas/customer.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const ID = "6f1c2b9e-1d3a-4c5b-8e7f-0a1b2c3d4e5f";
const ANSWER = { by: "boss@firm.cz", byUserId: "11111111-1111-4111-8111-111111111111", comment: "Unknown company" };
const sqlOf = (where: unknown) => new PgDialect().sqlToQuery(where as SQL);

beforeEach(() => {
  fake.state.inTx = false;
  fake.state.updates = [];
  fake.state.selects = [];
  fake.state.returning = [];
  fake.state.found = [];
});

describe("decide", () => {
  it("declines and deletes the company with what is filed under it in one transaction, with one stamp", async () => {
    fake.state.returning = [[{ id: ID, approvalStatus: "declined" }]];
    await expect(supplierApprovalRepository.decide(COMPANY, ID, { decision: "declined", ...ANSWER })).resolves.toEqual({ id: ID, approvalStatus: "declined" });
    const [customer, ...children] = fake.state.updates;
    expect(customer!.table).toBe(customerTable);
    expect(customer!.values).toMatchObject({ approvalStatus: "declined", approvalDecision: "declined", approvalComment: "Unknown company" });
    const stamp = customer!.values.deletedAt;
    expect(stamp).toBeInstanceOf(Date);
    // Its addresses, contacts, notes, documents, invoices and sites.
    expect(children).toHaveLength(6);
    for (const child of children) expect(child.values).toEqual({ deletedAt: stamp, updatedAt: stamp });
    expect(fake.state.updates.every((u) => u.inTx)).toBe(true);
    // Only one that still waits, and is live.
    const { sql } = sqlOf(customer!.where);
    expect(sql).toContain('"customer"."approval_status" = $');
    expect(sql).toContain('"customer"."deleted_at" is null');
  });

  it("approves without deleting anything", async () => {
    fake.state.returning = [[{ id: ID, approvalStatus: "" }]];
    await supplierApprovalRepository.decide(COMPANY, ID, { decision: "approved", ...ANSWER, comment: "" });
    expect(fake.state.updates).toHaveLength(1);
    expect(fake.state.updates[0]!.values).toMatchObject({ approvalStatus: "", approvalDecision: "approved" });
    expect(fake.state.updates[0]!.values).not.toHaveProperty("deletedAt");
  });

  it("writes nothing more for a supplier that no longer waits", async () => {
    fake.state.returning = [[]];
    await expect(supplierApprovalRepository.decide(COMPANY, ID, { decision: "declined", ...ANSWER })).resolves.toBeNull();
    expect(fake.state.updates).toHaveLength(1);
  });
});

describe("restoreWithChildren", () => {
  const stamp = new Date("2026-11-05T08:00:00Z");

  it("taking back a decline brings the company back waiting again, its answer wiped, only if a manager declined it", async () => {
    fake.state.found = [[{ deletedAt: stamp, approvalDecision: "declined", approvalStatus: "declined" }]];
    fake.state.returning = [[{ id: ID }]];
    await expect(customerRepository.restoreWithChildren(ID, COMPANY, "undoDecline")).resolves.toEqual({ id: ID });
    expect(sqlOf(fake.state.selects[0]!.where).sql).toContain('"customer"."approval_decision" = $');
    const [customer, ...children] = fake.state.updates;
    expect(customer!.values).toMatchObject({
      deletedAt: null,
      approvalStatus: "pending",
      approvalDecision: "",
      approvalDecidedBy: "",
      approvalDecidedByUserId: null,
      approvalDecidedAt: null,
      approvalComment: "",
      approvalAnswerSeenAt: null,
    });
    // Conditional: the stamp it was deleted with, and still declined - a second click finds nothing.
    const { sql, params } = sqlOf(customer!.where);
    expect(sql).toContain('"customer"."deleted_at" = $');
    expect(sql).toContain('"customer"."approval_decision" = $');
    expect(params).toContain("declined");
    expect(children).toHaveLength(6);
    expect(fake.state.updates.every((u) => u.inTx)).toBe(true);
  });

  it("is nothing for a decline already taken back (or a company not declined)", async () => {
    fake.state.found = [[]];
    await expect(customerRepository.restoreWithChildren(ID, COMPANY, "undoDecline")).resolves.toBeNull();
    expect(fake.state.updates).toEqual([]);
  });

  it("a restore of a declined supplier ends its decline: a company like any other", async () => {
    fake.state.found = [[{ deletedAt: stamp, approvalDecision: "declined", approvalStatus: "declined" }]];
    fake.state.returning = [[{ id: ID }]];
    await customerRepository.restoreWithChildren(ID, COMPANY);
    expect(fake.state.updates[0]!.values).toMatchObject({ deletedAt: null, approvalStatus: "", approvalDecision: "", approvalDecidedAt: null, approvalComment: "" });
  });

  it("a restore of any other company leaves its approval as it is", async () => {
    fake.state.found = [[{ deletedAt: stamp, approvalDecision: "approved", approvalStatus: "" }]];
    fake.state.returning = [[{ id: ID }]];
    await customerRepository.restoreWithChildren(ID, COMPANY);
    expect(Object.keys(fake.state.updates[0]!.values).sort()).toEqual(["deletedAt", "updatedAt"]);
  });
});

describe("listWithRole", () => {
  it("offers the pickers approved companies only: not one waiting for a manager, nor one declined", async () => {
    fake.state.found = [[]];
    await customerRepository.listWithRole(COMPANY, "haulier");
    const { sql, params } = sqlOf(fake.state.selects[0]!.where);
    expect(sql).toContain('"customer"."approval_status" = $');
    expect(params).toContain("");
  });

  it("finds a company looked up by id whatever it is", async () => {
    fake.state.found = [[]];
    await customerRepository.listWithRole(COMPANY, "haulier", [ID]);
    expect(sqlOf(fake.state.selects[0]!.where).sql).not.toContain("approval_status");
  });
});
