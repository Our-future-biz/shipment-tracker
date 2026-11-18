import { and, desc, eq, isNull, type SQL } from "drizzle-orm";
import { db } from "../db/db";
import { receivableMailTable as m, receivableSettingsTable as s, type ReceivableMailRecord } from "../schemas/receivable.schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Writer = typeof db | Tx;

// What the app e-mailed to customers (receivable_mail, Accounts Receivable step 7): reminders and statements. A row is
// written as an attempt BEFORE the provider is called (status failed, "the send never finished"), under the mail's
// idempotency key, so two runs or two clicks can never send the same mail twice; it becomes sent when the provider
// took it, or keeps the provider's error.

export type NewMail = typeof m.$inferInsert;

class ReceivableMailRepository {
  async byKey(companyId: string, key: string): Promise<ReceivableMailRecord | null> {
    const [row] = await db
      .select()
      .from(m)
      .where(and(eq(m.companyId, companyId), eq(m.idempotencyKey, key), isNull(m.deletedAt)))
      .limit(1);
    return row ?? null;
  }

  /** Writes the attempt; null when its idempotency key is taken (another run or click has it). */
  async claim(values: NewMail): Promise<ReceivableMailRecord | null> {
    const [row] = await db.insert(m).values(values).onConflictDoNothing().returning();
    return row ?? null;
  }

  /** The provider took it (in the transaction given, with the reminder's note, or on its own). */
  async markSent(companyId: string, id: string, providerId: string, writer: Writer = db): Promise<void> {
    await writer
      .update(m)
      .set({ status: "sent", providerId, error: "", updatedAt: new Date() })
      .where(and(eq(m.companyId, companyId), eq(m.id, id)));
  }

  /**
   * The provider refused it or did not answer. `key`: the idempotency key it keeps from now on: the same (left out)
   * keeps the mail from being sent again; another one frees the mail's own key for a later try.
   */
  async markFailed(companyId: string, id: string, error: string, key?: string): Promise<void> {
    await db
      .update(m)
      .set({ status: "failed", error: error.slice(0, 500), ...(key !== undefined ? { idempotencyKey: key } : {}), updatedAt: new Date() })
      .where(and(eq(m.companyId, companyId), eq(m.id, id)));
  }

  /** The company's mails, newest first, of a customer and/or an invoice. */
  async list(companyId: string, filter: { customerId?: string; invoiceId?: string }, limit: number): Promise<ReceivableMailRecord[]> {
    const where: (SQL | undefined)[] = [eq(m.companyId, companyId), isNull(m.deletedAt)];
    if (filter.customerId) where.push(eq(m.customerId, filter.customerId));
    if (filter.invoiceId) where.push(eq(m.invoiceId, filter.invoiceId));
    return db
      .select()
      .from(m)
      .where(and(...where))
      .orderBy(desc(m.createdAt), desc(m.id))
      .limit(limit);
  }

  /** The companies that switched automatic reminders on (each one's settings are read again before its run). */
  async companiesWithAutoReminders(): Promise<string[]> {
    const rows = await db
      .select({ companyId: s.companyId })
      .from(s)
      .where(and(eq(s.autoReminders, true), isNull(s.deletedAt)));
    return [...new Set(rows.map((r) => r.companyId))];
  }
}

export const receivableMailRepository = new ReceivableMailRepository();
