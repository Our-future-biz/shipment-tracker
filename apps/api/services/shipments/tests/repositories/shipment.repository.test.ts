import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The parts of the repository that find the shipments of a sales quote and tell what the
// shipments say about customers, run against a stand-in for the database that records what is
// done, in order. What the statements do to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = {
    /** What the next read of shipments returns. */
    found: [] as Record<string, unknown>[],
    steps: [] as string[],
    locks: [] as unknown[],
    reads: [] as { fields: Record<string, unknown>; where: unknown; orderBy: unknown[] }[],
    inserted: [] as Record<string, unknown>[],
    /** What a read of one row per customer returns, and every such read. */
    perCustomer: [] as Record<string, unknown>[],
    perCustomerReads: [] as { on: unknown[]; fields: Record<string, unknown>; where: unknown; orderBy: unknown[] }[],
    /** The number a count reports, and the condition of every count. */
    total: 0 as number | string,
    counts: [] as unknown[],
    /** Company and sequence of every job number taken. */
    allocations: [] as [string, string][],
  };
  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(`${name} lock`);
      state.locks.push(query);
    },
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => ({
          orderBy: async (...orderBy: unknown[]) => {
            state.steps.push(`${name} read`);
            state.reads.push({ fields, where, orderBy });
            return state.found;
          },
          // A count is awaited as it is.
          then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
            state.steps.push(`${name} count`);
            state.counts.push(where);
            return Promise.resolve([{ value: state.total }]).then(resolve, reject);
          },
        }),
      }),
    }),
    selectDistinctOn: (on: unknown[], fields: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => ({
          orderBy: async (...orderBy: unknown[]) => {
            state.steps.push(`${name} read per customer`);
            state.perCustomerReads.push({ on, fields, where, orderBy });
            return state.perCustomer;
          },
        }),
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          state.steps.push(`${name} insert`);
          state.inserted.push(row);
          return [{ id: "shipment-new", ...row }];
        },
      }),
    }),
  });
  const tx = run("tx");
  const db = {
    ...run("db"),
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push("begin");
      const result = await work(tx);
      state.steps.push("commit");
      return result;
    },
  };
  // The next job number: taken inside the transaction that inserts the shipment.
  const counter = {
    allocate: async (on: unknown, companyId: string, sequence: string) => {
      state.steps.push(on === tx ? "tx job number" : "db job number");
      state.allocations.push([companyId, sequence]);
      return "CZ00000102";
    },
  };
  return { state, db, counter };
});

vi.mock("../../db/db", () => ({ db: fake.db }));
vi.mock("../../repositories/shipmentRefCounter.repository", () => ({ shipmentRefCounterRepository: fake.counter }));

import { SALES_REFERENCE_PATTERN } from "../../../../lib/salesReference";
import { shipmentRepository } from "../../repositories/shipment.repository";
import { shipmentTable } from "../../schemas/shipment.schema";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const REF = "QCZ20261010001";
const FIRST = { id: "shipment-1", jobNumber: "CZ00000101" };

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const sent = (piece: unknown) => {
  const { sql, params } = dialect.sqlToQuery(piece as SQL);
  return { sql, params };
};
const LIVE = '"shipment"."company_id" = $1 and "shipment"."deleted_at" is null';
// The one lock on a quote reference: whoever creates a shipment from the quote and whoever
// reports the quote's shipments take the same.
const REFERENCE_LOCK = { sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`shipment-from-quote:${COMPANY}:${REF}`] };
const OLDEST_FIRST = ['"shipment"."created_at" asc', '"shipment"."id" asc'];

beforeEach(() => {
  fake.state.found = [];
  fake.state.steps = [];
  fake.state.locks = [];
  fake.state.reads = [];
  fake.state.inserted = [];
  fake.state.perCustomer = [];
  fake.state.perCustomerReads = [];
  fake.state.total = 0;
  fake.state.counts = [];
  fake.state.allocations = [];
});

describe("salesReferenceShipments", () => {
  it("reads the company's live shipments whose trimmed Sales Number has the format of a sales reference, with that reference, the oldest first", async () => {
    fake.state.found = [{ ...FIRST, reference: REF }];
    await expect(shipmentRepository.salesReferenceShipments(COMPANY, SALES_REFERENCE_PATTERN)).resolves.toEqual([{ ...FIRST, reference: REF }]);
    const [read] = fake.state.reads;
    // The format is a parameter: the one pattern TypeScript tests references with.
    expect(sent(read!.where)).toEqual({ sql: `(${LIVE} and btrim("shipment"."sales_number") ~ $2)`, params: [COMPANY, SALES_REFERENCE_PATTERN] });
    expect(sent(read!.fields.reference).sql).toBe('btrim("shipment"."sales_number")');
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(OLDEST_FIRST);
  });
});

describe("withLiveBySalesNumber", () => {
  it("takes the lock on the quote, reads its shipments and hands them over - in that order, and holds the lock until that is done", async () => {
    fake.state.found = [FIRST];
    const tell = vi.fn(async (shipments: unknown) => {
      fake.state.steps.push("tell");
      return { told: shipments };
    });
    await expect(shipmentRepository.withLiveBySalesNumber(COMPANY, REF, tell)).resolves.toEqual({ told: [FIRST] });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "tell", "commit"]);
    expect(sent(fake.state.locks[0])).toEqual(REFERENCE_LOCK);
  });

  it("reads the company's live shipments whose trimmed Sales Number is the reference, the oldest first", async () => {
    await shipmentRepository.withLiveBySalesNumber(COMPANY, REF, async () => undefined);
    const [read] = fake.state.reads;
    expect(sent(read!.where)).toEqual({ sql: `(${LIVE} and btrim("shipment"."sales_number") = $2)`, params: [COMPANY, REF] });
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(OLDEST_FIRST);
    expect(Object.keys(read!.fields)).toEqual(["id", "jobNumber"]);
  });

  it("passes on what goes wrong while the shipments are handed over", async () => {
    await expect(shipmentRepository.withLiveBySalesNumber(COMPANY, REF, () => Promise.reject(new Error("quotes is unreachable")))).rejects.toThrow("quotes is unreachable");
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read"]);
  });
});

describe("createFromQuote", () => {
  const create = (allowSecond: boolean, data: Record<string, unknown> = {}) =>
    shipmentRepository.createFromQuote(COMPANY, REF, data as never, allowSecond);

  it("takes the lock on the quote, looks for its shipments, takes the next job number and inserts - in that order, in one transaction", async () => {
    await expect(create(false)).resolves.toEqual({ created: { id: "shipment-new", jobNumber: "CZ00000102", companyId: COMPANY, salesNumber: REF, createdFromQuote: true } });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "tx job number", "tx insert", "commit"]);
    expect(fake.state.allocations).toEqual([[COMPANY, "CZ"]]);
    // A lock that ends with the transaction, on this quote of this company alone.
    expect(sent(fake.state.locks[0])).toEqual(REFERENCE_LOCK);
    expect(sent(fake.state.reads[0]!.where).params).toEqual([COMPANY, REF]);
  });

  it("inserts nothing and takes no job number when the quote has a shipment and a second is not allowed - returning the oldest", async () => {
    fake.state.found = [FIRST, { id: "shipment-2", jobNumber: "CZ00000105" }];
    await expect(create(false)).resolves.toEqual({ existing: FIRST });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "commit"]);
  });

  it("inserts the second shipment when that is allowed", async () => {
    fake.state.found = [FIRST];
    await expect(create(true)).resolves.toHaveProperty("created");
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "tx job number", "tx insert", "commit"]);
  });

  it("stores the shipment under the caller's company, the quote's reference and the next job number, whatever the data says", async () => {
    await create(false, { jobNumber: "CZ00000001", pol: "Shanghai", companyId: "another-company", salesNumber: "typed by hand", createdFromQuote: false });
    expect(fake.state.inserted).toEqual([{ jobNumber: "CZ00000102", pol: "Shanghai", companyId: COMPANY, salesNumber: REF, createdFromQuote: true }]);
  });
});

describe("createWithJobNumber", () => {
  it("takes the company's next job number and inserts under it, in one transaction, whatever the data says", async () => {
    const data = { jobNumber: "CZ00000001", pol: "Hamburg", companyId: "another-company" };
    await expect(shipmentRepository.createWithJobNumber(COMPANY, data as never)).resolves.toMatchObject({ jobNumber: "CZ00000102", companyId: COMPANY });
    expect(fake.state.steps).toEqual(["begin", "tx job number", "tx insert", "commit"]);
    expect(fake.state.allocations).toEqual([[COMPANY, "CZ"]]);
    expect(fake.state.inserted).toEqual([{ jobNumber: "CZ00000102", pol: "Hamburg", companyId: COMPANY }]);
  });
});

describe("customerFacts", () => {
  it("reads one row per customer of the company's live shipments - its oldest shipment - and counts the shipments without a customer record", async () => {
    const facts = [
      {
        customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
        firstShipmentAt: new Date("2026-09-15T08:00:00.000Z"),
        firstShipmentId: "shipment-1",
        firstJobNumber: "CZ00000012",
        lastShipmentAt: new Date("2026-10-06T08:00:00.000Z"),
        shipmentCount: 2,
      },
    ];
    fake.state.perCustomer = facts;
    // Postgres reports a count as text.
    fake.state.total = "19";
    await expect(shipmentRepository.customerFacts(COMPANY)).resolves.toEqual({ customers: facts, shipmentsWithoutCustomer: 19 });

    const [read] = fake.state.perCustomerReads;
    expect(read!.on).toEqual([shipmentTable.customerId]);
    expect(sent(read!.where)).toEqual({ sql: `((${LIVE}) and "shipment"."customer_id" is not null)`, params: [COMPANY] });
    // The row DISTINCT ON keeps is the first in this order: per customer the oldest, as wherever
    // shipments are put in order.
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(['"shipment"."customer_id" asc', ...OLDEST_FIRST]);
    expect(sent(fake.state.counts[0])).toEqual({ sql: `((${LIVE}) and "shipment"."customer_id" is null)`, params: [COMPANY] });
  });

  it("takes the first shipment from the row kept, and the newest and the number from all of the customer's rows", async () => {
    await shipmentRepository.customerFacts(COMPANY);
    const { fields } = fake.state.perCustomerReads[0]!;
    expect(fields.firstShipmentAt).toBe(shipmentTable.createdAt);
    expect(fields.firstShipmentId).toBe(shipmentTable.id);
    expect(fields.firstJobNumber).toBe(shipmentTable.jobNumber);
    expect(sent(fields.lastShipmentAt).sql).toBe('max("shipment"."created_at") over (partition by "shipment"."customer_id")');
    expect(sent(fields.shipmentCount).sql).toBe('count(*) over (partition by "shipment"."customer_id")');
  });
});
