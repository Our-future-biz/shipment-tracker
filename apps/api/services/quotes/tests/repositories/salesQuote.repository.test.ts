import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The repository is run against a stand-in for the database that records what is done, in order,
// and hands back what a test has laid out. It can refuse an insert the way Postgres refuses a
// duplicate reference: the reference then exists, taken by somebody who did not wait for the
// lock. What the statements do to real rows is not checked here - that needs a database.
const fake = vi.hoisted(() => {
  const state = {
    /** References the company already has. */
    existing: [] as string[],
    /** Errors the next inserts fail with, first come first served. */
    insertErrors: [] as unknown[],
    steps: [] as string[],
    inserted: [] as Record<string, unknown>[],
    /** What the next reads of one quote find, first come first served; nothing = no such quote. */
    found: [] as { row: Record<string, unknown>; needsAdoption: boolean }[],
    /** The rows the next updates return, first come first served; nothing = no row matched. */
    updated: [] as Record<string, unknown>[][],
    /** The number quote_adopt_lifecycle reports. */
    adopted: 0,
    executed: [] as unknown[],
    /** The fields of every read of one quote. */
    selected: [] as Record<string, unknown>[],
    updates: [] as { set: Record<string, unknown>; where: unknown }[],
    labels: [] as string[],
    /** What a read of the list returns: its rows, and the number its count reports. */
    listed: [] as Record<string, unknown>[],
    total: 0 as number | string,
    /** Every read of the list: its condition, order and window. */
    pages: [] as { where: unknown; orderBy: unknown[]; limit?: number; offset?: number }[],
    /** The condition of every count. */
    counts: [] as unknown[],
    /** What a read of the shipment links returns, and the condition of every such read. */
    links: [] as { quoteNumber: string; shipmentId: string | null }[],
    linkReads: [] as unknown[],
    /** What a read of the customers' facts returns, and every such read. */
    facts: [] as Record<string, unknown>[],
    factReads: [] as { fields: Record<string, unknown>; where: unknown; groupBy: unknown[] }[],
    /** What a read of the customers' open quotes returns, and every such read. */
    openQuotes: [] as Record<string, unknown>[],
    openQuoteReads: [] as { fields: Record<string, unknown>; where: unknown; orderBy: unknown[] }[],
  };

  // The text of a hand-written statement, without its parameters.
  const textOf = (query: unknown) =>
    ((query as { queryChunks?: { value?: unknown }[] }).queryChunks ?? [])
      .map((chunk) => (Array.isArray(chunk?.value) ? chunk.value.join("") : "?"))
      .join("");

  const run = (name: string) => ({
    execute: async (query: unknown) => {
      state.steps.push(textOf(query).includes("quote_adopt_lifecycle") ? `${name} adopt` : "lock");
      state.executed.push(query);
      return { rows: [{ adopted: state.adopted }] };
    },
    select: (fields?: Record<string, unknown>) => ({
      from: () => ({
        where: (where: unknown) => {
          if (!fields) {
            // Whole rows: a page of the list.
            const page: (typeof state.pages)[number] = { where, orderBy: [] };
            const chain = {
              orderBy: (...order: unknown[]) => {
                page.orderBy = order;
                return chain;
              },
              limit: (limit: number) => {
                page.limit = limit;
                return chain;
              },
              offset: (offset: number) => {
                page.offset = offset;
                return chain;
              },
              then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => {
                state.steps.push(`${name} list`);
                state.pages.push(page);
                return Promise.resolve(state.listed).then(resolve, reject);
              },
            };
            return chain;
          }
          if ("sentQuotes" in fields) {
            return {
              groupBy: (...groupBy: unknown[]) => {
                state.steps.push(`${name} read customer facts`);
                state.factReads.push({ fields, where, groupBy });
                return Promise.resolve(state.facts);
              },
            };
          }
          if ("sellingLines" in fields) {
            return {
              orderBy: (...orderBy: unknown[]) => {
                state.steps.push(`${name} read open quotes`);
                state.openQuoteReads.push({ fields, where, orderBy });
                return Promise.resolve(state.openQuotes);
              },
            };
          }
          if ("value" in fields) {
            state.steps.push(`${name} count`);
            state.counts.push(where);
            return Promise.resolve([{ value: state.total }]);
          }
          if ("shipmentId" in fields) {
            state.steps.push(`${name} read links`);
            state.linkReads.push(where);
            return Promise.resolve(state.links);
          }
          if (!("needsAdoption" in fields)) {
            state.steps.push("read");
            return Promise.resolve(state.existing.map((quoteNumber) => ({ quoteNumber })));
          }
          state.selected.push(fields);
          const read = (how: string) => {
            state.steps.push(`${name} ${how}`);
            const next = state.found.shift();
            return Promise.resolve(next ? [next] : []);
          };
          return {
            limit: () => ({
              then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => read("read quote").then(resolve, reject),
              for: (strength: string) => read(`read quote for ${strength}`),
            }),
          };
        },
      }),
    }),
    selectDistinct: () => ({
      from: () => ({
        where: async () => {
          state.steps.push(`${name} read labels`);
          return state.labels.map((ownerLabel) => ({ ownerLabel }));
        },
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          const write = () => {
            state.steps.push(`${name} update`);
            state.updates.push({ set, where });
            // A lifecycle write (through the transaction) always finds its locked row; a save may not.
            return Promise.resolve(state.updated.shift() ?? (name === "tx" ? [{ id: "row-1", quoteNumber: "QCZ20261010001", status: "quoted" }] : []));
          };
          return {
            returning: write,
            then: (resolve: (rows: unknown[]) => unknown, reject: (reason: unknown) => unknown) => write().then(resolve, reject),
          };
        },
      }),
    }),
    insert: () => ({
      values: (row: Record<string, unknown>) => ({
        returning: async () => {
          state.steps.push(`insert ${String(row.quoteNumber)}`);
          const error = state.insertErrors.shift() as { code?: string; cause?: { code?: string } } | undefined;
          if (error) {
            if ((error.cause?.code ?? error.code) === "23505") state.existing.push(String(row.quoteNumber));
            throw error;
          }
          state.inserted.push(row);
          return [{ id: "row-1", ...row }];
        },
      }),
    }),
  });

  const tx = run("tx");
  const db = {
    ...run("db"),
    transaction: async (work: (transaction: typeof tx) => Promise<unknown>) => {
      state.steps.push("begin");
      return work(tx);
    },
  };
  return { state, db, tx };
});

vi.mock("../../db/db", () => ({ db: fake.db }));

import { salesQuoteRepository, type QuoteTransaction, type SalesQuoteFilter, type SalesQuotePage } from "../../repositories/salesQuote.repository";
import { quoteTable, type SalesQuoteRecord } from "../../schemas/quote.schema";
import { PROTECTED_KEYS } from "../../utils/quoteDocument.utils";
import { followUpDueBefore, stateOf } from "../../utils/quoteLifecycle.utils";
import { COMBINING_MARKS, FINAL_SIGMA, FOLD_FROM, FOLD_TO, SIGMA } from "../../utils/quoteSearch.utils";

const COMPANY = "86f202b1-7449-441b-9c5b-5bf4d89f8d88";
const tx = fake.tx as unknown as QuoteTransaction;

const dialect = new PgDialect();
/** A piece of a statement as Postgres gets it: its text and its parameters. */
const rendered = (piece: unknown) => dialect.sqlToQuery(piece as SQL);
/** The parameters of a piece that are JSON, parsed. */
const jsonParams = (piece: unknown) =>
  rendered(piece).params.flatMap((param) => {
    try {
      return typeof param === "string" && /^[[{]/.test(param) ? [JSON.parse(param) as unknown] : [];
    } catch {
      return [];
    }
  });

const quote = (over: Partial<SalesQuoteRecord> = {}): SalesQuoteRecord => ({
  id: "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11",
  companyId: COMPANY,
  quoteNumber: "QCZ20261010001",
  data: { reference: "QCZ20261010001", quoteStatus: "draft", salesOwner: "Martin", timeline: [] },
  terms: "",
  createdAt: new Date("2026-10-10T08:00:00.000Z"),
  updatedAt: new Date("2026-10-10T08:00:00.000Z"),
  deletedAt: null,
  status: "draft",
  substatus: null,
  lostReason: null,
  lostComment: null,
  sentAt: null,
  firstSentAt: null,
  decidedAt: null,
  validUntil: null,
  lastContactAt: null,
  ownerUserId: null,
  ownerLabel: "Martin",
  ownerMatchCheckedAt: null,
  shipmentId: null,
  shipmentJobNumber: null,
  deletedBy: null,
  dataVersion: 1,
  customerId: null,
  ...over,
});

/** A duplicate key as it reaches the repository: drizzle wraps the driver's error. */
const duplicateKey = () => Object.assign(new Error("Failed query"), { cause: { code: "23505" } });

/** The next reference under QCZ20261010: the count of existing ones + 1 is enough here. */
const pick = (existing: string[]) => `QCZ20261010${String(existing.length + 1).padStart(3, "0")}`;

const create = () =>
  salesQuoteRepository.createWithReference(COMPANY, "QCZ20261010", pick, (reference) => ({ data: { reference }, status: "draft" }));

beforeEach(() => {
  fake.state.existing = [];
  fake.state.insertErrors = [];
  fake.state.steps = [];
  fake.state.inserted = [];
  fake.state.found = [];
  fake.state.updated = [];
  fake.state.adopted = 0;
  fake.state.executed = [];
  fake.state.selected = [];
  fake.state.updates = [];
  fake.state.labels = [];
  fake.state.listed = [];
  fake.state.total = 0;
  fake.state.pages = [];
  fake.state.counts = [];
  fake.state.links = [];
  fake.state.linkReads = [];
  fake.state.facts = [];
  fake.state.factReads = [];
  fake.state.openQuotes = [];
  fake.state.openQuoteReads = [];
});

describe("createWithReference", () => {
  it("takes the lock, reads the references and inserts - in that order, in one transaction", async () => {
    fake.state.existing = ["QCZ20261010001", "QCZ20261010002"];
    const row = await create();
    expect(fake.state.steps).toEqual(["begin", "lock", "read", "insert QCZ20261010003"]);
    expect(row.quoteNumber).toBe("QCZ20261010003");
  });

  it("inserts the row built for the picked reference - columns and document together - under the caller's company", async () => {
    await create();
    expect(fake.state.inserted).toEqual([
      { data: { reference: "QCZ20261010001" }, status: "draft", companyId: COMPANY, quoteNumber: "QCZ20261010001" },
    ]);
  });

  it("does not let the built row choose another company or reference", async () => {
    const forged = () => ({ data: {}, status: "draft", companyId: "another-company", quoteNumber: "FORGED" });
    await salesQuoteRepository.createWithReference(COMPANY, "QCZ20261010", pick, forged);
    expect(fake.state.inserted[0]).toMatchObject({ companyId: COMPANY, quoteNumber: "QCZ20261010001" });
  });

  it("tries the whole allocation again when somebody else took the reference", async () => {
    // Somebody inserts QCZ…001 without the lock, between our read and our insert.
    fake.state.insertErrors = [duplicateKey()];
    const row = await create();
    expect(fake.state.steps).toEqual(["begin", "lock", "read", "insert QCZ20261010001", "begin", "lock", "read", "insert QCZ20261010002"]);
    expect(row.quoteNumber).toBe("QCZ20261010002");
    expect(fake.state.inserted).toHaveLength(1);
  });

  it("recognises a duplicate key the driver reports directly", async () => {
    fake.state.insertErrors = [Object.assign(new Error("duplicate key"), { code: "23505" })];
    await expect(create()).resolves.toMatchObject({ quoteNumber: "QCZ20261010002" });
    expect(fake.state.steps.filter((step) => step === "begin")).toHaveLength(2);
  });

  it("gives up after three more tries and reports the duplicate", async () => {
    const last = duplicateKey();
    fake.state.insertErrors = [duplicateKey(), duplicateKey(), duplicateKey(), last, duplicateKey()];
    await expect(create()).rejects.toBe(last);
    expect(fake.state.steps.filter((step) => step.startsWith("insert"))).toEqual([
      "insert QCZ20261010001",
      "insert QCZ20261010002",
      "insert QCZ20261010003",
      "insert QCZ20261010004",
    ]);
    expect(fake.state.inserted).toEqual([]);
  });

  it("does not retry any other failure", async () => {
    const failure = Object.assign(new Error("Failed query"), { cause: { code: "57014" } });
    fake.state.insertErrors = [failure];
    await expect(create()).rejects.toBe(failure);
    expect(fake.state.steps.filter((step) => step === "begin")).toHaveLength(1);
  });
});

describe("adoptPending", () => {
  it("adopts the company's never-adopted quotes only, and says how many there were", async () => {
    fake.state.adopted = 2;
    await expect(salesQuoteRepository.adoptPending(COMPANY)).resolves.toBe(2);
    expect(rendered(fake.state.executed[0])).toMatchObject({
      sql: "select quote_adopt_lifecycle($1::uuid, false) as adopted",
      params: [COMPANY],
    });
  });

  it("is 0 when nothing was waiting", async () => {
    await expect(salesQuoteRepository.adoptPending(COMPANY)).resolves.toBe(0);
  });
});

describe("loadLive", () => {
  it("is one read for a quote whose columns are in step with its document", async () => {
    const row = quote();
    fake.state.found = [{ row, needsAdoption: false }];
    await expect(salesQuoteRepository.loadLive(COMPANY, row.quoteNumber)).resolves.toBe(row);
    expect(fake.state.steps).toEqual(["db read quote"]);
  });

  it("adopts a row that needs it from its document - that one row, drift included - and reads it again", async () => {
    const straggler = quote({ status: null as never });
    const adopted = quote();
    fake.state.found = [
      { row: straggler, needsAdoption: true },
      { row: adopted, needsAdoption: false },
    ];
    await expect(salesQuoteRepository.loadLive(COMPANY, straggler.quoteNumber)).resolves.toBe(adopted);
    expect(fake.state.steps).toEqual(["db read quote", "db adopt", "db read quote"]);
    expect(rendered(fake.state.executed[0])).toMatchObject({
      sql: "select quote_adopt_lifecycle($1::uuid, true, $2::uuid)",
      params: [COMPANY, straggler.id],
    });
  });

  it("asks, with the row, whether its columns differ from what its document says - naming them with their table", async () => {
    await salesQuoteRepository.loadLive(COMPANY, "QCZ20261010001");
    const { sql, params } = rendered(fake.state.selected[0]!.needsAdoption);
    expect(params).toEqual([]);
    // quote_lifecycle_of returns columns of the same names: a bare "status" would mean its own.
    for (const column of ["status", "substatus", "lost_reason", "lost_comment", "sent_at", "decided_at", "valid_until", "owner_label"]) {
      expect(sql, column).toContain(`quote.${column} IS DISTINCT FROM d.${column}`);
    }
    expect(sql).toContain("FROM quote_lifecycle_of(quote.data) d");
    expect(sql).not.toContain('"');
  });

  it("is null for a quote that does not exist, and adopts nothing", async () => {
    await expect(salesQuoteRepository.loadLive(COMPANY, "QCZ-NONE")).resolves.toBeNull();
    expect(fake.state.steps).toEqual(["db read quote"]);
  });

  it("returns a row of the old quotes module as it is", async () => {
    const oldShape = quote({ status: null as never, data: { Shipper: "ACME" } });
    fake.state.found = [{ row: oldShape, needsAdoption: false }];
    await expect(salesQuoteRepository.loadLive(COMPANY, oldShape.quoteNumber)).resolves.toBe(oldShape);
  });

  it("with a lock, locks the row in that transaction - also when it reads it again after adopting", async () => {
    fake.state.found = [
      { row: quote(), needsAdoption: true },
      { row: quote(), needsAdoption: false },
    ];
    await salesQuoteRepository.loadLive(COMPANY, "QCZ20261010001", { lock: tx });
    expect(fake.state.steps).toEqual(["tx read quote for update", "tx adopt", "tx read quote for update"]);
  });
});

describe("loadSales", () => {
  it("returns a sales quote", async () => {
    const row = quote();
    fake.state.found = [{ row, needsAdoption: false }];
    await expect(salesQuoteRepository.loadSales(COMPANY, row.quoteNumber)).resolves.toBe(row);
  });

  it("is null for a row of the old quotes module", async () => {
    fake.state.found = [{ row: quote({ status: null as never, data: { Shipper: "ACME" } }), needsAdoption: false }];
    await expect(salesQuoteRepository.loadSales(COMPANY, "QCZ20261010001")).resolves.toBeNull();
  });

  it("decides only after adopting: a quote older code left without columns is a sales quote", async () => {
    fake.state.found = [
      { row: quote({ status: null as never }), needsAdoption: true },
      { row: quote(), needsAdoption: false },
    ];
    await expect(salesQuoteRepository.loadSales(COMPANY, "QCZ20261010001")).resolves.toMatchObject({ status: "draft" });
  });

  it("is null for a quote that does not exist", async () => {
    await expect(salesQuoteRepository.loadSales(COMPANY, "QCZ-NONE")).resolves.toBeNull();
  });
});

describe("withLockedQuote", () => {
  it("hands the change the quote as locked in a transaction, and returns what it returns", async () => {
    const row = quote();
    fake.state.found = [{ row, needsAdoption: false }];
    const change = vi.fn(async () => "done");
    await expect(salesQuoteRepository.withLockedQuote(COMPANY, row.quoteNumber, change)).resolves.toBe("done");
    expect(fake.state.steps).toEqual(["begin", "tx read quote for update"]);
    expect(change).toHaveBeenCalledWith(row, fake.tx);
  });

  it("is null, without running the change, when there is no such sales quote", async () => {
    const change = vi.fn(async () => "done");
    await expect(salesQuoteRepository.withLockedQuote(COMPANY, "QCZ-NONE", change)).resolves.toBeNull();
    fake.state.found = [{ row: quote({ status: null as never }), needsAdoption: false }];
    await expect(salesQuoteRepository.withLockedQuote(COMPANY, "QCZ20261010001", change)).resolves.toBeNull();
    expect(change).not.toHaveBeenCalled();
  });

  it("passes on what the change throws", async () => {
    fake.state.found = [{ row: quote(), needsAdoption: false }];
    const refused = new Error("a quote cannot go from Won to Draft");
    await expect(
      salesQuoteRepository.withLockedQuote(COMPANY, "QCZ20261010001", async () => {
        throw refused;
      }),
    ).rejects.toBe(refused);
  });
});

describe("adoptions", () => {
  // The number belongs to the process and only ever grows: a test compares it with what it was.
  const adoptions = () => salesQuoteRepository.adoptions(COMPANY);
  const needingAdoption = () => [
    { row: quote({ status: null as never }), needsAdoption: true },
    { row: quote(), needsAdoption: false },
  ];

  it("grows when waiting quotes were adopted, not when none was waiting", async () => {
    const before = adoptions();
    await salesQuoteRepository.adoptPending(COMPANY);
    expect(adoptions()).toBe(before);
    fake.state.adopted = 2;
    await salesQuoteRepository.adoptPending(COMPANY);
    expect(adoptions()).toBeGreaterThan(before);
  });

  it("grows when a load had to adopt the quote, not when the quote was in step", async () => {
    const before = adoptions();
    fake.state.found = [{ row: quote(), needsAdoption: false }];
    await salesQuoteRepository.loadLive(COMPANY, "QCZ20261010001");
    expect(adoptions()).toBe(before);
    fake.state.found = needingAdoption();
    await salesQuoteRepository.loadLive(COMPANY, "QCZ20261010001");
    expect(adoptions()).toBeGreaterThan(before);
  });

  it("is kept per company", async () => {
    const other = "5f0c1c7e-3f1b-4f0e-8a56-2d1e7a9b4c22";
    fake.state.found = needingAdoption();
    await salesQuoteRepository.loadLive(COMPANY, "QCZ20261010001");
    expect(salesQuoteRepository.adoptions(other)).toBe(0);
  });

  it("grows once more when a transaction that adopted a quote is committed: whoever looked during it looks again", async () => {
    fake.state.found = needingAdoption();
    // Seen inside the transaction, after the load adopted the quote where nobody else sees it yet.
    const during = await salesQuoteRepository.withLockedQuote(COMPANY, "QCZ20261010001", async () => adoptions());
    expect(adoptions()).toBeGreaterThan(during!);
  });

  it("stays as it was after a transaction that adopted nothing", async () => {
    fake.state.found = [{ row: quote(), needsAdoption: false }];
    const during = await salesQuoteRepository.withLockedQuote(COMPANY, "QCZ20261010001", async () => adoptions());
    expect(adoptions()).toBe(during);
  });
});

describe("writeLifecycle", () => {
  const SENT = new Date("2026-10-10T10:00:00.000Z");
  const entry = { kind: "status" as const, status: "quoted", at: SENT.toISOString(), user: "Martin", userId: "user-1" };
  const sent = (from: SalesQuoteRecord) => ({
    ...stateOf(from),
    status: "quoted",
    sentAt: SENT,
    firstSentAt: SENT,
    lastContactAt: SENT,
    validUntil: "2026-10-25",
  });

  /** The parameters of the one statement, by what they are for. */
  const written = () => {
    const { set } = fake.state.updates[0]!;
    const [remove, mirror, entries] = jsonParams(set.data);
    return { set, remove, mirror, entries, bump: rendered(set.dataVersion).params[0] };
  };

  it("sets the columns to the new state, through the transaction that holds the lock", async () => {
    const row = quote();
    const after = quote({ status: "quoted" });
    fake.state.updated = [[after]];
    await expect(salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] })).resolves.toBe(after);
    expect(fake.state.steps).toEqual(["tx update"]);
    expect(written().set).toMatchObject({
      status: "quoted",
      substatus: null,
      lostReason: null,
      lostComment: null,
      sentAt: SENT,
      firstSentAt: SENT,
      decidedAt: null,
      validUntil: "2026-10-25",
      lastContactAt: SENT,
      ownerUserId: null,
      ownerLabel: "Martin",
      shipmentId: null,
      shipmentJobNumber: null,
    });
    expect(written().set.updatedAt).toBeInstanceOf(Date);
    expect(rendered(fake.state.updates[0]!.where)).toMatchObject({
      sql: '("quote"."id" = $1 and "quote"."company_id" = $2)',
      params: [row.id, row.companyId],
    });
  });

  it("restates the whole mirror in the same statement: keys to set, keys to remove, the history line", async () => {
    const row = quote();
    await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
    const { remove, mirror, entries } = written();
    expect(mirror).toEqual({ quoteStatus: "quoted", winProbability: 30, sentAt: SENT.toISOString(), validUntil: "2026-10-25", salesOwner: "Martin" });
    expect(remove).toEqual(["validityDays", "substatus", "lostReason", "lostComment", "decidedAt"]);
    expect(entries).toEqual([entry]);
  });

  it("guards every JSON operand, so no input can turn the document or the history into NULL", async () => {
    const row = quote();
    await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
    const { sql } = rendered(written().set.data);
    expect(sql).toContain(`CASE WHEN jsonb_typeof("quote"."data") = 'object' THEN "quote"."data" ELSE '{}'::jsonb END`);
    expect(sql).toContain(`CASE WHEN jsonb_typeof("quote"."data"->'timeline') = 'array' THEN "quote"."data"->'timeline' ELSE '[]'::jsonb END`);
    expect(sql).toMatch(/coalesce\(\$\d+::jsonb, '\{\}'::jsonb\)/);
    expect(sql).toMatch(/coalesce\(\$\d+::jsonb, '\[\]'::jsonb\)/);
  });

  it("passes an empty list, never nothing, for an action without a history line", async () => {
    const row = quote();
    await salesQuoteRepository.writeLifecycle(tx, row, { state: { ...stateOf(row), validUntil: "2026-11-01" }, entries: [] });
    expect(written().entries).toEqual([]);
    expect(written().mirror).toMatchObject({ quoteStatus: "draft", validUntil: "2026-11-01" });
  });

  it("leaves the document version alone - a lifecycle action must not throw an open editor into a conflict", async () => {
    const row = quote();
    await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
    expect(written().bump).toBe(0);
  });

  it("makes a new document version exactly when the action also writes a document key", async () => {
    const row = quote();
    const fx = { date: "2026-10-10", fixingDate: "2026-10-09", roePct: 100, rates: { USD: 23.4 }, lockedAt: "2026-10-10T10:00:00.000Z" };
    await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry], document: { fx } });
    expect(written().bump).toBe(1);
    expect(written().mirror).toMatchObject({ quoteStatus: "quoted", fx });
  });

  it("sets a legacy value the columns could not take aside before its key goes", async () => {
    const row = quote({ data: { quoteStatus: "draft", sentAt: "yesterday", timeline: "abc" } });
    await salesQuoteRepository.writeLifecycle(tx, row, { state: { ...stateOf(row), status: "ready_to_send" }, entries: [] });
    const { remove, mirror } = written();
    expect(remove).toContain("sentAt");
    expect(mirror).toMatchObject({ lifecycleUnreadable: { sentAt: "yesterday" }, timelineUnreadable: "abc" });
  });

  it("survives a stored document that is not an object", async () => {
    const row = quote({ data: "broken" });
    await salesQuoteRepository.writeLifecycle(tx, row, { state: stateOf(row), entries: [] });
    expect(written().mirror).toEqual({ quoteStatus: "draft", winProbability: 10, salesOwner: "Martin" });
  });

  describe("deleting", () => {
    const line = { kind: "deleted" as const, at: SENT.toISOString(), user: "Martin", userId: "user-1" };

    it("stamps the row as deleted, with who did it and when, in the statement that adds the history line", async () => {
      const row = quote();
      await salesQuoteRepository.writeLifecycle(tx, row, { state: stateOf(row), entries: [line], deleted: { by: "user-1", at: SENT } });
      expect(fake.state.steps).toEqual(["tx update"]);
      expect(written().set).toMatchObject({ deletedAt: SENT, deletedBy: "user-1", status: "draft", ownerLabel: "Martin" });
      expect(written().entries).toEqual([line]);
      // The quote keeps what it was: its mirror is restated, not emptied.
      expect(written().mirror).toEqual({ quoteStatus: "draft", winProbability: 10, salesOwner: "Martin" });
      expect(written().bump).toBe(0);
    });

    it("is the only action that touches deleted_at and deleted_by", async () => {
      const row = quote();
      await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
      expect(written().set).not.toHaveProperty("deletedAt");
      expect(written().set).not.toHaveProperty("deletedBy");
    });
  });

  describe("the owner", () => {
    const CHECKED = new Date("2026-10-01T08:00:00.000Z");
    const handedOver = (from: SalesQuoteRecord) => ({ ...stateOf(from), ownerUserId: "user-2", ownerLabel: "Jana" });

    it("stamps a quote whose owner is chosen by hand as examined, so its text is never matched afterwards", async () => {
      const row = quote();
      await salesQuoteRepository.writeLifecycle(tx, row, { state: handedOver(row), entries: [] });
      expect(written().set.ownerMatchCheckedAt).toBeInstanceOf(Date);
    });

    it("also when the owner is taken away", async () => {
      const row = quote();
      await salesQuoteRepository.writeLifecycle(tx, row, { state: { ...stateOf(row), ownerLabel: "" }, entries: [] });
      expect(written().set.ownerMatchCheckedAt).toBeInstanceOf(Date);
    });

    it("keeps the stamp a quote already has", async () => {
      const row = quote({ ownerUserId: "user-1", ownerMatchCheckedAt: CHECKED });
      await salesQuoteRepository.writeLifecycle(tx, row, { state: handedOver(row), entries: [] });
      expect(written().set).not.toHaveProperty("ownerMatchCheckedAt");
    });

    it("does not stamp on an action that leaves the owner alone: the text still waits to be matched", async () => {
      const row = quote();
      await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
      expect(written().set).not.toHaveProperty("ownerMatchCheckedAt");
    });

    it("does not take the space an adopted label ends with for a new owner", async () => {
      // The cut of an overlong legacy text can end in one; the state read from the row has none.
      const row = quote({ ownerLabel: "Martin " });
      await salesQuoteRepository.writeLifecycle(tx, row, { state: sent(row), entries: [entry] });
      expect(written().set).not.toHaveProperty("ownerMatchCheckedAt");
      expect(written().set.ownerLabel).toBe("Martin");
      expect(written().mirror).toMatchObject({ salesOwner: "Martin" });
    });
  });
});

describe("saveDocument", () => {
  const data = { reference: "FORGED", quoteStatus: "won", origin: "Brno" };
  const carry = [...PROTECTED_KEYS];

  it("writes the incoming document without the carried keys, which come from the stored one - in one statement", async () => {
    const saved = quote({ dataVersion: 2 });
    fake.state.updated = [[saved]];
    await expect(salesQuoteRepository.saveDocument(COMPANY, "QCZ20261010001", { data, carry }, { dataVersion: 1 })).resolves.toBe(saved);
    expect(fake.state.steps).toEqual(["db update"]);
    const { set } = fake.state.updates[0]!;
    // The document, then the key list - one JSON parameter each time it is used.
    expect(jsonParams(set.data)).toEqual([data, carry, carry]);
    expect(rendered(set.data).sql).toMatch(/^\(\$1::jsonb - ARRAY\(SELECT jsonb_array_elements_text\(\$2::jsonb\)\)\)\s+\|\| coalesce\(\(SELECT jsonb_object_agg\(e\.key, e\.value\)/);
    expect(rendered(set.data).sql).toContain("WHERE e.key = ANY(ARRAY(SELECT jsonb_array_elements_text($3::jsonb)))");
  });

  it("makes a new version of the document", async () => {
    await salesQuoteRepository.saveDocument(COMPANY, "QCZ20261010001", { data, carry }, { dataVersion: 1 });
    const { set } = fake.state.updates[0]!;
    expect(rendered(set.dataVersion)).toMatchObject({ sql: '"quote"."data_version" + 1', params: [] });
    expect(set.updatedAt).toBeInstanceOf(Date);
  });

  it("writes live sales quotes only, and only the version named", async () => {
    await salesQuoteRepository.saveDocument(COMPANY, "QCZ20261010001", { data, carry }, { dataVersion: 4 });
    expect(rendered(fake.state.updates[0]!.where)).toMatchObject({
      sql: '("quote"."company_id" = $1 and "quote"."quote_number" = $2 and "quote"."deleted_at" is null and "quote"."status" is not null and "quote"."data_version" = $3)',
      params: [COMPANY, "QCZ20261010001", 4],
    });
  });

  it("is null when nothing was written: no longer that version, or gone", async () => {
    await expect(salesQuoteRepository.saveDocument(COMPANY, "QCZ20261010001", { data, carry }, { dataVersion: 1 })).resolves.toBeNull();
  });
});

describe("list", () => {
  // 10 October 2026, noon in Prague.
  const NOW = new Date("2026-10-10T10:00:00.000Z");
  const MOMENT = { today: "2026-10-10", dueBefore: followUpDueBefore(NOW) };
  const PAGE: SalesQuotePage = { limit: 50, offset: 0, sortBy: "createdAt", sortDirection: "desc" };
  const BASE = '"quote"."company_id" = $1 and "quote"."deleted_at" is null and "quote"."status" is not null';
  // The status shown, as SQL: its parameters are the two awaiting statuses and today.
  const SHOWN = `CASE WHEN "quote"."status" in ($2, $3) AND "quote"."valid_until" < $4::date THEN 'expired' ELSE "quote"."status" END`;
  const LAST_CONTACT = 'coalesce("quote"."last_contact_at", "quote"."sent_at", "quote"."created_at")';

  const list = (filter: SalesQuoteFilter = {}, page: Partial<SalesQuotePage> = {}) => salesQuoteRepository.list(COMPANY, filter, { ...PAGE, ...page }, MOMENT);
  /** A piece of a statement as Postgres gets it: text and parameters, nothing else. */
  const sent = (piece: unknown) => {
    const { sql, params } = rendered(piece);
    return { sql, params };
  };
  /** The condition of a list read. */
  const condition = async (filter: SalesQuoteFilter) => {
    fake.state.pages = [];
    await list(filter);
    return sent(fake.state.pages[0]!.where);
  };
  /** The part of the condition a filter adds to the base. */
  const added = async (filter: SalesQuoteFilter) => {
    const { sql, params } = await condition(filter);
    expect(sql.startsWith(`(${BASE} and `)).toBe(true);
    return { sql: sql.slice(BASE.length + 6, -1), params: params.slice(1) };
  };

  it("reads a page and counts the matches - with one and the same condition", async () => {
    const rows = [quote(), quote({ quoteNumber: "QCZ20261010002" })];
    fake.state.listed = rows;
    // Postgres reports a count as text.
    fake.state.total = "137";
    await expect(list({ statuses: ["quoted"], search: ["praha"] })).resolves.toEqual({ rows, total: 137 });
    expect([...fake.state.steps].sort()).toEqual(["db count", "db list"]);
    expect(sent(fake.state.counts[0])).toEqual(sent(fake.state.pages[0]!.where));
  });

  it("holds the company's live sales quotes only: no other company, nothing deleted, no row of the old quotes module", async () => {
    expect(await condition({})).toEqual({ sql: `(${BASE})`, params: [COMPANY] });
  });

  it("is not narrowed by a filter that is empty", async () => {
    expect((await condition({ statuses: [], search: [], serviceType: "", direction: "", family: "", customerId: "", followUpDue: false })).sql).toBe(`(${BASE})`);
  });

  it("filters statuses on the status shown: a Quoted or Feedback quote past its validity is 'expired'", async () => {
    expect(await added({ statuses: ["quoted", "expired"] })).toEqual({
      sql: `${SHOWN} in ($5, $6)`,
      params: ["quoted", "feedback", "2026-10-10", "quoted", "expired"],
    });
  });

  it("states the follow-up rule of isFollowUpDue: with the customer, not expired - no validity date included - and last contact three days old", async () => {
    expect(await added({ followUpDue: true })).toEqual({
      sql:
        `("quote"."status" in ($2, $3) and ("quote"."valid_until" is null or "quote"."valid_until" >= $4)` +
        ` and date_trunc('milliseconds', ${LAST_CONTACT}) <= $5::timestamptz)`,
      params: ["quoted", "feedback", "2026-10-10", "2026-10-07T10:00:00.000Z"],
    });
  });

  it("takes created and decided ranges as business days: from the midnight in Prague that starts the first to the one that ends the last", async () => {
    expect(await added({ createdFrom: "2026-10-01", createdTo: "2026-10-10" })).toEqual({
      sql: `("quote"."created_at" >= ($2::date)::timestamp AT TIME ZONE $3::text and "quote"."created_at" < ($4::date + 1)::timestamp AT TIME ZONE $5::text)`,
      params: ["2026-10-01", "Europe/Prague", "2026-10-10", "Europe/Prague"],
    });
    expect(await added({ decidedTo: "2026-10-10" })).toEqual({
      sql: `"quote"."decided_at" < ($2::date + 1)::timestamp AT TIME ZONE $3::text`,
      params: ["2026-10-10", "Europe/Prague"],
    });
    expect((await added({ decidedFrom: "2026-10-01" })).sql).toBe(`"quote"."decided_at" >= ($2::date)::timestamp AT TIME ZONE $3::text`);
  });

  it("filters the owner by user: one user's quotes, or the quotes that belong to no user", async () => {
    expect(await added({ ownerUserId: "user-1" })).toEqual({ sql: '"quote"."owner_user_id" = $2', params: ["user-1"] });
    expect(await added({ ownerUserId: null })).toEqual({ sql: '"quote"."owner_user_id" is null', params: [] });
  });

  it("filters customer, service type and direction", async () => {
    expect(await added({ customerId: "customer-1" })).toEqual({ sql: '"quote"."customer_id" = $2', params: ["customer-1"] });
    expect(await added({ serviceType: "Air", direction: "Import" })).toEqual({
      sql: `"quote"."data"->>'serviceType' = $2 and "quote"."data"->>'direction' = $3`,
      params: ["Air", "Import"],
    });
  });

  it("filters on the shipment link: the quotes a shipment names, or the quotes none does", async () => {
    expect(await added({ hasShipment: true })).toEqual({ sql: '"quote"."shipment_id" is not null', params: [] });
    expect(await added({ hasShipment: false })).toEqual({ sql: '"quote"."shipment_id" is null', params: [] });
  });

  it("finds a family: the base and whatever continues it with a dash - the reference taken literally", async () => {
    expect(await added({ family: "QCZ20261010001" })).toEqual({
      sql: '("quote"."quote_number" = $2 or "quote"."quote_number" like $3)',
      params: ["QCZ20261010001", "QCZ20261010001-%"],
    });
    expect((await added({ family: "Q_1%" })).params).toEqual(["Q_1%", "Q\\_1\\%-%"]);
  });

  it("searches one folded text per quote for every word: the document unpacked once, the constants of foldDiacritics as parameters", async () => {
    const { sql, params } = await added({ search: ["praha", "ittec\\%"] });
    expect(params).toEqual(["quoted", "feedback", "2026-10-10", COMBINING_MARKS, FOLD_FROM, FOLD_TO, FINAL_SIGMA, SIGMA, JSON.stringify(["%praha%", "%ittec\\%%"])]);
    // The same steps in the same order as foldDiacritics: decompose, drop the marks, translate, lower case, one sigma.
    expect(sql).toMatch(/^\(SELECT replace\(lower\(translate\(regexp_replace\(normalize\(concat_ws\(' ',/);
    expect(sql).toContain(`${SHOWN}), NFD), $5, '', 'g'), $6, $7)), $8, $9)`);
    for (const field of ["quote.quote_number", 'd."customerName"', 'd."serviceType"', "d.direction", "d.origin", "d.destination", "d.commodity", "d.incoterm", "quote.owner_label", "quote.shipment_job_number"]) {
      expect(sql, field).toContain(field);
    }
    // A document that is no object has no fields - it must not fail the list of the whole company.
    expect(sql).toContain("FROM jsonb_to_record(CASE WHEN jsonb_typeof(quote.data) = 'object' THEN quote.data ELSE '{}'::jsonb END)");
    expect(sql.endsWith("LIKE ALL (ARRAY(SELECT jsonb_array_elements_text($10::jsonb)))")).toBe(true);
  });

  it("sorts newest first by default, what is missing last, the id settling the rest", async () => {
    await list();
    const { orderBy, limit, offset } = fake.state.pages[0]!;
    expect(orderBy.map((order) => rendered(order).sql)).toEqual(['"quote"."created_at" desc nulls last', '"quote"."id" desc']);
    expect({ limit, offset }).toEqual({ limit: 50, offset: 0 });
  });

  it("sorts by each of its ten keys, in both directions", async () => {
    const keys: Record<string, string> = {
      createdAt: '"quote"."created_at"',
      updatedAt: '"quote"."updated_at"',
      quoteNumber: '"quote"."quote_number"',
      customer: `nullif(btrim("quote"."data"->>'customerName'), '')`,
      status: `CASE WHEN "quote"."status" in ($1, $2) AND "quote"."valid_until" < $3::date THEN 'expired' ELSE "quote"."status" END`,
      owner: `nullif("quote"."owner_label", '')`,
      sentAt: '"quote"."sent_at"',
      validUntil: '"quote"."valid_until"',
      decidedAt: '"quote"."decided_at"',
      lastContactAt: LAST_CONTACT,
    };
    for (const sortBy of Object.keys(keys)) {
      for (const sortDirection of ["asc", "desc"] as const) {
        fake.state.pages = [];
        await list({}, { sortBy, sortDirection, limit: 20, offset: 40 });
        const { orderBy, limit, offset } = fake.state.pages[0]!;
        expect(orderBy.map((order) => rendered(order).sql), `${sortBy} ${sortDirection}`).toEqual([`${keys[sortBy]} ${sortDirection} nulls last`, `"quote"."id" ${sortDirection}`]);
        expect({ limit, offset }).toEqual({ limit: 20, offset: 40 });
      }
    }
  });

  it("sorts newest first for a sort it does not know: nothing a caller sends becomes SQL", async () => {
    for (const sortBy of ["", "price", "created_at; drop table quote", "constructor", "__proto__"]) {
      fake.state.pages = [];
      await list({}, { sortBy, sortDirection: "asc" });
      expect(fake.state.pages[0]!.orderBy.map((order) => sent(order)), sortBy).toEqual([
        { sql: '"quote"."created_at" asc nulls last', params: [] },
        { sql: '"quote"."id" asc', params: [] },
      ]);
    }
  });

  it("with afterId reads the rows after that id in the order of their ids - no offset, no other sort - and still counts the whole filter", async () => {
    const afterId = "0b8d5a0e-6a43-4f4a-9a53-5d0d3a2b6c11";
    await list({ ownerUserId: "user-1" }, { afterId, limit: 200, offset: 400, sortBy: "customer", sortDirection: "desc" });
    const { where, orderBy, limit, offset } = fake.state.pages[0]!;
    expect(sent(where)).toEqual({
      sql: `((${BASE} and "quote"."owner_user_id" = $2) and "quote"."id" > $3)`,
      params: [COMPANY, "user-1", afterId],
    });
    expect(orderBy.map((order) => rendered(order).sql)).toEqual(['"quote"."id" asc']);
    expect({ limit, offset }).toEqual({ limit: 200, offset: undefined });
    expect(sent(fake.state.counts[0])).toEqual({ sql: `(${BASE} and "quote"."owner_user_id" = $2)`, params: [COMPANY, "user-1"] });
  });
});

describe("shipmentLinks", () => {
  it("lists the company's live sales quotes that are linked to a shipment - nothing deleted, no row of the old quotes module, no quote without a link", async () => {
    fake.state.links = [{ quoteNumber: "QCZ20261010001", shipmentId: "7b0e4d53-08a5-4e5e-9a0b-0e2f6a1f1c01" }];
    await expect(salesQuoteRepository.shipmentLinks(COMPANY)).resolves.toEqual(fake.state.links);
    expect(fake.state.steps).toEqual(["db read links"]);
    const { sql, params } = rendered(fake.state.linkReads[0]);
    expect(sql).toBe('("quote"."company_id" = $1 and "quote"."deleted_at" is null and "quote"."status" is not null and "quote"."shipment_id" is not null)');
    expect(params).toEqual([COMPANY]);
  });
});

describe("customerFacts", () => {
  const LIVE = '"quote"."company_id" = $1 and "quote"."deleted_at" is null and "quote"."status" is not null';
  // A quote that went out: a first sent date, or a status that proves it.
  const SENT = '("quote"."first_sent_at" is not null or "quote"."status" in ($1, $2, $3, $4, $5, $6))';
  const SENT_STATUSES = ["quoted", "feedback", "revised", "won", "expired", "replaced"];
  const FIRST_SENT = `min(coalesce("quote"."first_sent_at", "quote"."created_at")) filter (where ${SENT})`;

  it("groups the company's live sales quotes that are for a customer by that customer, and counts the sent ones that are for none", async () => {
    const facts = [
      {
        customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30",
        sentQuotes: 2,
        sentQuotesWithoutDate: 1,
        firstSentAt: new Date("2026-10-03T09:00:00.000Z"),
        firstSentAtKnown: true,
        lastActivityAt: new Date("2026-10-10T19:17:34.487Z"),
      },
    ];
    fake.state.facts = facts;
    // Postgres reports a count as text.
    fake.state.total = "2";
    await expect(salesQuoteRepository.customerFacts(COMPANY)).resolves.toEqual({ customers: facts, quotesWithoutCustomer: 2 });

    const [read] = fake.state.factReads;
    // Nothing deleted, no row of the old quotes module, no quote without a customer record.
    expect(rendered(read!.where)).toMatchObject({ sql: `((${LIVE}) and "quote"."customer_id" is not null)`, params: [COMPANY] });
    expect(read!.groupBy).toHaveLength(1);
    expect(read!.groupBy[0]).toBe(quoteTable.customerId);
    expect(rendered(fake.state.counts[0])).toMatchObject({
      sql: `((${LIVE}) and "quote"."customer_id" is null and ${SENT.replace("$1, $2, $3, $4, $5, $6", "$2, $3, $4, $5, $6, $7")})`,
      params: [COMPANY, ...SENT_STATUSES],
    });
  });

  it("counts a quote as sent by its first sent date or by a status that proves it, and dates one without a sent date by its creation", async () => {
    await salesQuoteRepository.customerFacts(COMPANY);
    const { fields } = fake.state.factReads[0]!;
    expect(rendered(fields.sentQuotes)).toMatchObject({ sql: `count(*) filter (where ${SENT})`, params: SENT_STATUSES });
    expect(rendered(fields.sentQuotesWithoutDate).sql).toBe(`count(*) filter (where ${SENT} and "quote"."first_sent_at" is null)`);
    expect(rendered(fields.firstSentAt).sql).toBe(FIRST_SENT);
    // Known = the earliest recorded sending is the earliest moment of all.
    expect(rendered(fields.firstSentAtKnown).sql).toBe(
      `coalesce(min("quote"."first_sent_at") <= ${FIRST_SENT}, false)`,
    );
    expect(rendered(fields.lastActivityAt).sql).toBe('max("quote"."updated_at")');
  });
});

describe("openCustomerQuotes", () => {
  it("reads the company's live sales quotes that are open as shown today and are for a customer, the newest first", async () => {
    const open = [{ customerId: "946e01e8-a4ed-4aa7-932b-2c5d5e991c30", quoteNumber: "QCZ20261010001", status: "quoted", validUntil: "2026-10-25", currency: "EUR", fx: null, rates: null, sellingLines: [] }];
    fake.state.openQuotes = open;
    await expect(salesQuoteRepository.openCustomerQuotes(COMPANY, "2026-10-12")).resolves.toEqual(open);
    const [read] = fake.state.openQuoteReads;
    // The status shown: a Quoted or Feedback quote past its validity is Expired, and so not open.
    expect(rendered(read!.where)).toMatchObject({
      sql:
        '("quote"."company_id" = $1 and "quote"."deleted_at" is null and "quote"."status" is not null and "quote"."customer_id" is not null and ' +
        `CASE WHEN "quote"."status" in ($2, $3) AND "quote"."valid_until" < $4::date THEN 'expired' ELSE "quote"."status" END in ($5, $6, $7, $8, $9))`,
      params: [COMPANY, "quoted", "feedback", "2026-10-12", "draft", "ready_to_send", "quoted", "feedback", "revised"],
    });
    expect(read!.orderBy.map((order) => rendered(order).sql)).toEqual(['"quote"."created_at" desc', '"quote"."id" desc']);
  });

  it("takes of the document only what a quote's value is worked out from", async () => {
    await salesQuoteRepository.openCustomerQuotes(COMPANY, "2026-10-12");
    const { fields } = fake.state.openQuoteReads[0]!;
    expect(Object.keys(fields)).toEqual(["customerId", "quoteNumber", "status", "validUntil", "currency", "fx", "rates", "sellingLines"]);
    expect(rendered(fields.currency).sql).toBe(`coalesce("quote"."data"->>'currency', '')`);
    expect(rendered(fields.fx).sql).toBe(`"quote"."data"->'fx'`);
    expect(rendered(fields.rates).sql).toBe(`"quote"."data"->'rates'`);
    expect(rendered(fields.sellingLines).sql).toBe(`"quote"."data"->'sellingLines'`);
  });
});

describe("owner matching", () => {
  const UNEXAMINED =
    '"quote"."company_id" = $1 and "quote"."status" is not null and "quote"."owner_user_id" is null and "quote"."owner_match_checked_at" is null';

  it("lists the owner texts of the company's sales quotes", async () => {
    fake.state.labels = ["Martin", "Petr", ""];
    await expect(salesQuoteRepository.unexaminedOwnerLabels(COMPANY)).resolves.toEqual(["Martin", "Petr", ""]);
  });

  it("records a match on the quotes that carry the text and were never examined - owner user and stamp, nothing else", async () => {
    await salesQuoteRepository.recordOwnerMatch(COMPANY, "Martin", "user-1");
    const { set, where } = fake.state.updates[0]!;
    expect(Object.keys(set).sort()).toEqual(["ownerMatchCheckedAt", "ownerUserId"]);
    expect(set.ownerUserId).toBe("user-1");
    expect(set.ownerMatchCheckedAt).toBeInstanceOf(Date);
    expect(rendered(where)).toMatchObject({ sql: `((${UNEXAMINED}) and "quote"."owner_label" = $2)`, params: [COMPANY, "Martin"] });
  });

  it("stamps a text that fits nobody as examined too, without an owner user", async () => {
    await salesQuoteRepository.recordOwnerMatch(COMPANY, "Petr", null);
    const { set } = fake.state.updates[0]!;
    expect(set.ownerUserId).toBeNull();
    expect(set.ownerMatchCheckedAt).toBeInstanceOf(Date);
  });
});
