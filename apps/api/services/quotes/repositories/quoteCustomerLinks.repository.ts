import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { quoteTable } from "../schemas/quote.schema";
import { CUSTOMER_KEYS, HAND_TYPED_CONTACT, LINKED_COPY_STATUSES } from "../utils/customerLinks.utils";

// The writes that keep the customer copies of open quotes in step with the Customer Database. They
// change only those keys of the document: not the history, not updated_at (the customer's "last
// activity" in the pipeline and the Updated sort - a rename is no work on the quote) and not the
// document version, so an editor that has the quote open keeps saving; its save takes the copies
// from the Customer Database again (linkForSave), so it cannot bring an old name back.

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** The database, or a transaction of it. */
type Writer = typeof db | Tx;

/** What an open quote copies of its customer. */
export interface CustomerCopies {
  name: string;
  /** The account type; "" keeps the one the quotes have. */
  label: string;
}

/** What an open quote copies of its contact person. */
export interface ContactCopies {
  name: string;
  email: string;
  phone: string;
}

/**
 * Reads what to write from the Customer Database, once the change holds its turn (followCustomer).
 * null leaves the quotes as they are.
 */
export type CurrentCustomer = () => Promise<CustomerCopies | null>;

/**
 * The same for a contact (followContact). `gone`: the contact is deleted - its quotes keep these
 * values as typed text, unlinked. null leaves the quotes as they are.
 */
export type CurrentContact = () => Promise<(ContactCopies & { gone: boolean }) | null>;

// A list of keys as ONE parameter: drizzle would expand a JavaScript array into a placeholder per item.
const textArray = (keys: string[]) => sql`ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(keys)}::jsonb))`;

// copiesFollowCustomers in SQL: the open statuses, and the revision of a Won quote.
const followsCustomers = or(
  inArray(quoteTable.status, [...LINKED_COPY_STATUSES]),
  and(
    eq(quoteTable.status, "won"),
    sql`jsonb_typeof(${quoteTable.data}->'wonRevisionOf') = 'string'`,
    sql`${quoteTable.data}->>'wonRevisionOf' <> ''`,
  ),
);

// The company's live quotes whose copies follow the Customer Database. A row of the old quotes
// module has no status, so it is never among them.
const openQuotes = (companyId: string) => and(eq(quoteTable.companyId, companyId), isNull(quoteTable.deletedAt), followsCustomers);

const differs = (key: string, value: string) => sql`${quoteTable.data}->>${key}::text IS DISTINCT FROM ${value}::text`;

/** The document with `values` set (one jsonb object as one parameter). */
const withValues = (data: SQL, values: Record<string, string>) => sql`${data} || ${JSON.stringify(values)}::jsonb`;

// Changes of one customer (or one contact) take turns, and each reads the current values only once
// it has its turn (the lock lasts until the transaction ends). So a change that read older values
// never commits after one that read newer: events delivered late, twice or out of order leave the
// current values.
const takeTurn = (tx: Tx, key: string) => tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);

/** The customer keys of an open quote as stored (only those the document has). */
export interface OpenQuoteCopies {
  id: string;
  quoteNumber: string;
  customerId: string;
  doc: Record<string, unknown>;
}

class QuoteCustomerLinksRepository {
  /**
   * A customer change event: its open quotes take the name and account type `current` reads, in
   * one transaction under the customer's turn. Returns the ids of the quotes changed.
   */
  async followCustomer(companyId: string, customerId: string, current: CurrentCustomer): Promise<string[]> {
    return db.transaction(async (tx) => {
      await takeTurn(tx, `quotes-customer:${companyId}:${customerId}`);
      const copies = await current();
      return copies ? this.renameCustomer(tx, companyId, customerId, copies) : [];
    });
  }

  /**
   * A contact change event: the open quotes linked to the contact take the details `current`
   * reads - or, once the contact is gone, keep them as typed text without the link - in one
   * transaction under the contact's turn. Returns the ids of the quotes changed.
   */
  async followContact(companyId: string, customerId: string, contactId: string, current: CurrentContact): Promise<string[]> {
    return db.transaction(async (tx) => {
      await takeTurn(tx, `quotes-contact:${companyId}:${contactId}`);
      const found = await current();
      if (!found) return [];
      const { gone, ...contact } = found;
      return gone ? this.unlinkContact(tx, companyId, customerId, contactId, contact) : this.refreshContact(tx, companyId, customerId, contactId, contact);
    });
  }

  /**
   * The customer's open quotes take its name and account type, in one statement. A blank name
   * changes nothing (a copy is never blanked out); a blank account type keeps the stored one.
   * Returns the ids of the quotes changed; none when they have them already.
   */
  async renameCustomer(writer: Writer, companyId: string, customerId: string, copies: CustomerCopies): Promise<string[]> {
    const name = copies.name.trim();
    if (!name) return [];
    const label = copies.label.trim();
    const values: Record<string, string> = { [CUSTOMER_KEYS.customerName]: name };
    if (label) values[CUSTOMER_KEYS.customerLabel] = label;
    const rows = await writer
      .update(quoteTable)
      .set({ data: withValues(sql`${quoteTable.data}`, values) })
      .where(and(openQuotes(companyId), eq(quoteTable.customerId, customerId), or(...Object.entries(values).map(([key, value]) => differs(key, value)))))
      .returning({ id: quoteTable.id });
    return rows.map((r) => r.id);
  }

  /**
   * A contact person changed: the open quotes linked to them (data.customerContactId) take their
   * name, e-mail and phone, in one statement. Only quotes of the contact's own customer. A blank
   * name changes nothing.
   */
  async refreshContact(writer: Writer, companyId: string, customerId: string, contactId: string, contact: ContactCopies): Promise<string[]> {
    const name = contact.name.trim();
    if (!name) return [];
    const rows = await writer
      .update(quoteTable)
      .set({
        data: withValues(sql`${quoteTable.data}`, {
          [CUSTOMER_KEYS.customerContact]: name,
          [CUSTOMER_KEYS.customerEmail]: contact.email,
          [CUSTOMER_KEYS.customerPhone]: contact.phone,
        }),
      })
      .where(
        and(
          openQuotes(companyId),
          eq(quoteTable.customerId, customerId),
          sql`${quoteTable.data}->>'customerContactId' = ${contactId}::text`,
          or(
            differs(CUSTOMER_KEYS.customerContact, name),
            differs(CUSTOMER_KEYS.customerEmail, contact.email),
            differs(CUSTOMER_KEYS.customerPhone, contact.phone),
          ),
        ),
      )
      .returning({ id: quoteTable.id });
    return rows.map((r) => r.id);
  }

  /**
   * A contact person was deleted: the open quotes linked to them are marked as typed by hand ("")
   * so the backfill never links the name to somebody else - and, in the same statement, the quotes
   * of the contact's customer take its last name, e-mail and phone (`last`), so a rename made just
   * before the delete is not lost. A blank last name keeps the stored text.
   */
  async unlinkContact(writer: Writer, companyId: string, customerId: string, contactId: string, last: ContactCopies): Promise<string[]> {
    const unlinked = withValues(sql`${quoteTable.data}`, { [CUSTOMER_KEYS.customerContactId]: HAND_TYPED_CONTACT });
    const name = last.name.trim();
    const lastValues = { [CUSTOMER_KEYS.customerContact]: name, [CUSTOMER_KEYS.customerEmail]: last.email, [CUSTOMER_KEYS.customerPhone]: last.phone };
    const data = name ? sql`CASE WHEN ${quoteTable.customerId} = ${customerId}::uuid THEN ${withValues(unlinked, lastValues)} ELSE ${unlinked} END` : unlinked;
    const rows = await writer
      .update(quoteTable)
      .set({ data })
      .where(and(openQuotes(companyId), sql`${quoteTable.data}->>'customerContactId' = ${contactId}::text`))
      .returning({ id: quoteTable.id });
    return rows.map((r) => r.id);
  }

  /** The company's open quotes that name a customer record, with their customer keys as stored. */
  async openWithCustomer(companyId: string): Promise<OpenQuoteCopies[]> {
    const keys = Object.values(CUSTOMER_KEYS);
    const rows = await db
      .select({
        id: quoteTable.id,
        quoteNumber: quoteTable.quoteNumber,
        customerId: quoteTable.customerId,
        doc: sql<Record<string, unknown> | null>`(SELECT jsonb_object_agg(e.key, e.value) FROM jsonb_each(${quoteTable.data}) e WHERE e.key = ANY(${textArray(keys)}))`,
      })
      .from(quoteTable)
      .where(and(openQuotes(companyId), isNotNull(quoteTable.customerId)))
      .orderBy(quoteTable.quoteNumber);
    return rows.flatMap((r) => (r.customerId ? [{ id: r.id, quoteNumber: r.quoteNumber, customerId: r.customerId, doc: r.doc ?? {} }] : []));
  }

  /**
   * Sets customer keys of one open quote - only while it still names the customer and the contact
   * it was read with (`expected`), so an edit saved meanwhile is never overwritten. Whether it was
   * written.
   */
  async applyCopies(
    companyId: string,
    id: string,
    expected: { customerId: string; doc: Record<string, unknown> },
    change: { set: Record<string, string> },
  ): Promise<boolean> {
    const was = (key: string) =>
      sql`coalesce(${quoteTable.data}->${key}::text, 'null'::jsonb) = ${JSON.stringify(expected.doc[key] ?? null)}::jsonb`;
    const rows = await db
      .update(quoteTable)
      .set({ data: sql`${quoteTable.data} || ${JSON.stringify(change.set)}::jsonb` })
      .where(
        and(
          eq(quoteTable.id, id),
          openQuotes(companyId),
          eq(quoteTable.customerId, expected.customerId),
          was(CUSTOMER_KEYS.customerContactId),
          was(CUSTOMER_KEYS.customerContact),
        ),
      )
      .returning({ id: quoteTable.id });
    return rows.length > 0;
  }
}

export const quoteCustomerLinksRepository = new QuoteCustomerLinksRepository();
