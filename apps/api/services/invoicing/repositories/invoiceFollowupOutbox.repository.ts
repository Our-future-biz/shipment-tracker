import { asc, inArray, sql } from "drizzle-orm";
import { db } from "../db/db";
import { invoiceFollowupOutboxTable, type InvoiceFollowupOutboxRecord, type NewInvoiceFollowupOutboxRecord } from "../schemas/invoiceFollowupOutbox.schema";
import { OutboxRepository } from "../../../lib/outbox/outboxRepository";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
const o = invoiceFollowupOutboxTable;

// What issued documents owe the customers and shipments services (schemas/invoiceFollowupOutbox).
// Claiming and settling come from the shared OutboxRepository; one shipment's rows go out in order.
class InvoiceFollowupOutboxRepository extends OutboxRepository<typeof invoiceFollowupOutboxTable> {
  constructor() {
    super(db, invoiceFollowupOutboxTable, "invoice_followup_outbox", { orderKey: "shipment_id", sentAfterCancelNote: "sent just before it was cancelled" });
  }

  // Written in the issue's own transaction: the document and what it owes commit together, or neither.
  async enqueue(tx: Tx, rows: NewInvoiceFollowupOutboxRecord[]) {
    if (!rows.length) return [];
    // Each row stamped with the clock as it is written (not the transaction's start, as now() would):
    // rows written together go out in the order they were made (the outbox orders by created_at).
    return tx.insert(o).values(rows.map((r) => ({ ...r, createdAt: sql`clock_timestamp()` }))).returning();
  }

  // Takes up to `limit` due rows; with `invoiceId`, only that document's (the send straight after issuing).
  async claimDue(limit: number, invoiceId?: string): Promise<InvoiceFollowupOutboxRecord[]> {
    const ids = await this.claimDueRows(limit, invoiceId ? sql`AND x.invoice_id = ${invoiceId}` : sql``);
    if (!ids.length) return [];
    return db.select().from(o).where(inArray(o.id, ids)).orderBy(asc(o.createdAt), asc(o.id));
  }
}

export const invoiceFollowupOutboxRepository = new InvoiceFollowupOutboxRepository();
