import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The filtered customer list, run against a stand-in for the database that records the condition
// it is asked for. What the statement returns from real rows is not checked here.
const fake = vi.hoisted(() => {
  const state = { wheres: [] as unknown[], selects: [] as Record<string, unknown>[] };
  const db = {
    select: (columns: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => {
          state.wheres.push(where);
          state.selects.push(columns);
          // The rows (ordered, limited) or, awaited as it is, the count of all that match.
          return { orderBy: () => ({ limit: async () => [] }), then: (resolve: (rows: { value: number }[]) => unknown) => resolve([{ value: 0 }]) };
        },
      }),
    }),
  };
  return { state, db };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { customerRepository } from "../../repositories/customer.repository";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";

const lastWhere = () => new PgDialect().sqlToQuery(fake.state.wheres.at(-1) as SQL);

beforeEach(() => {
  fake.state.wheres = [];
  fake.state.selects = [];
});

describe("listFiltered columns", () => {
  it("reads each company's last contact from its own live notes: the subquery names the customer row outright", async () => {
    await customerRepository.listFiltered(COMPANY, {});
    // In a single-table select drizzle drops table names, so an unqualified "id" in the subquery would be the note's.
    const { sql } = new PgDialect().sqlToQuery(fake.state.selects[0]!.lastContactAt as SQL);
    expect(sql).toBe(
      '(select max(note.created_at) from customer_note as note where note.customer_id = "customer"."id" and note.company_id = "customer"."company_id" and note.deleted_at is null)',
    );
  });
});

describe("viewCounts", () => {
  it("counts each view with the predicate its list filters by, live companies of the company only", async () => {
    expect(await customerRepository.viewCounts(COMPANY)).toEqual({ customers: 0, suppliers: 0, all: 0 });
    const columns = fake.state.selects[0]!;
    const render = (key: string) => new PgDialect().sqlToQuery(columns[key] as SQL);
    expect(render("customers").sql).toBe('count(*) filter (where "customer"."roles" @> $1)');
    expect(render("suppliers").sql).toBe('count(*) filter (where "customer"."roles" && $1)');
    expect(lastWhere().sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null)');
  });
});

describe("listFiltered by role", () => {
  it("keeps the companies whose roles include the one asked for, within the company", async () => {
    await customerRepository.listFiltered(COMPANY, { role: "haulier" });
    const { sql, params } = lastWhere();
    expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" @> $2)');
    // Drizzle sends the array as a Postgres array literal.
    expect(params).toEqual([COMPANY, '{"haulier"}']);
  });

  it("does not filter on roles when none is asked for", async () => {
    await customerRepository.listFiltered(COMPANY, {});
    expect(lastWhere().sql).not.toContain("roles");
  });
});

describe("listFiltered by kind", () => {
  it("keeps only companies with the customer role for the Customers view", async () => {
    await customerRepository.listFiltered(COMPANY, { kind: "customers" });
    const { sql, params } = lastWhere();
    expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" @> $2)');
    expect(params).toEqual([COMPANY, '{"customer"}']);
  });

  it("keeps companies with any supplier role for the Suppliers view, also those that are customers too", async () => {
    await customerRepository.listFiltered(COMPANY, { kind: "suppliers" });
    const { sql, params } = lastWhere();
    expect(sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" && $2)');
    expect(params).toEqual([COMPANY, '{"haulier","rail_operator","first_last_mile_haulier","shipping_line","co_loader"}']);
  });

  it("narrows the suppliers to one type when a role is asked for too", async () => {
    await customerRepository.listFiltered(COMPANY, { kind: "suppliers", role: "shipping_line" });
    expect(lastWhere().sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" @> $2 and "customer"."roles" && $3)');
  });
});

describe("listFiltered by owner, supplier type and rating", () => {
  it("keeps a Sales Owner's companies, or those with none (no user and no name)", async () => {
    await customerRepository.listFiltered(COMPANY, { salesOwner: "user-7" });
    expect(lastWhere()).toMatchObject({ sql: '("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."sales_owner_user_id" = $2)', params: [COMPANY, "user-7"] });
    await customerRepository.listFiltered(COMPANY, { salesOwner: "none" });
    expect(lastWhere().sql).toBe('("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."sales_owner_user_id" is null and btrim("customer"."sales_owner") = \'\')');
  });

  it("keeps the supplier types picked, and a rating band or not rated (0 is a rating)", async () => {
    await customerRepository.listFiltered(COMPANY, { anyRole: ["haulier", "co_loader"], rating: { max: 2 } });
    expect(lastWhere()).toMatchObject({
      sql: '("customer"."company_id" = $1 and "customer"."deleted_at" is null and "customer"."roles" && $2 and "customer"."supplier_rating" <= $3)',
      params: [COMPANY, '{"haulier","co_loader"}', 2],
    });
    await customerRepository.listFiltered(COMPANY, { rating: { min: 4 } });
    expect(lastWhere().sql).toContain('"customer"."supplier_rating" >= $2');
    await customerRepository.listFiltered(COMPANY, { rating: "unrated" });
    expect(lastWhere().sql).toContain('"customer"."supplier_rating" is null');
  });
});

describe("listFiltered by search", () => {
  it("looks for every word typed in the name, IČO, DIČ and city, folded: no diacritics, no case, % and _ literal", async () => {
    await customerRepository.listFiltered(COMPANY, { search: "Železný 50%" });
    const { sql, params } = lastWhere();
    expect(sql).toContain(`concat_ws(' ', "customer"."company_name", "customer"."ico", "customer"."dic", "customer"."city")`);
    expect(sql).toContain("normalize(");
    expect(params).toContain("%zelezny%");
    expect(params).toContain("%50\\%%");
  });
});
