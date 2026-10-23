import { and, asc, count, desc, eq, gt, gte, inArray, isNotNull, isNull, like, or, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { BUSINESS_TZ } from "../../../lib/businessDate";
import { isUniqueViolation } from "../../../lib/db/errors";
import { TenantRepository } from "../../../lib/db/repository";
import type { StoredFx } from "../lib/quoteFx";
import { db } from "../db/db";
import { quoteTable, type NewQuoteRecord, type QuoteRecord, type SalesQuoteRecord } from "../schemas/quote.schema";
import { isPlainObject } from "../utils/quoteDocument.utils";
import {
  AWAITING,
  OPEN,
  SENT_EVIDENCE,
  columnsOf,
  legacyUnreadable,
  mirrorOf,
  stateOf,
  type LifecycleState,
  type TimelineEntry,
} from "../utils/quoteLifecycle.utils";
import { COMBINING_MARKS, FINAL_SIGMA, FOLD_FROM, FOLD_TO, SIGMA, escapeLike } from "../utils/quoteSearch.utils";

// What a sales quote is: a row whose status column is filled. Rows of the old quotes module
// share the table and have none. This is the one place the rule is written; a sales quote
// written by code from before the server owned the lifecycle carries its status in the document
// only, and becomes one when it is adopted (adoptPending, loadLive).
const isSalesQuote = isNotNull(quoteTable.status);

export function isSalesRow(row: QuoteRecord): row is SalesQuoteRecord {
  return row.status !== null;
}

// Whether the lifecycle columns of a row have to be filled from its document (again): a sales
// quote never adopted, or one whose document says something else than its columns. Only code
// from before the server owned the lifecycle writes such rows. The same facts, compared the same
// way, as in quote_adopt_lifecycle (migration 0004), which then does the work. The columns are
// written out with their table on purpose: the function's output columns carry the same names
// and would be meant otherwise.
const needsAdoption = sql<boolean>`(SELECT d.status IS NOT NULL AND (
  quote.status IS DISTINCT FROM d.status OR quote.substatus IS DISTINCT FROM d.substatus
  OR quote.lost_reason IS DISTINCT FROM d.lost_reason OR quote.lost_comment IS DISTINCT FROM d.lost_comment
  OR quote.sent_at IS DISTINCT FROM d.sent_at OR quote.decided_at IS DISTINCT FROM d.decided_at
  OR quote.valid_until IS DISTINCT FROM d.valid_until OR quote.owner_label IS DISTINCT FROM d.owner_label)
  FROM quote_lifecycle_of(quote.data) d)`;

// A list of keys as ONE parameter: drizzle would expand a JavaScript array into a placeholder
// per item.
const textArray = (keys: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))`;

// THE FRAGMENTS OF THE LIST QUERIES, each written once. They restate rules of
// quoteLifecycle.utils in SQL; "today" (the business day) and the moment a follow-up is due
// before are worked out in TypeScript and passed in, so SQL has no clock and no time zone of its
// own and a list is judged at the same moment as the items it returns.

// The moment a list is read at, as the rules need it: businessDay(now) and followUpDueBefore(now).
interface ListMoment {
  today: string;
  dueBefore: Date;
}

const isAwaiting = inArray(quoteTable.status, [...AWAITING]);

// The status a quote shows (effectiveStatus): Expired once the validity of a Quoted or Feedback
// quote has passed.
const shownStatus = (today: string) =>
  sql<string>`CASE WHEN ${isAwaiting} AND ${quoteTable.validUntil} < ${today}::date THEN 'expired' ELSE ${quoteTable.status} END`;

// When the customer last heard from us, for the follow-up: the last recorded contact, else the
// sending, else - for a quote that never got a sent date - its creation.
const lastContact = sql`coalesce(${quoteTable.lastContactAt}, ${quoteTable.sentAt}, ${quoteTable.createdAt})`;

// isFollowUpDue, word for word. "Not expired" is written out for a quote without a validity
// date: NOT (NULL < today) would be NULL and drop it. The rules see times in milliseconds, a
// creation date holds microseconds: compared as the rules see it, so flag and filter agree.
const followUpIsDue = ({ today, dueBefore }: ListMoment) =>
  and(
    isAwaiting,
    or(isNull(quoteTable.validUntil), gte(quoteTable.validUntil, today)),
    sql`date_trunc('milliseconds', ${lastContact}) <= ${dueBefore.toISOString()}::timestamptz`,
  );

// A quote that went out to the customer at some point, as far as its columns tell: it has a first
// sent date, or - for a quote set to Quoted before sent dates were recorded - a status that proves
// it (SENT_EVIDENCE). Judged on the status the quote has now: one that was sent without a date and
// has left such a status since is not told from a quote that was never sent.
const wasSent = sql`(${quoteTable.firstSentAt} is not null or ${inArray(quoteTable.status, [...SENT_EVIDENCE])})`;

// The rows whose moment falls on the business days from..to, either end open: from the midnight
// in Prague that starts the first day to the one that ends the last.
const onBusinessDays = (moment: PgColumn, from?: string, to?: string) =>
  and(
    from ? sql`${moment} >= (${from}::date)::timestamp AT TIME ZONE ${BUSINESS_TZ}::text` : undefined,
    to ? sql`${moment} < (${to}::date + 1)::timestamp AT TIME ZONE ${BUSINESS_TZ}::text` : undefined,
  );

// The text of a quote a search looks through, folded the way foldDiacritics folds the words
// looked for (quoteSearch.utils: the same steps, the same constants). One sub-select per row:
// the document is unpacked once for all its fields and the text is built once however many words
// are looked for. A document that is no object has no fields instead of failing the whole list.
// The columns are written out with their table, as in needsAdoption.
const searchedText = (today: string) => sql<string>`(SELECT replace(lower(translate(regexp_replace(normalize(concat_ws(' ',
      quote.quote_number, d."customerName", d."serviceType", d.direction, d.origin, d.destination, d.commodity, d.incoterm,
      quote.owner_label, quote.shipment_job_number, ${shownStatus(today)}), NFD), ${COMBINING_MARKS}, '', 'g'), ${FOLD_FROM}, ${FOLD_TO})), ${FINAL_SIGMA}, ${SIGMA})
    FROM jsonb_to_record(CASE WHEN jsonb_typeof(quote.data) = 'object' THEN quote.data ELSE '{}'::jsonb END)
      AS d("customerName" text, "serviceType" text, direction text, origin text, destination text, commodity text, incoterm text))`;

// What a list can be sorted by, and what each sort orders by: the whole of it - nothing a caller
// sends ever becomes SQL, and a sort that is not listed here means the newest first. A text that
// is empty counts as missing, and what is missing comes last in both directions. Status is the
// one shown; the owner is the stored label, since the users' current names live in another
// database.
const sortKey = (sortBy: string, today: string): SQL | PgColumn => {
  const keys: Record<string, SQL | PgColumn> = {
    createdAt: quoteTable.createdAt,
    updatedAt: quoteTable.updatedAt,
    quoteNumber: quoteTable.quoteNumber,
    customer: sql`nullif(btrim(${quoteTable.data}->>'customerName'), '')`,
    status: shownStatus(today),
    owner: sql`nullif(${quoteTable.ownerLabel}, '')`,
    sentAt: quoteTable.sentAt,
    validUntil: quoteTable.validUntil,
    decidedAt: quoteTable.decidedAt,
    lastContactAt: lastContact,
  };
  return Object.hasOwn(keys, sortBy) ? keys[sortBy] : keys.createdAt;
};

/** Which sales quotes a list holds. Every part narrows it; none of them = all of the company's. */
export interface SalesQuoteFilter {
  /** Statuses as shown: "expired" finds the Quoted and Feedback quotes whose validity has passed, "quoted" no longer does. */
  statuses?: string[];
  serviceType?: string;
  direction?: string;
  /** Created on these business days (YYYY-MM-DD), either end open. */
  createdFrom?: string;
  createdTo?: string;
  /** Won or lost on these business days. */
  decidedFrom?: string;
  decidedTo?: string;
  /** The user the quotes belong to; null = the quotes that belong to no user. */
  ownerUserId?: string | null;
  customerId?: string;
  /** Only the quotes a follow-up is due on. */
  followUpDue?: boolean;
  /** A base reference: that quote and its variants (-2, -3, ...). */
  family?: string;
  /** Only the quotes a shipment names (true), or only those none does (false). */
  hasShipment?: boolean;
  /** Words that all have to occur in the quote's searched text, as searchTokens makes them. */
  search?: string[];
}

/**
 * Which part of a list, and in which order. With `afterId` the rows are those with a greater id,
 * in the order of their ids, and offset and sort do not apply: the way to load everything. A
 * quote created or deleted meanwhile can then neither make a page skip a row nor repeat one.
 */
export interface SalesQuotePage {
  limit: number;
  offset: number;
  /** createdAt, updatedAt, quoteNumber, customer, status, owner, sentAt, validUntil, decidedAt or lastContactAt; anything else is createdAt. */
  sortBy: string;
  sortDirection: "asc" | "desc";
  afterId?: string;
}

// How often an allocation is tried again after losing its reference to somebody else.
const MAX_REFERENCE_RETRIES = 3;

// Rows that the query itself restricts to sales quotes (status filled), checked rather than cast:
// a row without a status here would be a bug in the query, not data to hand on.
function salesRows(rows: QuoteRecord[]): SalesQuoteRecord[] {
  return rows.map((row) => {
    if (!isSalesRow(row)) throw new Error(`quote ${row.quoteNumber} has no lifecycle status`);
    return row;
  });
}

/** What the company's live sales quotes say about one customer. */
export interface CustomerQuoteFactsRow {
  customerId: string;
  /** How many of the customer's quotes went out. */
  sentQuotes: number;
  /** How many of those have no sent date. */
  sentQuotesWithoutDate: number;
  /** When the first of them went out; for one without a sent date, when it was created. Null when none went out. */
  firstSentAt: Date | null;
  /** Whether that moment is a recorded sending, not a creation date standing in for one. */
  firstSentAtKnown: boolean;
  /** The last write of any of the customer's quotes. */
  lastActivityAt: Date;
}

/** An open quote of a customer, with what its value is worked out from. */
export interface CustomerOpenQuoteRow {
  customerId: string;
  quoteNumber: string;
  status: string;
  validUntil: string | null;
  /** The quote's currency as its document stores it; "" when it stores none. */
  currency: string;
  /** data.fx: the ČNB rates stored when the quote was sent; null for a draft. */
  fx: StoredFx | null;
  /** data.rates (legacy weekly-sheet rates) and data.sellingLines, as stored. */
  rates: unknown;
  sellingLines: unknown;
}

/** A transaction of the quotes database. */
export type QuoteTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** The row a new sales quote is stored as: its document together with its lifecycle columns. */
export type NewSalesQuote = Omit<NewQuoteRecord, "companyId" | "quoteNumber"> & { status: string };

/** The version a save is based on: the version of the document. */
export type SavedVersion = { dataVersion: number };

/** What a lifecycle action writes. */
export interface LifecycleWrite {
  /** The lifecycle facts after the action. */
  state: LifecycleState;
  /** Its history lines; none when it leaves no trace (a validity set before the first sending). */
  entries: TimelineEntry[];
  /**
   * Document keys the action stores besides the lifecycle - the rates taken when a quote is
   * sent (or null when they are dropped), the lines and pricing a quote is priced with from the
   * trucking tariffs, a margin approval. Writing them makes a new version of the document.
   */
  document?: { fx?: StoredFx | null } & Record<string, unknown>;
  /** Document keys the action removes (a margin approval a new pricing makes void). Only together with `document`. */
  drop?: string[];
  /** Set by the action that deletes the quote: who deletes it, and when. */
  deleted?: { by: string; at: Date };
  /**
   * Keys only the server writes (PROTECTED_KEYS) that the editor never sends: stored without a
   * new version of the document, so a quote open in an editor is not disturbed (the warehouse
   * inquiry and its answer).
   */
  serverKeys?: Record<string, unknown>;
}

class SalesQuoteRepository extends TenantRepository<typeof quoteTable> {
  constructor() {
    super(db, quoteTable, "quote");
  }

  // How many times this process adopted quotes of a company (adoptPending, loadLive). It says
  // nothing about the quotes: it is the sign, for whoever remembers what it has seen of the
  // company's adopted quotes (the owner matching), that there may be some it has not.
  private readonly adoptionsMade = new Map<string, number>();

  /** A number that grows whenever this process adopts quotes of the company. */
  adoptions(companyId: string): number {
    return this.adoptionsMade.get(companyId) ?? 0;
  }

  /**
   * Fills the lifecycle columns of the company's sales quotes that were never adopted - written
   * by code from before the server owned the lifecycle - and returns how many there were.
   * Normally none: quote_unadopted_idx holds exactly these rows, so asking is an index probe.
   */
  async adoptPending(companyId: string): Promise<number> {
    const result = await db.execute<{ adopted: number }>(sql`select quote_adopt_lifecycle(${companyId}::uuid, false) as adopted`);
    const adopted = result.rows[0]?.adopted ?? 0;
    if (adopted) this.countAdoption(companyId);
    return adopted;
  }

  /**
   * A live quote by its reference, sales quote or not, with its columns in step with its
   * document: a row that needs it is adopted from the document first and read again, so nothing
   * is decided - not even whether it is a sales quote - on columns older code left behind. An
   * adoption is counted (adoptions).
   * With `lock` the row is locked for that transaction (SELECT ... FOR UPDATE).
   */
  async loadLive(companyId: string, quoteNumber: string, options: { lock?: QuoteTransaction } = {}): Promise<QuoteRecord | null> {
    const run = options.lock ?? db;
    const find = async () => {
      const query = run
        .select({ row: quoteTable, needsAdoption })
        .from(quoteTable)
        .where(and(eq(quoteTable.companyId, companyId), eq(quoteTable.quoteNumber, quoteNumber), isNull(quoteTable.deletedAt)))
        .limit(1);
      const [found] = await (options.lock ? query.for("update") : query);
      return found ?? null;
    };

    let found = await find();
    if (found?.needsAdoption) {
      await run.execute(sql`select quote_adopt_lifecycle(${companyId}::uuid, true, ${found.row.id}::uuid)`);
      this.countAdoption(companyId);
      found = await find();
    }
    return found?.row ?? null;
  }

  /**
   * Live sales quotes with a warehouse inquiry (the document's `warehouseInquiry`): those waiting
   * for the warehouse and those answered since `answeredSince` (ISO), newest question first. For
   * the Warehouse Concept Managers page; at most 500.
   */
  async listWarehouseInquiries(companyId: string, answeredSince: string): Promise<SalesQuoteRecord[]> {
    const inquiry = sql`${quoteTable.data}->'warehouseInquiry'`;
    const rows = await db
      .select()
      .from(quoteTable)
      .where(
        and(
          eq(quoteTable.companyId, companyId),
          isNull(quoteTable.deletedAt),
          isSalesQuote,
          sql`jsonb_typeof(${inquiry}) = 'object'`,
          sql`(${inquiry}->>'status' = 'pending' OR coalesce(${inquiry}->>'decidedAt', '') >= ${answeredSince})`,
        ),
      )
      .orderBy(sql`${inquiry}->>'requestedAt' desc`)
      .limit(500);
    return salesRows(rows);
  }

  /**
   * Live sales quotes whose warehouse inquiry `userId` asked and the warehouse answered: not opened
   * yet, or opened since `seenSince` (ISO) — the bell keeps a read answer for a while.
   */
  async listInquiryAnswersFor(companyId: string, userId: string, seenSince: string): Promise<SalesQuoteRecord[]> {
    const inquiry = sql`${quoteTable.data}->'warehouseInquiry'`;
    const rows = await db
      .select()
      .from(quoteTable)
      .where(
        and(
          eq(quoteTable.companyId, companyId),
          isNull(quoteTable.deletedAt),
          isSalesQuote,
          sql`jsonb_typeof(${inquiry}) = 'object'`,
          sql`${inquiry}->>'requestedById' = ${userId}`,
          sql`${inquiry}->>'status' IN ('approved', 'rejected')`,
          sql`(coalesce(${inquiry}->>'answerSeenAt', '') = '' OR ${inquiry}->>'answerSeenAt' >= ${seenSince})`,
        ),
      )
      .orderBy(sql`${inquiry}->>'decidedAt' desc`)
      .limit(100);
    return salesRows(rows);
  }

  /** A live sales quote by its reference; null when it is missing, deleted or a row of the old quotes module. */
  async loadSales(companyId: string, quoteNumber: string, options: { lock?: QuoteTransaction } = {}): Promise<SalesQuoteRecord | null> {
    const row = await this.loadLive(companyId, quoteNumber, options);
    return row && isSalesRow(row) ? row : null;
  }

  /**
   * Runs `change` on a live sales quote while nobody else can write its lifecycle: in one
   * transaction, after locking the row. `change` gets the quote as stored at that moment and
   * the transaction to write it with (writeLifecycle); what it returns is returned, and an error
   * it throws leaves the quote untouched. Null, without calling it, when there is no such quote.
   */
  async withLockedQuote<T>(
    companyId: string,
    quoteNumber: string,
    change: (quote: SalesQuoteRecord, tx: QuoteTransaction) => Promise<T>,
  ): Promise<T | null> {
    const adoptions = this.adoptions(companyId);
    const result = await db.transaction(async (tx) => {
      const quote = await this.loadSales(companyId, quoteNumber, { lock: tx });
      return quote ? change(quote, tx) : null;
    });
    // A quote the load had to adopt was counted while only this transaction could see it: whoever
    // looked for adopted quotes meanwhile found none. Now that it is committed it counts again.
    // (So does an adoption somebody else made meanwhile; once too often costs one more look.)
    if (this.adoptions(companyId) !== adoptions) this.countAdoption(companyId);
    return result;
  }

  /**
   * THE ONLY WRITER of a quote's lifecycle. `quote` is the row as locked by withLockedQuote. One
   * statement sets the columns - the truth - and restates their mirror in the document, so the
   * two can never disagree: the whole mirror is written anew each time (mirrorOf), history lines
   * are appended, and a legacy value the columns could not take is set aside before its key
   * goes (legacyUnreadable). Every JSON operand is guarded, so the statement itself cannot turn
   * the document or the history into NULL - not for a document that is no object, a history
   * that is no list, or a parameter that arrives empty. The document version moves only when
   * the action also writes a document key. A quote is deleted through this write as well
   * (`deleted`): the statement that adds its last history line stamps the row as deleted, with
   * who did it and when.
   */
  async writeLifecycle(tx: QuoteTransaction, quote: SalesQuoteRecord, write: LifecycleWrite): Promise<SalesQuoteRecord> {
    const { state } = write;
    const mirror = mirrorOf(state);
    const stored = isPlainObject(quote.data) ? quote.data : {};
    // The quote as the action read it. Not the row itself: an adopted label can end in a space
    // no state has (stateOf), and that alone is not a new owner.
    const before = stateOf(quote);
    const set = { ...mirror.set, ...legacyUnreadable(before, stored), ...write.serverKeys, ...write.document };
    const now = new Date();
    // An owner chosen by hand is never matched to a user by its text afterwards.
    const ownerChanged = state.ownerUserId !== before.ownerUserId || state.ownerLabel !== before.ownerLabel;

    const written = await tx
      .update(quoteTable)
      .set({
        ...columnsOf(state),
        ...(ownerChanged && !quote.ownerMatchCheckedAt ? { ownerMatchCheckedAt: now } : {}),
        ...(write.deleted ? { deletedAt: write.deleted.at, deletedBy: write.deleted.by } : {}),
        updatedAt: now,
        dataVersion: sql`${quoteTable.dataVersion} + ${write.document ? 1 : 0}`,
        data: sql`((CASE WHEN jsonb_typeof(${quoteTable.data}) = 'object' THEN ${quoteTable.data} ELSE '{}'::jsonb END) - ${textArray([...mirror.remove, ...(write.drop ?? [])])})
          || coalesce(${JSON.stringify(set)}::jsonb, '{}'::jsonb)
          || jsonb_build_object('timeline', (CASE WHEN jsonb_typeof(${quoteTable.data}->'timeline') = 'array' THEN ${quoteTable.data}->'timeline' ELSE '[]'::jsonb END)
            || coalesce(${JSON.stringify(write.entries)}::jsonb, '[]'::jsonb))`,
      })
      .where(and(eq(quoteTable.id, quote.id), eq(quoteTable.companyId, quote.companyId)))
      .returning();
    const [row] = salesRows(written);
    if (!row) throw new Error(`quote ${quote.quoteNumber} was not written`);
    return row;
  }

  /**
   * A save of the document of a live sales quote, in ONE statement: the version check is part of
   * it, so nothing can slip in between the check and the write. The keys in `carry` are taken
   * from the stored document, whatever the incoming one says - the lifecycle keys always, so a
   * save can neither change nor lose them. Null when nothing was written: the quote is not that
   * version any more, or not there.
   */
  async saveDocument(
    companyId: string,
    quoteNumber: string,
    save: { data: Record<string, unknown>; carry: string[] },
    expected: SavedVersion,
  ): Promise<SalesQuoteRecord | null> {
    const carry = textArray(save.carry);
    const saved = await db
      .update(quoteTable)
      .set({
        data: sql`(${JSON.stringify(save.data)}::jsonb - ${carry})
          || coalesce((SELECT jsonb_object_agg(e.key, e.value)
              FROM jsonb_each(CASE WHEN jsonb_typeof(${quoteTable.data}) = 'object' THEN ${quoteTable.data} ELSE '{}'::jsonb END) e
              WHERE e.key = ANY(${carry})), '{}'::jsonb)`,
        dataVersion: sql`${quoteTable.dataVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(this.liveSalesQuote(companyId, quoteNumber, expected))
      .returning();
    return salesRows(saved)[0] ?? null;
  }

  /**
   * A part of the company's live sales quotes that match a filter, and how many match in all.
   * The count is of the filter alone - not of what is left after `afterId` - so it stays the
   * same while a caller walks through the list.
   */
  async list(
    companyId: string,
    filter: SalesQuoteFilter,
    page: SalesQuotePage,
    moment: ListMoment,
  ): Promise<{ rows: SalesQuoteRecord[]; total: number }> {
    const where = this.matching(companyId, filter, moment);
    const order = page.sortDirection === "asc" ? asc : desc;
    const rows = page.afterId
      ? db
          .select()
          .from(quoteTable)
          .where(and(where, gt(quoteTable.id, page.afterId)))
          .orderBy(asc(quoteTable.id))
          .limit(page.limit)
      : db
          .select()
          .from(quoteTable)
          .where(where)
          // The id settles the order of quotes that are equal in what they are sorted by: pages do not overlap.
          .orderBy(sql`${order(sortKey(page.sortBy, moment.today))} nulls last`, order(quoteTable.id))
          .limit(page.limit)
          .offset(page.offset);
    const [found, [{ value: total }]] = await Promise.all([rows, db.select({ value: count() }).from(quoteTable).where(where)]);
    return { rows: salesRows(found), total: Number(total) };
  }

  /**
   * The shipment each of the company's live sales quotes is linked to; quotes without a link are
   * not listed. For the shipments service, which compares it with the shipments that name a quote.
   */
  async shipmentLinks(companyId: string): Promise<{ quoteNumber: string; shipmentId: string }[]> {
    const rows = await db
      .select({ quoteNumber: quoteTable.quoteNumber, shipmentId: quoteTable.shipmentId })
      .from(quoteTable)
      .where(and(eq(quoteTable.companyId, companyId), isNull(quoteTable.deletedAt), isSalesQuote, isNotNull(quoteTable.shipmentId)));
    return rows.flatMap((r) => (r.shipmentId ? [{ quoteNumber: r.quoteNumber, shipmentId: r.shipmentId }] : []));
  }

  /**
   * How many of the company's live sales quotes that are still open - not won, lost or replaced
   * by a revision - were road-priced (the document's roadPricing) with one of these trucking
   * tariff versions, on the sell or the buy side.
   */
  async countOpenByTariffVersions(companyId: string, versionIds: string[]): Promise<number> {
    if (!versionIds.length) return 0;
    const ids = textArray(versionIds);
    const [{ value }] = await db
      .select({ value: count() })
      .from(quoteTable)
      .where(
        and(
          eq(quoteTable.companyId, companyId),
          isNull(quoteTable.deletedAt),
          isSalesQuote,
          sql`${quoteTable.status} NOT IN ('won', 'lost', 'replaced')`,
          sql`(${quoteTable.data}->'roadPricing'->'sell'->>'tariffVersionId' = ANY(${ids}) OR ${quoteTable.data}->'roadPricing'->'buy'->>'tariffVersionId' = ANY(${ids}))`,
        ),
      );
    return Number(value);
  }

  /**
   * What the company's live sales quotes say about each customer they are for - the customer is
   * the document's customerId, which the column customer_id follows: how many went out, when the
   * first did, and when any of them was last written. Sent quotes that name no customer record
   * can place nobody and are only counted.
   */
  async customerFacts(companyId: string): Promise<{ customers: CustomerQuoteFactsRow[]; quotesWithoutCustomer: number }> {
    const live = and(eq(quoteTable.companyId, companyId), isNull(quoteTable.deletedAt), isSalesQuote);
    // A quote without a sent date counts from its creation: it cannot have gone out before.
    const firstSent = sql`min(coalesce(${quoteTable.firstSentAt}, ${quoteTable.createdAt})) filter (where ${wasSent})`;
    const [customers, [{ value }]] = await Promise.all([
      db
        .select({
          customerId: quoteTable.customerId,
          sentQuotes: sql`count(*) filter (where ${wasSent})`.mapWith(Number),
          sentQuotesWithoutDate: sql`count(*) filter (where ${wasSent} and ${quoteTable.firstSentAt} is null)`.mapWith(Number),
          firstSentAt: firstSent.mapWith(quoteTable.createdAt),
          // The earliest recorded sending is the earliest moment of all: no undated quote was
          // created before it.
          firstSentAtKnown: sql<boolean>`coalesce(min(${quoteTable.firstSentAt}) <= ${firstSent}, false)`,
          lastActivityAt: sql`max(${quoteTable.updatedAt})`.mapWith(quoteTable.updatedAt),
        })
        .from(quoteTable)
        .where(and(live, isNotNull(quoteTable.customerId)))
        .groupBy(quoteTable.customerId),
      db
        .select({ value: count() })
        .from(quoteTable)
        .where(and(live, isNull(quoteTable.customerId), wasSent)),
    ]);
    return {
      customers: customers.flatMap((c) => (c.customerId ? [{ ...c, customerId: c.customerId }] : [])),
      quotesWithoutCustomer: Number(value),
    };
  }

  /**
   * The company's live sales quotes that are still open - not decided and, as shown on `today`,
   * not expired - and are for a customer record, the newest first. Of the document only what a
   * quote's value is worked out from is read: its currency, its stored rates, its selling lines.
   */
  async openCustomerQuotes(companyId: string, today: string): Promise<CustomerOpenQuoteRow[]> {
    const rows = await db
      .select({
        customerId: quoteTable.customerId,
        quoteNumber: quoteTable.quoteNumber,
        status: quoteTable.status,
        validUntil: quoteTable.validUntil,
        currency: sql<string>`coalesce(${quoteTable.data}->>'currency', '')`,
        // A document's fx is the server's alone (lib/quoteFx), so it is StoredFx or absent.
        fx: sql<StoredFx | null>`${quoteTable.data}->'fx'`,
        rates: sql<unknown>`${quoteTable.data}->'rates'`,
        sellingLines: sql<unknown>`${quoteTable.data}->'sellingLines'`,
      })
      .from(quoteTable)
      .where(
        and(
          eq(quoteTable.companyId, companyId),
          isNull(quoteTable.deletedAt),
          isSalesQuote,
          isNotNull(quoteTable.customerId),
          inArray(shownStatus(today), [...OPEN]),
        ),
      )
      .orderBy(desc(quoteTable.createdAt), desc(quoteTable.id));
    return rows.flatMap((r) => (r.customerId && r.status ? [{ ...r, customerId: r.customerId, status: r.status, fx: r.fx ?? null }] : []));
  }

  /** The owner texts of the company's sales quotes that nobody compared with the users yet. */
  async unexaminedOwnerLabels(companyId: string): Promise<string[]> {
    const rows = await db.selectDistinct({ ownerLabel: quoteTable.ownerLabel }).from(quoteTable).where(this.unexaminedOwner(companyId));
    return rows.map((r) => r.ownerLabel);
  }

  /**
   * Records that an owner text was compared with the users: the quotes that carry it get the
   * user it names - nobody when it fits none or several - and are never examined again. Only
   * the owner user and the stamp are written; label, document, updatedAt and version stay.
   */
  async recordOwnerMatch(companyId: string, ownerLabel: string, ownerUserId: string | null): Promise<void> {
    await db
      .update(quoteTable)
      .set({ ownerUserId, ownerMatchCheckedAt: new Date() })
      .where(and(this.unexaminedOwner(companyId), eq(quoteTable.ownerLabel, ownerLabel)));
  }

  /**
   * Runs `body` in a transaction while nobody else can choose a reference: it gets every
   * reference of the company that starts with `prefix` - deleted quotes included, so a reference
   * is never reused - and inserts under the one it picks (insertQuote). An advisory lock keeps
   * two parallel calls from picking the same reference. Code that does not take the lock can
   * still get there first: the unique index then refuses the insert and the whole of `body` is
   * run again, with the references as they are by then.
   */
  private async withReferences<T>(companyId: string, prefix: string, body: (tx: QuoteTransaction, existing: string[]) => Promise<T>): Promise<T> {
    for (let retries = 0; ; retries++) {
      try {
        return await db.transaction(async (tx) => {
          await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`quote-ref:${companyId}`}))`);
          const used = await tx
            .select({ quoteNumber: quoteTable.quoteNumber })
            .from(quoteTable)
            .where(and(eq(quoteTable.companyId, companyId), like(quoteTable.quoteNumber, `${escapeLike(prefix)}%`)));
          return body(tx, used.map((r) => r.quoteNumber));
        });
      } catch (err) {
        if (!isUniqueViolation(err) || retries >= MAX_REFERENCE_RETRIES) throw err;
      }
    }
  }

  /** One sales quote inserted under `reference`: its lifecycle columns and document in one insert. */
  private async insertQuote(tx: QuoteTransaction, companyId: string, reference: string, row: NewSalesQuote): Promise<SalesQuoteRecord> {
    const inserted = await tx
      .insert(quoteTable)
      .values({ ...row, companyId, quoteNumber: reference })
      .returning();
    const [record] = salesRows(inserted);
    if (!record) throw new Error(`quote ${reference} was not inserted`);
    return record;
  }

  /**
   * Inserts a sales quote under a reference chosen while nobody else can choose one
   * (withReferences): `pick` gets the references that start with `prefix` and returns the new
   * one; `build` makes the row for it.
   */
  async createWithReference(
    companyId: string,
    prefix: string,
    pick: (existing: string[]) => string,
    build: (reference: string) => NewSalesQuote,
  ): Promise<SalesQuoteRecord> {
    return this.withReferences(companyId, prefix, async (tx, existing) => {
      const reference = pick(existing);
      return this.insertQuote(tx, companyId, reference, build(reference));
    });
  }

  /**
   * A quote and the revision that replaces it, in ONE transaction: the quote is locked, `plan`
   * gets it as stored and the references that start with `prefix` (withReferences), and returns
   * the revision's reference and row and the quote's lifecycle write. Both are written or
   * neither is. Null, without calling `plan`, when there is no such quote.
   */
  async revise(
    companyId: string,
    quoteNumber: string,
    prefix: string,
    plan: (quote: SalesQuoteRecord, existing: string[]) => { reference: string; row: NewSalesQuote; write: LifecycleWrite },
  ): Promise<{ quote: SalesQuoteRecord; revision: SalesQuoteRecord } | null> {
    const adoptions = this.adoptions(companyId);
    const result = await this.withReferences(companyId, prefix, async (tx, existing) => {
      const quote = await this.loadSales(companyId, quoteNumber, { lock: tx });
      if (!quote) return null;
      const { reference, row, write } = plan(quote, existing);
      const revision = await this.insertQuote(tx, companyId, reference, row);
      return { quote: await this.writeLifecycle(tx, quote, write), revision };
    });
    // As in withLockedQuote: an adoption made inside the transaction counts once it is committed.
    if (this.adoptions(companyId) !== adoptions) this.countAdoption(companyId);
    return result;
  }

  private countAdoption(companyId: string): void {
    this.adoptionsMade.set(companyId, this.adoptions(companyId) + 1);
  }

  // The live sales quotes of a company that a filter keeps.
  private matching(companyId: string, filter: SalesQuoteFilter, moment: ListMoment) {
    const { today } = moment;
    return and(
      eq(quoteTable.companyId, companyId),
      isNull(quoteTable.deletedAt),
      isSalesQuote,
      filter.statuses?.length ? inArray(shownStatus(today), filter.statuses) : undefined,
      filter.serviceType ? sql`${quoteTable.data}->>'serviceType' = ${filter.serviceType}` : undefined,
      filter.direction ? sql`${quoteTable.data}->>'direction' = ${filter.direction}` : undefined,
      onBusinessDays(quoteTable.createdAt, filter.createdFrom, filter.createdTo),
      onBusinessDays(quoteTable.decidedAt, filter.decidedFrom, filter.decidedTo),
      filter.ownerUserId === undefined
        ? undefined
        : filter.ownerUserId === null
          ? isNull(quoteTable.ownerUserId)
          : eq(quoteTable.ownerUserId, filter.ownerUserId),
      filter.customerId ? eq(quoteTable.customerId, filter.customerId) : undefined,
      filter.followUpDue ? followUpIsDue(moment) : undefined,
      filter.family
        ? or(eq(quoteTable.quoteNumber, filter.family), like(quoteTable.quoteNumber, `${escapeLike(filter.family)}-%`))
        : undefined,
      filter.hasShipment === undefined ? undefined : filter.hasShipment ? isNotNull(quoteTable.shipmentId) : isNull(quoteTable.shipmentId),
      // LIKE ALL: the searched text of a row is built once, then every word is looked for in it.
      filter.search?.length
        ? sql`${searchedText(today)} LIKE ALL (${textArray(filter.search.map((word) => `%${word}%`))})`
        : undefined,
    );
  }

  private liveSalesQuote(companyId: string, quoteNumber: string, expected: SavedVersion) {
    return and(
      eq(quoteTable.companyId, companyId),
      eq(quoteTable.quoteNumber, quoteNumber),
      isNull(quoteTable.deletedAt),
      isSalesQuote,
      eq(quoteTable.dataVersion, expected.dataVersion),
    );
  }

  private unexaminedOwner(companyId: string) {
    return and(eq(quoteTable.companyId, companyId), isSalesQuote, isNull(quoteTable.ownerUserId), isNull(quoteTable.ownerMatchCheckedAt));
  }
}

export const salesQuoteRepository = new SalesQuoteRepository();
