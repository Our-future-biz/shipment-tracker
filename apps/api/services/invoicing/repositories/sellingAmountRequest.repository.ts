import { and, desc, eq, gte, inArray, isNotNull, isNull, ne, or } from "drizzle-orm";
import { db } from "../db/db";
import { centsOf, needsApproval } from "../lib/sellingAmount";
import { invoiceCostTable } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable as s, type InvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import { sellingAmountRequestTable as t, type SellingAmountRequestRecord } from "../schemas/sellingAmountRequest.schema";
import { invoiceRepository } from "./invoice.repository";
import { truckingLinesLock } from "./truckingLines.repository";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A selling row the split keeps, live, of this shipment. */
const soldAtCostRow = (id: string, companyId: string, shipmentId: string) =>
  and(eq(s.id, id), eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt));

/**
 * What the shipment's share of the row's line costs: its real cost, or else its estimate. Null when
 * the share has gone, or is in another currency than the row (the split not processed since the
 * real cost came in another currency): the row's number can't be held against it until it is.
 */
async function costOf(tx: Tx, row: InvoiceSellingCostRecord): Promise<string | null> {
  if (!row.sourceMasterJobRef) return null;
  const c = invoiceCostTable;
  const [share] = await tx
    .select({ real: c.realAmount, realCurrency: c.realCurrency, est: c.estAmount, estCurrency: c.estCurrency })
    .from(c)
    .where(and(eq(c.companyId, row.companyId), eq(c.shipmentId, row.shipmentId), eq(c.sourceMasterJobRef, row.sourceMasterJobRef), isNull(c.deletedAt)))
    .limit(1);
  if (!share) return null;
  const [amount, currency] = share.real != null ? [share.real, share.realCurrency] : [share.est, share.estCurrency];
  return amount != null && currency === row.currency ? amount : null;
}

export type AmountChange =
  | { outcome: "not_found" }
  | { outcome: "invoiced" }
  | { outcome: "no_cost" }
  | { outcome: "reason_needed"; cost: string }
  | { outcome: "already_waiting" }
  | { outcome: "saved"; row: InvoiceSellingCostRecord }
  | { outcome: "asked"; request: SellingAmountRequestRecord };

export type AnswerResult =
  | { outcome: "not_found" }
  | { outcome: "answered_already"; request: SellingAmountRequestRecord }
  | { outcome: "invoiced" }
  | { outcome: "row_gone" }
  | { outcome: "cost_changed"; cost: string }
  | { outcome: "done"; request: SellingAmountRequestRecord };

class SellingAmountRequestRepository {
  /**
   * The number of a selling row the split keeps: at or above its cost it is written at once (and any
   * request waiting is taken back, this says otherwise); below it a request goes to a manager and the
   * row stays as it is. Under the shipment's invoice lock, so a row can't change while an invoice with
   * it is being issued.
   */
  async change(
    companyId: string,
    shipmentId: string,
    sellingId: string,
    input: { amount: string; reason: string; userId: string; userEmail: string; jobNumber: string },
  ): Promise<AmountChange> {
    return db.transaction(async (tx): Promise<AmountChange> => {
      await truckingLinesLock(tx, shipmentId);
      const [row] = await tx.select().from(s).where(soldAtCostRow(sellingId, companyId, shipmentId)).limit(1);
      if (!row?.sourceMasterJobRef) return { outcome: "not_found" };
      if ((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx)).has(row.id)) return { outcome: "invoiced" };
      const cost = await costOf(tx, row);
      if (cost == null) return { outcome: "no_cost" };
      const now = new Date();
      if (!needsApproval(input.amount, cost)) {
        const [saved] = await tx
          .update(s)
          // The same as the cost is no number of its own: the row follows its cost again.
          .set({ amount: input.amount, amountOverrideCost: centsOf(input.amount) === centsOf(cost) ? null : cost, updatedAt: now })
          .where(and(eq(s.id, row.id), eq(s.companyId, companyId)))
          .returning();
        await this.withdrawFor(tx, companyId, [row.id], { id: input.userId, name: input.userEmail });
        return { outcome: "saved", row: saved! };
      }
      if (!input.reason) return { outcome: "reason_needed", cost };
      const [request] = await tx
        .insert(t)
        .values({
          companyId,
          shipmentId,
          jobNumber: input.jobNumber,
          sellingCostId: row.id,
          category: row.category,
          currency: row.currency,
          costAmount: cost,
          currentAmount: row.amount,
          requestedAmount: input.amount,
          reason: input.reason,
          requestedById: input.userId,
          requestedByName: input.userEmail,
          requestedAt: now,
        })
        .onConflictDoNothing()
        .returning();
      return request ? { outcome: "asked", request } : { outcome: "already_waiting" };
    });
  }

  /** Asks a manager to take a selling row the split keeps off the shipment. The row stays until a manager approves. */
  async askRemoval(
    companyId: string,
    shipmentId: string,
    sellingId: string,
    input: { reason: string; userId: string; userEmail: string; jobNumber: string },
  ): Promise<AmountChange> {
    return db.transaction(async (tx): Promise<AmountChange> => {
      await truckingLinesLock(tx, shipmentId);
      const [row] = await tx.select().from(s).where(soldAtCostRow(sellingId, companyId, shipmentId)).limit(1);
      if (!row?.sourceMasterJobRef) return { outcome: "not_found" };
      if ((await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx)).has(row.id)) return { outcome: "invoiced" };
      const cost = await costOf(tx, row);
      if (cost == null) return { outcome: "no_cost" };
      const [request] = await tx
        .insert(t)
        .values({
          companyId,
          shipmentId,
          jobNumber: input.jobNumber,
          sellingCostId: row.id,
          kind: "remove",
          category: row.category,
          currency: row.currency,
          costAmount: cost,
          currentAmount: row.amount,
          requestedAmount: "0.00",
          reason: input.reason,
          requestedById: input.userId,
          requestedByName: input.userEmail,
          requestedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning();
      return request ? { outcome: "asked", request } : { outcome: "already_waiting" };
    });
  }

  /** A manager's answer. An approval writes the row, unless it is on an invoice, gone, or its cost moved since it was asked. */
  async answer(
    companyId: string,
    id: string,
    answer: { approve: boolean; comment: string; userId: string; userEmail: string },
  ): Promise<AnswerResult> {
    const [found] = await db.select({ shipmentId: t.shipmentId }).from(t).where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt))).limit(1);
    if (!found) return { outcome: "not_found" };
    return db.transaction(async (tx): Promise<AnswerResult> => {
      await truckingLinesLock(tx, found.shipmentId);
      const [request] = await tx.select().from(t).where(and(eq(t.id, id), eq(t.companyId, companyId))).limit(1);
      if (!request) return { outcome: "not_found" };
      if (request.status !== "pending") return { outcome: "answered_already", request };
      const now = new Date();
      if (answer.approve) {
        const [row] = await tx.select().from(s).where(soldAtCostRow(request.sellingCostId, companyId, request.shipmentId)).limit(1);
        if (!row) return { outcome: "row_gone" };
        if ((await invoiceRepository.invoicedSellingRowIds(request.shipmentId, companyId, tx)).has(row.id)) return { outcome: "invoiced" };
        const cost = await costOf(tx, row);
        if (cost == null) return { outcome: "row_gone" };
        // What was approved is this amount at this cost, in this currency: a cost that moved is another question.
        if (centsOf(cost) !== centsOf(request.costAmount) || row.currency !== request.currency) return { outcome: "cost_changed", cost: `${cost} ${row.currency}` };
        await tx
          .update(s)
          .set(
            request.kind === "remove"
              ? // Deleted and remembered: processing the split doesn't put it back at this cost.
                { deletedAt: now, waivedAt: now, amountOverrideCost: cost, updatedAt: now }
              : { amount: request.requestedAmount, amountOverrideCost: cost, updatedAt: now },
          )
          .where(and(eq(s.id, row.id), eq(s.companyId, companyId), isNull(s.deletedAt)));
      }
      const [done] = await tx
        .update(t)
        .set({
          status: answer.approve ? "approved" : "rejected",
          decidedById: answer.userId,
          decidedByName: answer.userEmail,
          decidedAt: now,
          comment: answer.comment,
          selfDecision: request.requestedById === answer.userId,
          updatedAt: now,
        })
        .where(and(eq(t.id, id), eq(t.companyId, companyId)))
        .returning();
      return { outcome: "done", request: done! };
    });
  }

  /** Takes these rows' waiting requests back: the row said otherwise, or left the split. */
  async withdrawFor(tx: Tx, companyId: string, sellingIds: string[], by?: { id: string; name: string }): Promise<void> {
    if (!sellingIds.length) return;
    const now = new Date();
    await tx
      .update(t)
      .set({ status: "withdrawn", decidedById: by?.id ?? null, decidedByName: by?.name ?? "", updatedAt: now })
      .where(and(eq(t.companyId, companyId), inArray(t.sellingCostId, sellingIds), eq(t.status, "pending"), isNull(t.deletedAt)));
  }

  async byId(companyId: string, id: string): Promise<SellingAmountRequestRecord | null> {
    const [row] = await db.select().from(t).where(and(eq(t.id, id), eq(t.companyId, companyId), isNull(t.deletedAt))).limit(1);
    return row ?? null;
  }

  /** Takes one waiting request back; null when it no longer waits. */
  async withdraw(companyId: string, id: string, by: { id: string; name: string }): Promise<SellingAmountRequestRecord | null> {
    const [row] = await db
      .update(t)
      .set({ status: "withdrawn", decidedById: by.id, decidedByName: by.name, updatedAt: new Date() })
      .where(and(eq(t.id, id), eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .returning();
    return row ?? null;
  }

  /** What waits, and what was answered since, newest first (taken back ones are not an answer). */
  async list(companyId: string, since: Date, limit: number): Promise<SellingAmountRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), isNull(t.deletedAt), or(eq(t.status, "pending"), and(ne(t.status, "withdrawn"), gte(t.decidedAt, since)))))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /** What waits for a manager, newest first (the bell). */
  async pending(companyId: string, limit: number): Promise<SellingAmountRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.status, "pending"), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt))
      .limit(limit);
  }

  /**
   * Answers to what this user asked, for their bell: unread ones since `since`, read ones since
   * `seenSince`. The one who answered is not told their own answer.
   */
  async answersFor(companyId: string, userId: string, since: Date, seenSince: Date, limit: number): Promise<SellingAmountRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(
        and(
          eq(t.companyId, companyId),
          isNull(t.deletedAt),
          eq(t.requestedById, userId),
          inArray(t.status, ["approved", "rejected"]),
          ne(t.decidedById, userId),
          gte(t.decidedAt, since),
          or(isNull(t.answerSeenAt), gte(t.answerSeenAt, seenSince)),
        ),
      )
      .orderBy(desc(t.decidedAt))
      .limit(limit);
  }

  /** The one who asked opened these answers. */
  async markSeen(companyId: string, userId: string, ids: string[], at: Date): Promise<void> {
    if (!ids.length) return;
    await db
      .update(t)
      .set({ answerSeenAt: at })
      .where(and(eq(t.companyId, companyId), eq(t.requestedById, userId), inArray(t.id, ids), isNull(t.answerSeenAt), isNotNull(t.decidedAt)));
  }

  /** A shipment's requests, newest first. */
  async ofShipment(companyId: string, shipmentId: string): Promise<SellingAmountRequestRecord[]> {
    return db
      .select()
      .from(t)
      .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), isNull(t.deletedAt)))
      .orderBy(desc(t.requestedAt))
      .limit(100);
  }
}

export const sellingAmountRequestRepository = new SellingAmountRequestRepository();
