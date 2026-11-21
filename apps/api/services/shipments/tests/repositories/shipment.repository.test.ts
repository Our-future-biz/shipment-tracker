import { beforeEach, describe, expect, it, vi } from "vitest";
import { and, getTableColumns, sql, type SQL } from "drizzle-orm";
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
    /** How many rows each read that is cut asks for at most. */
    limits: [] as number[],
    inserted: [] as Record<string, unknown>[],
    /** What a read of one row per customer returns, and every such read. */
    perCustomer: [] as Record<string, unknown>[],
    perCustomerReads: [] as { on: unknown[]; fields: Record<string, unknown>; where: unknown; orderBy: unknown[] }[],
    /** The number a count reports, and the condition of every count (or other read awaited as it is). */
    total: 0 as number | string,
    counts: [] as unknown[],
    plainReads: [] as { fields: Record<string, unknown>; where: unknown }[],
    /** Company and sequence of every job number taken. */
    allocations: [] as [string, string][],
    /** Every update, and how many rows each one changes. */
    updates: [] as { values: Record<string, unknown>; where: unknown }[],
    updatedRows: 0,
  };
  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(`${name} lock`);
      state.locks.push(query);
    },
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => ({
          orderBy: (...orderBy: unknown[]) => {
            state.steps.push(`${name} read`);
            state.reads.push({ fields, where, orderBy });
            // A read is awaited as it is, or cut first.
            return Object.assign(Promise.resolve(state.found), {
              limit: async (limit: number) => {
                state.limits.push(limit);
                return state.found;
              },
            });
          },
          // A count is awaited as it is.
          then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
            state.steps.push(`${name} count`);
            state.counts.push(where);
            state.plainReads.push({ fields, where });
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
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: (where: unknown) => ({
          returning: async () => {
            state.steps.push(`${name} update`);
            state.updates.push({ values, where });
            return Array.from({ length: state.updatedRows }, (_, i) => ({ id: `shipment-${i}`, jobNumber: `CZFCL0000010${i}` }));
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

import { LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, SALES_REFERENCE_PATTERN } from "../../../../lib/salesReference";
import {
  INVOICING_FILTERS_WITH_LATE_CHARGES,
  attentionMatch,
  directionMatch,
  handledByMatch,
  invoicingPredicate,
  jobsOfMatch,
  modeMatch,
  personNameMatch,
  searchMatch,
  searchedColumns,
  shipmentRepository,
  tilePredicate,
} from "../../repositories/shipment.repository";
import { shipmentTable } from "../../schemas/shipment.schema";
import { CANCELLED_STATUS } from "../../lib/fieldDefaults";

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
  fake.state.limits = [];
  fake.state.inserted = [];
  fake.state.perCustomer = [];
  fake.state.perCustomerReads = [];
  fake.state.total = 0;
  fake.state.counts = [];
  fake.state.plainReads = [];
  fake.state.allocations = [];
  fake.state.updates = [];
  fake.state.updatedRows = 0;
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
    // Without the letters of the quote's Freight Mode: a copy from before they changed names the same quote.
    expect(sent(read!.where)).toEqual({
      sql: `(${LIVE} and regexp_replace(btrim("shipment"."sales_number"), $2, $3) = $4)`,
      params: [COMPANY, LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, REF],
    });
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(OLDEST_FIRST);
    expect(Object.keys(read!.fields)).toEqual(["id", "jobNumber"]);
  });

  it("takes one lock for the quote and looks it up without letters, whichever letters the reference has", async () => {
    await shipmentRepository.withLiveBySalesNumber(COMPANY, `QCZLCL${REF.slice(3)}`, async () => undefined);
    expect(sent(fake.state.locks[0])).toEqual(REFERENCE_LOCK);
    expect(sent(fake.state.reads[0]!.where).params.at(-1)).toBe(REF);
  });

  it("passes on what goes wrong while the shipments are handed over", async () => {
    await expect(shipmentRepository.withLiveBySalesNumber(COMPANY, REF, () => Promise.reject(new Error("quotes is unreachable")))).rejects.toThrow("quotes is unreachable");
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read"]);
  });
});

describe("createForHouseBol", () => {
  const HOUSE_LOCK = { sql: "select pg_advisory_xact_lock(hashtext($1))", params: [`shipment-house-bol:${COMPANY}:HBLTESTA1`] };
  const HOUSE_KEY_SQL = `regexp_replace(upper("shipment"."house_bol_number"), $2, '', 'g')`;

  it("takes the lock on the House B/L, looks for its shipment, takes the next job number and inserts - in that order, in one transaction", async () => {
    const alongside = vi.fn(async () => {
      fake.state.steps.push("alongside");
    });
    await expect(shipmentRepository.createForHouseBol(COMPANY, "HBLTEST-A1", { houseBolNumber: "HBLTEST-A1" } as never, alongside)).resolves.toEqual({
      created: { id: "shipment-new", houseBolNumber: "HBLTEST-A1", jobNumber: "CZ00000102", companyId: COMPANY },
    });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "tx job number", "tx insert", "alongside", "commit"]);
    // One lock per B/L of the company, however the B/L is written.
    expect(sent(fake.state.locks[0])).toEqual(HOUSE_LOCK);
    const [read] = fake.state.reads;
    expect(sent(read!.where)).toEqual({ sql: `(${LIVE} and ${HOUSE_KEY_SQL} = $3)`, params: [COMPANY, "[^A-Z0-9]", "HBLTESTA1"] });
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(OLDEST_FIRST);
  });

  it("inserts nothing when a live shipment has the House B/L already, and answers that one (the oldest)", async () => {
    fake.state.found = [FIRST, { id: "shipment-2", jobNumber: "CZ00000105" }];
    await expect(shipmentRepository.createForHouseBol(COMPANY, "hbltest/a1", {} as never)).resolves.toEqual({ existing: FIRST });
    expect(fake.state.steps).toEqual(["begin", "tx lock", "tx read", "commit"]);
    expect(sent(fake.state.locks[0])).toEqual(HOUSE_LOCK);
    expect(fake.state.inserted).toEqual([]);
  });
});

describe("liveByHouseBols", () => {
  it("reads the company's live shipments by the House B/Ls' keys, each key once, the oldest first", async () => {
    fake.state.found = [{ ...FIRST, key: "HBLTESTA1" }];
    await expect(shipmentRepository.liveByHouseBols(COMPANY, ["HBLTEST-A1", "hbltest a1", "HBL/B2", " - "])).resolves.toEqual([{ ...FIRST, key: "HBLTESTA1" }]);
    const [read] = fake.state.reads;
    expect(sent(read!.where).params).toEqual([COMPANY, "[^A-Z0-9]", "HBLTESTA1", "HBLB2"]);
    expect(Object.keys(read!.fields)).toEqual(["id", "jobNumber", "key"]);
  });

  it("asks nothing for B/Ls without letters or digits", async () => {
    await expect(shipmentRepository.liveByHouseBols(COMPANY, ["", " / "])).resolves.toEqual([]);
    expect(fake.state.reads).toEqual([]);
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
    expect(sent(fake.state.reads[0]!.where).params).toEqual([COMPANY, LETTERED_SALES_REFERENCE, PLAIN_SALES_REFERENCE_REPLACEMENT, REF]);
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

  it("writes what comes with the new shipment in that transaction, handed the row, before the commit", async () => {
    const handed: { onTx: boolean; id: string }[] = [];
    await shipmentRepository.createWithJobNumber(COMPANY, { pol: "Hamburg" } as never, async (tx, created) => {
      // The transaction's own handle: a read through it is a step of the transaction.
      await tx.execute(sql`select 1`);
      handed.push({ onTx: fake.state.steps.at(-1) === "tx lock", id: created.id });
    });
    expect(handed).toEqual([{ onTx: true, id: "shipment-new" }]);
    expect(fake.state.steps).toEqual(["begin", "tx job number", "tx insert", "tx lock", "commit"]);
  });

  it("is not committed when what comes with it fails, and fails as that did", async () => {
    const failure = new Error("container rejected");
    await expect(
      shipmentRepository.createWithJobNumber(COMPANY, { pol: "Hamburg" } as never, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(fake.state.steps).toEqual(["begin", "tx job number", "tx insert"]);
  });
});

describe("softDeleteWithEvent", () => {
  const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
  const actor = { userId: "5a7c9e11-3b2d-4f6a-8c0e-1d2f3a4b5c01", role: "manager" };

  it("deletes and owes the event in the write turn it is handed, opening no transaction of its own", async () => {
    fake.state.updatedRows = 1;
    const deleted = await fake.db.transaction((tx) => shipmentRepository.softDeleteWithEvent(ID, COMPANY, actor, tx as never));
    expect(deleted).toBe(true);
    expect(fake.state.steps).toEqual(["begin", "tx update", "commit"]);
    expect(fake.state.updates[0]!.values).toMatchObject({ deletedAt: expect.any(Date) });
  });

  it("opens a transaction of its own without one, and owes nothing for a shipment that wasn't live", async () => {
    fake.state.updatedRows = 1;
    await expect(shipmentRepository.softDeleteWithEvent(ID, COMPANY, actor)).resolves.toBe(true);
    expect(fake.state.steps).toEqual(["begin", "tx update", "commit"]);
    fake.state.updatedRows = 0;
    await expect(shipmentRepository.softDeleteWithEvent(ID, COMPANY, actor)).resolves.toBe(false);
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

describe("searchedColumns", () => {
  // The text the Shipments search looks in for the chosen grid columns, as Postgres gets it.
  const searched = (keys: string[]) => sent(sql.join(searchedColumns(keys), sql`, `)).sql;

  it("looks in the chosen shipment columns, always with the Internal Reference", () => {
    expect(searched(["houseBolNumber", "shipper"])).toBe('"shipment"."job_number", "shipment"."house_bol_number", "shipment"."shipper"');
    expect(searched(["jobNumber"])).toBe('"shipment"."job_number"');
  });

  it("reads a master job by its MCZ and the containers by their numbers or seals", () => {
    expect(searched(["masterJob"])).toContain('SELECT "master_job"."mcz_number" FROM "master_job"');
    expect(searched(["containerNumber"])).toContain('string_agg("container"."container_number"');
    expect(searched(["sealNumber"])).toContain('string_agg("container"."seal_number"');
  });

  it("reads a date as the grid shows it", () => {
    expect(searched(["estimatedDeparture"])).toBe(`"shipment"."job_number", to_char("shipment"."estimated_departure", 'DD.MM.YYYY')`);
  });

  it("reads the Load Type as the grid shows it: by Air Freight a Full Load is a Single Shipment", () => {
    expect(searched(["loadType"])).toBe(
      `"shipment"."job_number", CASE WHEN "shipment"."load_type" = 'Full Load' AND "shipment"."freight_mode" ~* '^air'\n  THEN 'Single Shipment' ELSE "shipment"."load_type" END`,
    );
  });

  it("reads Handled By and Holiday Cover as stored (an e-mail, a legacy \"e-mail — Name\"); their names are searchMatch's", () => {
    expect(searched(["personInCharge", "holidayCover"])).toBe('"shipment"."job_number", "shipment"."person_in_charge", "shipment"."holiday_cover"');
  });

  it("leaves out what the browser works out and keys it doesn't know, an object's own names among them", () => {
    expect(searched(["freightTon", "estimatedDepartureWeek", "profit", "nonsense"])).toBe('"shipment"."job_number"');
    expect(searched(["constructor", "toString", "__proto__", "hasOwnProperty"])).toBe('"shipment"."job_number"');
  });
});

describe("a person searched by the name the grid shows (mock council S7-5)", () => {
  const names = new Map([
    ["eva.mala@cto.cz", "Eva Malá"],
    ["jan@cto.cz", "Jan Novák"],
    ["jana@cto.cz", "Jana Nováková"],
  ]);
  const EMAIL_OF = (column: string) => `lower(btrim(split_part("shipment"."${column}", ' — ', 1), $`;

  it("compares the person columns with the e-mails of the users whose name holds the word, as bound parameters", () => {
    const { sql: text, params } = sent(personNameMatch([shipmentTable.personInCharge, shipmentTable.holidayCover], names, "novak"));
    expect(text).toContain(`${EMAIL_OF("person_in_charge")}`);
    expect(text).toContain(`${EMAIL_OF("holiday_cover")}`);
    expect(text).not.toMatch(/CASE/);
    expect(params.filter((p) => p === "jan@cto.cz" || p === "jana@cto.cz")).toHaveLength(4);
    expect(params).not.toContain("Jan Novák");
    // No user's name holds it, no columns, a typed % kept literal: nothing.
    expect(personNameMatch([shipmentTable.personInCharge], names, "koubek")).toBeUndefined();
    expect(personNameMatch([], names, "novak")).toBeUndefined();
    expect(personNameMatch([shipmentTable.personInCharge], names, "\\%")).toBeUndefined();
  });

  it("searching all fields: Handled By and Holiday Cover too, by their stored text and by the user's name", () => {
    const { sql: text, params } = sent(searchMatch("Malá", undefined, names));
    for (const column of ["person_in_charge", "holiday_cover"]) {
      expect(text).toContain(`split_part(split_part("shipment"."${column}", ' — ', 1), '@', 1)`);
      expect(text).toContain(`split_part("shipment"."${column}", ' — ', 2)`);
    }
    expect(text).toContain(`${EMAIL_OF("person_in_charge")}`);
    expect(params).toContain("%mala%");
    expect(params).toContain("eva.mala@cto.cz");
    // The main search sends no names: as before, no person columns.
    expect(sent(searchMatch("Malá")).sql).not.toContain("person_in_charge");
  });

  it("searching all fields: never a person's whole stored e-mail, so its domain finds no job (Shipments review)", () => {
    // "logistics" of "…@cto-logistics.cz" would find every job its people handle.
    const { sql: text } = sent(searchMatch("logistics", undefined, names));
    // A column joined into the searched text is one of concat_ws's arguments, after ", ".
    expect(text).not.toMatch(/, "shipment"\."(person_in_charge|holiday_cover)"[,)]/);
    expect(text).not.toContain('normalize("shipment"."person_in_charge"');
    expect(text).toContain(`split_part(split_part("shipment"."person_in_charge", ' — ', 1), '@', 1)`);
    // An e-mail typed, "@" and all, is looked for in the whole stored text: that word alone.
    const typed = sent(searchMatch("jan@firma Shanghai", undefined, names));
    expect(typed.sql).toContain(`normalize("shipment"."person_in_charge", NFD)`);
    expect(typed.sql).toContain(`normalize("shipment"."holiday_cover", NFD)`);
    expect(typed.params.filter((p) => p === "%jan@firma%")).toHaveLength(3);
    expect(typed.params.filter((p) => p === "%shanghai%")).toHaveLength(1);
    // Chosen columns hold the person column's stored text already.
    expect(sent(searchMatch("jan@firma", ["pol"], names)).sql).not.toContain("person_in_charge");
  });

  it("searching chosen columns: only the chosen person columns by the name; others not at all", () => {
    const chosen = sent(searchMatch("Malá", ["personInCharge", "pol"], names)).sql;
    expect(chosen).toContain(`${EMAIL_OF("person_in_charge")}`);
    expect(chosen).not.toContain("holiday_cover");
    expect(sent(searchMatch("Malá", ["pol"], names)).sql).not.toContain("split_part");
    // A reference word keeps its number match beside the name.
    const both = sent(searchMatch("czfcl00000023", ["personInCharge"], new Map([["x@cto.cz", "CZFCL00000023 desk"]]))).sql;
    expect(both).toContain("substring(");
    expect(both).toContain("split_part");
  });
});

describe("searchMatch", () => {
  const DIGITS = `substring("shipment"."job_number" from '^CZ(?:PROJECT|RAIL|ROAD|AIR|FCL|LCL|BB)?([0-9]+)$')`;

  it("finds a word written as a reference also by its number, whatever the letters, and digits still being typed by the numbers they start", () => {
    const { sql, params } = sent(searchMatch("czfcl00000023 Shanghai", ["pol"]));
    // The reference word: in the text, or the number after any letters.
    const word = params.indexOf("%czfcl00000023%") + 1;
    expect(sql).toContain(`LIKE $${word} OR ${DIGITS} LIKE $${word + 1})`);
    expect(params[word]).toBe("00000023%");
    // Any other word only in the text.
    expect(params.at(-1)).toBe("%shanghai%");
    expect(sql.match(/substring\(/g)).toHaveLength(1);
  });

  it("looks for no number in a word that is no reference: plain digits, a quote's CZQ…", () => {
    for (const search of ["00000023", "CZQ00000023", "QCZ20261010001"]) expect(sent(searchMatch(search)).sql).not.toContain("substring(");
    expect(searchMatch("   ")).toBeUndefined();
  });

  it("searches a grid that shows every column: no call gets more than the 100 arguments Postgres takes", () => {
    const keys = Object.keys(getTableColumns(shipmentTable)).concat("masterJob", "containerNumber", "sealNumber");
    expect(searchedColumns(keys).length).toBeGreaterThan(100);
    const text = sent(searchMatch("czlcl00000035", keys)).sql;
    // The arguments of each concat_ws: its commas outside any inner brackets or quotes, plus one.
    const argCounts = [...text.matchAll(/concat_ws\(/g)].map((m) => {
      let depth = 1, quoted = false, args = 1;
      for (let at = m.index! + m[0].length; depth > 0; at++) {
        const c = text[at];
        if (c === "'") quoted = !quoted;
        else if (quoted) continue;
        else if (c === "(") depth++;
        else if (c === ")") depth--;
        else if (c === "," && depth === 1) args++;
      }
      return args;
    });
    expect(argCounts.length).toBeGreaterThan(1);
    expect(Math.max(...argCounts)).toBeLessThanOrEqual(100);
    // Every column is still in the text that is searched.
    expect(text).toContain('"shipment"."house_bol_number"');
    expect(text).toContain('string_agg("container"."seal_number"');
  });
});

// What Shipments → Managers' tiles open the list with. Only the statements are checked here; what
// they find in real rows - and that it is what the cockpit counts - is tests/db/managersListFilters.
describe("the list's Handled By filter", () => {
  const EMAIL = `lower(btrim(split_part("shipment"."person_in_charge", ' — ', 1), $1))`;
  // What is trimmed off the stored value, as JavaScript's trim() does for typed or pasted text:
  // space, tab, line feed, carriage return, no-break space.
  const TRIMMED = " \t\n\r\u00a0";

  it("finds the jobs whose Handled By names the e-mail, trimmed and in any case, before any name after it", () => {
    expect(sent(handledByMatch(" Jan@Firma.cz "))).toEqual({ sql: `${EMAIL} = $2`, params: [TRIMMED, "jan@firma.cz"] });
    expect(sent(handledByMatch("\tjan@firma.cz\n"))).toEqual({ sql: `${EMAIL} = $2`, params: [TRIMMED, "jan@firma.cz"] });
  });

  it("trims a stored value of the whitespace the cockpit's personEmail trims", () => {
    expect([...TRIMMED].map((c) => c.codePointAt(0))).toEqual([32, 9, 10, 13, 160]);
    expect(`${TRIMMED}jan@firma.cz${TRIMMED}`.trim()).toBe("jan@firma.cz");
  });

  it("finds the jobs with nobody in Handled By for \"nobody\"", () => {
    expect(sent(handledByMatch("nobody"))).toEqual({ sql: `${EMAIL} = $2`, params: [TRIMMED, ""] });
    expect(sent(handledByMatch(" Nobody "))).toEqual({ sql: `${EMAIL} = $2`, params: [TRIMMED, ""] });
  });

  it("asks nothing when no person is given", () => {
    expect(handledByMatch(undefined)).toBeUndefined();
    expect(handledByMatch("   ")).toBeUndefined();
  });
});

// The list's "My jobs" button (mock council S9-1): the person's jobs, and those they cover.
describe("the list's My jobs filter", () => {
  const PERSON = (column: string, n: number) => `lower(btrim(split_part("shipment"."${column}", ' — ', 1), $${n}))`;
  const TRIMMED = " \t\n\r ";

  it("finds the jobs whose Handled By or Holiday Cover names the e-mail, trimmed and in any case", () => {
    expect(sent(jobsOfMatch(" Jan@Firma.cz "))).toEqual({
      sql: `(${PERSON("person_in_charge", 1)} = $2 OR ${PERSON("holiday_cover", 3)} = $4)`,
      params: [TRIMMED, "jan@firma.cz", TRIMMED, "jan@firma.cz"],
    });
  });

  it("asks nothing when no person is given, and has no word for nobody", () => {
    expect(jobsOfMatch(undefined)).toBeUndefined();
    expect(jobsOfMatch("  ")).toBeUndefined();
    expect(sent(jobsOfMatch("nobody")).params).toEqual([TRIMMED, "nobody", TRIMMED, "nobody"]);
  });
});

describe("the list's mode filter", () => {
  // freightKindOf (lib/trackingEvents), rule for rule: a Trucking job or "road" in the Freight
  // Mode is road; otherwise a mode starting with "air" is air, with "rail" rail; the rest is sea.
  const ROAD = `(("shipment"."trade_direction" ~* '^\\s*domestic\\s*$' OR "shipment"."department" ~* $1) OR "shipment"."freight_mode" ~* 'road')`;
  const AIR = `"shipment"."freight_mode" ~* '^\\s*air'`;
  const RAIL = `"shipment"."freight_mode" ~* '^\\s*rail'`;
  const TRUCKING_DEPARTMENT = ["^\\s*Road Department\\s*$"];

  it("reads road, air, rail and sea as freightKindOf does, road first and sea as what is left", () => {
    expect(sent(modeMatch("road"))).toEqual({ sql: ROAD, params: TRUCKING_DEPARTMENT });
    expect(sent(modeMatch("air"))).toEqual({ sql: `(NOT ${ROAD} AND ${AIR})`, params: TRUCKING_DEPARTMENT });
    expect(sent(modeMatch("rail"))).toEqual({ sql: `(NOT ${ROAD} AND ${RAIL})`, params: TRUCKING_DEPARTMENT });
    expect(sent(modeMatch("sea"))).toEqual({ sql: `(NOT ${ROAD} AND NOT ${AIR} AND NOT ${RAIL})`, params: TRUCKING_DEPARTMENT });
  });

  it("asks nothing for all modes, none, or a word that is no mode - an object's own names among them", () => {
    for (const mode of [undefined, "", "all", "Sea", "ocean", "constructor", "toString"]) expect(modeMatch(mode)).toBeUndefined();
  });
});

describe("the list's Trade Direction filter", () => {
  // lib/managersCockpit inDirection, in SQL: the stored value trimmed as JavaScript's trim() trims it, in any case.
  const DIRECTION = `lower(btrim("shipment"."trade_direction", $1)) = $2`;
  const TRIMMED = " \t\n\r ";

  it("finds the jobs of the direction Shipments → Managers counts, however the stored value is written", () => {
    expect(sent(directionMatch("import"))).toEqual({ sql: DIRECTION, params: [TRIMMED, "import"] });
    expect(sent(directionMatch("export"))).toEqual({ sql: DIRECTION, params: [TRIMMED, "export"] });
    expect(sent(directionMatch("domestic"))).toEqual({ sql: DIRECTION, params: [TRIMMED, "domestic"] });
  });

  it("reads the direction asked for trimmed and in any case", () => {
    expect(sent(directionMatch(" Import "))).toEqual({ sql: DIRECTION, params: [TRIMMED, "import"] });
    expect(sent(directionMatch("EXPORT"))).toEqual({ sql: DIRECTION, params: [TRIMMED, "export"] });
  });

  it("asks nothing for all directions, none, or a word that is no direction", () => {
    for (const direction of [undefined, "", "  ", "all", "cross trade", "imports", "constructor", "toString"]) expect(directionMatch(direction), direction).toBeUndefined();
  });
});

describe("the list's tile filters", () => {
  const ACTIVE = `"shipment"."invoicing_status" IS DISTINCT FROM 'Invoiced' AND "shipment"."status" IS DISTINCT FROM $1`;

  // Review: an open claim on costs sets the Claim field too, and Accounts Payable raises those on
  // invoiced jobs - a job no longer active is the managers' for an open cargo claim only. n21: one
  // with something filled in, by the Claim field's own test - a row added with "+" is no claim.
  const OPEN_CARGO_CLAIM = `EXISTS (
  SELECT 1 FROM "shipment_claim" cargo_claim
  WHERE cargo_claim.shipment_id = "shipment"."id"
    AND cargo_claim.company_id = "shipment"."company_id"
    AND cargo_claim.deleted_at IS NULL
    AND cargo_claim.kind = 'cargo'
    AND cargo_claim.status IN ('open', 'notified', 'with_insurer')
    AND (btrim(cargo_claim.cargo_state || cargo_claim.note || cargo_claim.supplier || cargo_claim.invoice_number || cargo_claim.reason || cargo_claim.amount || cargo_claim.claim_currency) <> ''
      OR cargo_claim.supplier_invoice_id IS NOT NULL OR cargo_claim.claim_amount IS NOT NULL)
)`;

  it("claims: an active job with a claim, and an Invoiced or cancelled one with an open cargo claim (X8) - the jobs Shipments → Managers counts under Open claims", () => {
    expect(sent(tilePredicate("claims"))).toEqual({ sql: `"shipment"."claim" = 'Yes' AND ((${ACTIVE}) OR ${OPEN_CARGO_CLAIM})`, params: ["Cancelled Shipment"] });
  });

  it("the cockpit's read of the jobs no longer active that have an open cargo claim: the company's live ones, Invoiced or cancelled, the newest first, cut", async () => {
    await shipmentRepository.managersCockpitClaimOnlyRows(COMPANY, 500);
    const [read] = fake.state.reads;
    expect(sent(read!.where)).toEqual({
      sql: `(${LIVE} and NOT (${ACTIVE.replace("$1", "$2")}) and "shipment"."claim" = $3 and ${OPEN_CARGO_CLAIM})`,
      params: [COMPANY, "Cancelled Shipment", "Yes"],
    });
    expect(read!.orderBy.map((o) => sent(o).sql)).toEqual(['"shipment"."created_at" desc', '"shipment"."id" desc']);
    expect(fake.state.limits).toEqual([500]);
    // The same columns as the active jobs' read: one rule set judges both.
    await shipmentRepository.managersCockpitRows(COMPANY, 10);
    expect(Object.keys(fake.state.reads[1]!.fields)).toEqual(Object.keys(read!.fields));
    expect(Object.keys(read!.fields)).toEqual(expect.arrayContaining(["incotermOrigin", "incotermDestination", "pcs", "totalWeightTons", "totalVolumeCbm", "claim"]));
  });

  it("keeps the tiles the list had, and asks nothing for all or a word that is no tile", () => {
    expect(sent(tilePredicate("active"))).toEqual({ sql: ACTIVE, params: ["Cancelled Shipment"] });
    for (const tile of ["etamoved", "import", "export", "week", "nextweek"]) expect(tilePredicate(tile)).toBeDefined();
    for (const tile of [undefined, "", "all", "free-time", "constructor"]) expect(tilePredicate(tile)).toBeUndefined();
  });

  it("has none for cut-offs or a pending booking: Shipments → Managers judges those by rules no statement repeats, and narrows its own cards", () => {
    for (const tile of ["cutoffs", "booking-pending"]) expect(tilePredicate(tile)).toBeUndefined();
  });

  it("has no statement for Needs Attention: what is due is judged in TypeScript, and its list is asked for by ids", () => {
    expect(tilePredicate("attention")).toBeUndefined();
    const [A, B] = ["7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01", "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c02"];
    expect(sent(attentionMatch([A, B]))).toEqual({ sql: '"shipment"."id" in ($1, $2)', params: [A, B] });
    // No job named - or no ids handed over at all - finds nothing, never everything.
    expect(sent(attentionMatch([]))).toEqual({ sql: "false", params: [] });
    expect(sent(attentionMatch(undefined))).toEqual({ sql: "false", params: [] });
  });
});

describe("the Invoicing page's lists (User Council B4 / Q9)", () => {
  const BILLING = `"shipment"."status" IN ('Billing [IMP]', 'Billing [EXP]', 'Billing [DOM]')`;
  const RELEASED = `(${BILLING} AND "shipment"."invoicing_status" IS DISTINCT FROM 'Invoiced')`;
  const INVOICED = `"shipment"."invoicing_status" = 'Invoiced'`;
  const UNBILLED_ARRIVAL = sent(invoicingPredicate("unbilled-arrivals")).sql;
  // CZFCL00000055: invoiced while "Booking Confirmation Pending", demurrage EUR 150 added after - invoicing names it.
  const JOB_55 = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c55";

  it("To bill: released and not invoiced yet, or a job with a charge added after its invoice, whatever its status", () => {
    expect(sent(invoicingPredicate("billing", [JOB_55]))).toEqual({ sql: `(${RELEASED} OR "shipment"."id" in ($1))`, params: [JOB_55] });
    // No such job named finds none of them - never everything.
    expect(sent(invoicingPredicate("billing", []))).toEqual({ sql: `(${RELEASED} OR false)`, params: [] });
    expect(sent(invoicingPredicate("billing"))).toEqual({ sql: `(${RELEASED} OR false)`, params: [] });
  });

  // Owner's decision (a434fd85), kept by the chair: released for billing or invoiced, cancelled ones left out - now
  // with To bill's late-charge jobs (Q9). The unbilled arrivals stay their own tab.
  // Mock council S5-1 / X-2, answer R10: a late-charge job is in All whatever its status, a cancelled one too, so To
  // bill stays a part of All (the cancelled job is marked Cancelled on the queue).
  it("All: released for billing or invoiced, cancelled ones left out, plus To bill's late charges whatever their status - no unbilled arrivals", () => {
    const { sql, params } = sent(invoicingPredicate("all", [JOB_55]));
    expect(sql).toBe(`(((${RELEASED} OR ${INVOICED}) AND "shipment"."status" IS DISTINCT FROM $1) OR "shipment"."id" in ($2))`);
    expect(params).toEqual([CANCELLED_STATUS, JOB_55]);
    expect(sql).not.toContain("NOT ILIKE 'bill%'");
    // No late-charge job named: All is released or invoiced, never everything.
    expect(sent(invoicingPredicate("all")).sql).toBe(`(((${RELEASED} OR ${INVOICED}) AND "shipment"."status" IS DISTINCT FROM $1) OR false)`);
    // Every late-charge job To bill takes in, All takes in too.
    expect(sent(invoicingPredicate("billing", [JOB_55])).sql).toContain(`"shipment"."id" in ($1)`);
  });

  // System-21 mock council review: listFiltered joins the list's predicate with the company, deleted and other filters
  // by and(); All's OR must stay inside its own brackets, or a late-charge job of another company, a deleted one, or
  // one another filter leaves out would be listed.
  it("All and To bill each stay one bracketed condition, so and() keeps the company, deleted and other filters over their late charges", () => {
    for (const filter of INVOICING_FILTERS_WITH_LATE_CHARGES) {
      const joined = sent(and(sql`"shipment"."company_id" = 'c1'`, sql`"shipment"."deleted_at" IS NULL`, invoicingPredicate(filter, [JOB_55]))).sql;
      const own = sent(invoicingPredicate(filter, [JOB_55])).sql;
      expect(joined).toBe(`("shipment"."company_id" = 'c1' and "shipment"."deleted_at" IS NULL and ${own})`);
      // The predicate opens with a bracket that closes only at its end: nothing of it stands outside.
      let depth = 0;
      for (const [i, ch] of [...own].entries()) {
        depth += ch === "(" ? 1 : ch === ")" ? -1 : 0;
        if (depth === 0) expect(i).toBe(own.length - 1);
      }
    }
  });

  it("keeps Invoiced and the unbilled arrivals as they were, and asks nothing for a word that is no list", () => {
    expect(sent(invoicingPredicate("invoiced", [JOB_55]))).toEqual({ sql: INVOICED, params: [] });
    expect(UNBILLED_ARRIVAL).toContain(`"shipment"."status" NOT ILIKE 'bill%'`);
    expect(sent(invoicingPredicate("unbilled-arrivals", [JOB_55])).params).not.toContain(JOB_55);
    for (const filter of ["", "billed", "constructor", "toString"]) expect(invoicingPredicate(filter, [JOB_55])).toBeUndefined();
  });

  it("only All and To bill take in the late charges: the service asks invoicing for them for those two", () => {
    expect(INVOICING_FILTERS_WITH_LATE_CHARGES).toEqual(["all", "billing"]);
  });
});

describe("what Needs Attention reads", () => {
  const RANGE = { from: "2026-11-18", until: "2026-11-23", passedSince: "2026-11-11", etdSince: "2026-11-17" };
  const col = (name: string) => `"shipment"."${name}"`;
  const fourDaysBeforeEtd = `(${col("estimated_departure")} - 4)`;

  it("reads the company's active jobs with a plain date ahead in the two windows, or - on a job that has not left - a cut-off date in them, or one that passed while the ETD is not before etdSince, or lately with no ETD", async () => {
    await shipmentRepository.needsAttentionCandidates(COMPANY, RANGE, 2001);
    const [read] = fake.state.reads;
    const { sql, params } = sent(read!.where);
    const ahead = (date: string) => `${date} BETWEEN ?::date AND ?::date`;
    const passed = (date: string) => `${date} < ?::date`;
    const plain = ["cargo_readiness_date", "pickup_date", "estimated_departure", "estimated_arrival", "eta_warehouse", "planned_delivery_date"].map(col);
    // No status is asked: whether a cut-off's work is done is the rule's to say.
    const typed = ["closing_date", "vgm_closing", "si_closing", "ams_deadline", "isf_deadline"].map(col);
    const cutoffs = [...typed, fourDaysBeforeEtd];
    // Left is an ATD, an ATA or an actual delivery: such a job has no cut-off.
    const notLeft = `${col("actual_departure")} IS NULL AND ${col("actual_arrival")} IS NULL AND ${col("actual_delivery_date")} IS NULL`;
    // A passed cut-off counts while "ETD passed, no ATD" may not have taken over: the ETD not before etdSince ...
    const passedBeforeEtd = `(${col("estimated_departure")} >= ?::date AND (${cutoffs.map(passed).join(" OR ")}))`;
    // ... and with no ETD only for the days the rule keeps it: the typed dates, each within them.
    const passedLately = `(${col("estimated_departure")} IS NULL AND (${typed.map((date) => `(${date} >= ?::date AND ${date} < ?::date)`).join(" OR ")}))`;
    expect(sql.replace(/\$\d+/g, "?")).toBe(
      `(${LIVE.replace("$1", "?")} and "shipment"."invoicing_status" IS DISTINCT FROM 'Invoiced' AND "shipment"."status" IS DISTINCT FROM ? and ` +
        `((${plain.map(ahead).join(" OR ")}) OR (${notLeft} AND ((${cutoffs.map(ahead).join(" OR ")}) OR ${passedBeforeEtd} OR ${passedLately}))))`,
    );
    // Every day is a parameter of the rule's (lib/needsAttention candidateRange) - never the database's today.
    expect(sql).not.toContain("now()");
    const pairs = Array.from({ length: 6 }, () => [RANGE.from, RANGE.until]).flat();
    expect(params).toEqual([
      COMPANY,
      "Cancelled Shipment",
      ...pairs,
      ...pairs,
      RANGE.etdSince,
      ...Array.from({ length: 6 }, () => RANGE.from),
      ...Array.from({ length: 5 }, () => [RANGE.passedSince, RANGE.from]).flat(),
    ]);
  });

  it("reads the newest first, cut at the limit it is handed, with the columns the rules go by", async () => {
    await shipmentRepository.needsAttentionCandidates(COMPANY, RANGE, 2001);
    const [read] = fake.state.reads;
    expect(read!.orderBy.map((order) => sent(order).sql)).toEqual(['"shipment"."created_at" desc', '"shipment"."id" desc']);
    expect(fake.state.limits).toEqual([2001]);
    expect(read!.fields).toEqual({
      id: shipmentTable.id,
      jobNumber: shipmentTable.jobNumber,
      customerId: shipmentTable.customerId,
      customer: shipmentTable.customer,
      tradeDirection: shipmentTable.tradeDirection,
      // How the job travels: how long the shared cut-off rule keeps a missed one after the ETD.
      freightMode: shipmentTable.freightMode,
      department: shipmentTable.department,
      status: shipmentTable.status,
      cargoReadinessDate: shipmentTable.cargoReadinessDate,
      pickupDate: shipmentTable.pickupDate,
      estimatedDeparture: shipmentTable.estimatedDeparture,
      actualDeparture: shipmentTable.actualDeparture,
      estimatedArrival: shipmentTable.estimatedArrival,
      // With the ATD, what tells the shared cut-off rule that the job has left.
      actualArrival: shipmentTable.actualArrival,
      actualDeliveryDate: shipmentTable.actualDeliveryDate,
      etaWarehouse: shipmentTable.etaWarehouse,
      warehouseReceivedDate: shipmentTable.warehouseReceivedDate,
      plannedDeliveryDate: shipmentTable.plannedDeliveryDate,
      closingDate: shipmentTable.closingDate,
      closingTime: shipmentTable.closingTime,
      // Each filing with its own time of day, as the Closing has.
      vgmClosing: shipmentTable.vgmClosing,
      vgmClosingTime: shipmentTable.vgmClosingTime,
      vgm: shipmentTable.vgm,
      siClosing: shipmentTable.siClosing,
      siClosingTime: shipmentTable.siClosingTime,
      shippingInstructions: shipmentTable.shippingInstructions,
      ams: shipmentTable.ams,
      amsDeadline: shipmentTable.amsDeadline,
      amsDeadlineTime: shipmentTable.amsDeadlineTime,
      isf: shipmentTable.isf,
      isfDeadline: shipmentTable.isfDeadline,
      isfDeadlineTime: shipmentTable.isfDeadlineTime,
    });
  });
});

describe("the Overview tiles' counts", () => {
  it("counts in one statement over the company's live shipments - and not Needs Attention, which the service counts by the rule", async () => {
    const counts = await shipmentRepository.tileCounts(COMPANY);
    const [read] = fake.state.plainReads;
    expect(Object.keys(read!.fields)).toEqual(["active", "etaMoved", "importCount", "exportCount", "week", "nextWeek"]);
    expect(sent(read!.where)).toEqual({ sql: `(${LIVE})`, params: [COMPANY] });
    expect(Object.keys(counts)).toEqual(["active", "etaMoved", "import", "export", "week", "nextWeek"]);
  });
});

describe("what Shipments → Managers reads", () => {
  it("asks for no shipment when it is handed none: whose ETD or ETA moved", async () => {
    expect(await shipmentRepository.dateMovedLately(COMPANY, [])).toEqual([]);
    expect(fake.state.steps).toEqual([]);
  });
});

describe("the reference writes", () => {
  const ID = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";
  const inTurn = <T>(work: (tx: never) => Promise<T>) => fake.db.transaction((tx) => work(tx as never)) as Promise<T>;

  it("reads the reference fields of the company's live shipments, and of one under its write turn", async () => {
    await shipmentRepository.referencesOf(COMPANY);
    await inTurn((tx) => shipmentRepository.referenceInTurn(tx, ID, COMPANY));
    const [all, one] = fake.state.plainReads;
    expect(Object.keys(all!.fields)).toEqual(["id", "jobNumber", "freightMode", "loadType", "salesNumber", "jobNumberFinal", "invoicingStatus", "bookingNumber"]);
    expect(sent(all!.where)).toEqual({ sql: `(${LIVE})`, params: [COMPANY] });
    expect(sent(one!.where)).toEqual({ sql: `("shipment"."id" = $1 and "shipment"."company_id" = $2 and "shipment"."deleted_at" is null)`, params: [ID, COMPANY] });
    expect(fake.state.steps).toEqual(["db count", "begin", "tx count", "commit"]);
  });

  it("renames a reference only while the row reads what the letters were worked out from", async () => {
    const from = { id: ID, jobNumber: "CZ00000101", freightMode: "Sea Freight", loadType: "Full Load" };
    await expect(inTurn((tx) => shipmentRepository.renameJobNumber(tx, COMPANY, from, "CZFCL00000101"))).resolves.toBeNull();
    const [update] = fake.state.updates;
    expect(update!.values).toMatchObject({ jobNumber: "CZFCL00000101" });
    expect(update!.values.updatedAt).toBeInstanceOf(Date);
    expect(sent(update!.where)).toEqual({
      sql: `("shipment"."id" = $1 and "shipment"."company_id" = $2 and "shipment"."deleted_at" is null and "shipment"."job_number" = $3 and "shipment"."freight_mode" = $4 and "shipment"."load_type" = $5)`,
      params: [ID, COMPANY, "CZ00000101", "Sea Freight", "Full Load"],
    });
    expect(fake.state.steps).toEqual(["begin", "tx update", "commit"]);
  });

  it("marks a live shipment's reference final, leaving updatedAt, and gives the reference back", async () => {
    fake.state.updatedRows = 1;
    await expect(inTurn((tx) => shipmentRepository.markJobNumberFinal(tx, ID, COMPANY))).resolves.toBe("CZFCL00000100");
    const [update] = fake.state.updates;
    expect(update!.values).toEqual({ jobNumberFinal: true });
    expect(sent(update!.where)).toEqual({ sql: `("shipment"."id" = $1 and "shipment"."company_id" = $2 and "shipment"."deleted_at" is null)`, params: [ID, COMPANY] });
    fake.state.updatedRows = 0;
    await expect(inTurn((tx) => shipmentRepository.markJobNumberFinal(tx, ID, COMPANY))).resolves.toBeNull();
  });
});

describe("rewritePeople", () => {
  it("replaces each value in the company's live shipments that still hold it, in one transaction, without touching updatedAt", async () => {
    fake.state.updatedRows = 2;
    const changed = await shipmentRepository.rewritePeople(COMPANY, [
      { field: "personInCharge", from: "Jan Novák", to: "jan@firma.cz" },
      { field: "createdBy", from: "1. 10. 2026 8:00:00 — Jan Novák", to: "1. 10. 2026 8:00:00 — jan@firma.cz" },
    ]);
    expect(changed).toBe(4);
    expect(fake.state.steps).toEqual(["begin", "tx update", "tx update", "commit"]);
    expect(fake.state.updates.map((u) => u.values)).toEqual([{ personInCharge: "jan@firma.cz" }, { createdBy: "1. 10. 2026 8:00:00 — jan@firma.cz" }]);
    expect(sent(fake.state.updates[0]!.where)).toEqual({ sql: `(${LIVE} and "shipment"."person_in_charge" = $2)`, params: [COMPANY, "Jan Novák"] });
    expect(sent(fake.state.updates[1]!.where)).toEqual({ sql: `(${LIVE} and "shipment"."created_by" = $2)`, params: [COMPANY, "1. 10. 2026 8:00:00 — Jan Novák"] });
  });

  it("opens no transaction when there is nothing to change", async () => {
    await expect(shipmentRepository.rewritePeople(COMPANY, [])).resolves.toBe(0);
    expect(fake.state.steps).toEqual([]);
  });
});

describe("basicsByIds", () => {
  const JOB = "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01";

  it("reads, with what Trucking reads, the Person in Charge, the Holiday Cover and the Invoicing Status of the company's live shipments", async () => {
    await shipmentRepository.basicsByIds(COMPANY, [JOB]);
    const [read] = fake.state.plainReads;
    expect(read!.fields).toMatchObject({
      id: shipmentTable.id,
      jobNumber: shipmentTable.jobNumber,
      department: shipmentTable.department,
      personInCharge: shipmentTable.personInCharge,
      holidayCover: shipmentTable.holidayCover,
      invoicingStatus: shipmentTable.invoicingStatus,
    });
    expect(sent(read!.where)).toEqual({ sql: '("shipment"."company_id" = $1 and "shipment"."id" in ($2) and "shipment"."deleted_at" is null)', params: [COMPANY, JOB] });
  });

  it("reads nothing for no ids", async () => {
    await expect(shipmentRepository.basicsByIds(COMPANY, [])).resolves.toEqual([]);
    expect(fake.state.plainReads).toEqual([]);
  });
});

describe("countOfCustomer", () => {
  const CUSTOMER = "946e01e8-a4ed-4aa7-932b-2c5d5e991c30";

  it("counts the company's live shipments for the customer (what keeps the customer from being deleted)", async () => {
    // Postgres reports a count as text.
    fake.state.total = "3";
    await expect(shipmentRepository.countOfCustomer(COMPANY, CUSTOMER)).resolves.toBe(3);
    expect(sent(fake.state.counts[0])).toEqual({
      sql: '("shipment"."company_id" = $1 and "shipment"."customer_id" = $2 and "shipment"."deleted_at" is null)',
      params: [COMPANY, CUSTOMER],
    });
  });
});
