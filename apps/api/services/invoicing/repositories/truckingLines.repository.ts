import { and, asc, eq, inArray, isNull, like, max, ne, notInArray, or, sql } from "drizzle-orm";
import log from "encore.dev/log";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../db/db";
import { invoiceCostTable, type NewInvoiceCostRecord } from "../schemas/invoiceCost.schema";
import { invoiceSellingCostTable, type InvoiceSellingCostRecord, type NewInvoiceSellingCostRecord } from "../schemas/invoiceSellingCost.schema";
import { invoiceRepository } from "./invoice.repository";
import type { AfterSellingSetWrite, SellingLineWrite } from "./sellingCost.repository";
import {
  anchoredQuoteRowOf,
  comesToNothing,
  creditSetsOf,
  differenceRef,
  differencesOf,
  firstAddedLike,
  firstAddedOf,
  isDifferenceOf,
  isQuoteAnchor,
  matchRealLines,
  nextDifferenceNumber,
  planBuyingReplace,
  planDifference,
  pricedOnQuote,
  quoteAnchorRef,
  quoteAnchorRow,
  ROAD_CODES,
  sellingReplaceable,
  setRefOf,
} from "../utils/truckingLines.utils";
import { realRowValues } from "../utils/truckingReal.utils";
import { qtyOrOne } from "../lib/invoiceCalc";
import type { TruckingLinesResult, TruckingRealLine } from "../interfaces/interfaces";
import type { OpenCreditDiff } from "../lib/partialCredit";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = typeof db | Tx;
type CostTable = typeof invoiceCostTable | typeof invoiceSellingCostTable;

/** Rows as a push writes them, without the shipment, company, tag and sort order. */
export type TruckingBuyingValues = Omit<NewInvoiceCostRecord, "companyId" | "shipmentId" | "sourceTruckingRef" | "sortOrder">;
export type TruckingSellingValues = Omit<NewInvoiceSellingCostRecord, "companyId" | "shipmentId" | "sourceTruckingRef" | "sortOrder">;

/** The advisory lock a push and an invoice issue of one shipment share (one at a time per shipment). */
export const truckingLinesLock = (tx: Tx, shipmentId: string) =>
  tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`trucking-lines:${shipmentId}`}))`);

const isRoad = (rows: { category?: string | null }[]) => rows.some((r) => (ROAD_CODES as readonly string[]).includes(String(r.category ?? "")));

/** A quote road selling line: copied from a quote, not pushed by Trucking, of a road code. */
const quoteRoadSelling = (companyId: string, shipmentId: string) => {
  const s = invoiceSellingCostTable;
  return and(
    eq(s.companyId, companyId),
    eq(s.shipmentId, shipmentId),
    isNull(s.deletedAt),
    isNull(s.sourceTruckingRef),
    sql`${s.sourceQuoteNumber} <> ''`,
    inArray(s.category, [...ROAD_CODES]),
  );
};

/** A row's value below nothing (a credit owed), in cents. */
const valueOf = (r: { qty: string | null; amount: string | null }) => Math.round(Number(r.amount ?? 0) * qtyOrOne(r.qty) * 100) / 100;

class TruckingLinesRepository {
  /**
   * Of the given selling rows, the ones still live (not soft-deleted). Called by an invoice issue
   * after taking the shipment's trucking-lines lock, so a Trucking push that replaced the rows
   * meanwhile is seen and the invoice is refused instead of billing rows that no longer exist.
   */
  async liveSellingIds(tx: Tx, companyId: string, shipmentId: string, ids: string[]): Promise<Set<string>> {
    return new Set((await this.liveSellingVersions(tx, companyId, shipmentId, ids)).keys());
  }

  /** The live rows among these, each with when it was last changed (ms), read in the caller's transaction. */
  async liveSellingVersions(tx: Tx, companyId: string, shipmentId: string, ids: string[]): Promise<Map<string, number>> {
    if (!ids.length) return new Map();
    const s = invoiceSellingCostTable;
    const rows = await tx
      .select({ id: s.id, updatedAt: s.updatedAt })
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), inArray(s.id, ids), isNull(s.deletedAt)));
    return new Map(rows.map((r) => [r.id, r.updatedAt.getTime()]));
  }

  /**
   * Replaces the live rows a Trucking sourceRef keeps in a shipment's Costs Breakdown, in one
   * transaction: the old rows are soft-deleted and the new ones added after the shipment's last
   * row. Selling rows of the ref already on an issued, not credited invoice are never touched -
   * then the set's own rows stay as they are, the answer counts them as kept, and what the price
   * changed by is billed as a difference line (planDifference: one per currency, replacing any
   * difference line not on an invoice yet). A consignment priced on the quote's invoiced road
   * line bills only its difference from it the same way (n8, pricedOnQuote).
   * Buying rows keep their real side (a haulier invoice approved, a statement issued): the new rows
   * take it over (planBuyingReplace), and a row with a real side no new row takes over is kept.
   * An advisory lock on the shipment keeps two pushes from interleaving.
   *
   * What the push did to the selling lines (taken away, added, a difference line) is handed to
   * `after` in the same transaction, so a job that read Invoiced follows a charge it no longer has
   * invoiced (services/sellingStatusFollow).
   */
  async replace(
    companyId: string,
    shipmentId: string,
    sourceRef: string,
    buying: TruckingBuyingValues[],
    selling: TruckingSellingValues[],
    differenceLabel = "Price change after invoice",
    after?: AfterSellingSetWrite,
  ): Promise<TruckingLinesResult> {
    return db.transaction(async (tx) => {
      await truckingLinesLock(tx, shipmentId);
      const writes: SellingLineWrite[] = [];
      const done = async (result: TruckingLinesResult) => {
        if (after && writes.length) await after(tx, writes);
        return result;
      };
      // Road lines copied from a quote are the estimate the consignment now prices: they go when
      // Trucking writes its own road lines of that side, or the cost or the charge is counted twice.
      // Each side by itself (Z1): an internal job's push brings only its buying line, and must not
      // take the customer's road charge away. Only untouched estimates go - nothing with a real cost,
      // a vendor invoice or on an invoice. A quote line a consignment was priced on, its invoice
      // credited since, goes with that consignment's next push, whatever it brings (and never with
      // another one's).
      const roadSelling = isRoad(selling);
      const roadBuying = isRoad(buying);
      const retired = await this.retireQuoteRoadEstimates(tx, companyId, shipmentId, sourceRef, { selling: roadSelling, buying: roadBuying });
      writes.push(...retired.map((before) => ({ before, now: null })));
      const of = (table: CostTable) =>
        and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), eq(table.sourceTruckingRef, sourceRef), isNull(table.deletedAt));

      // The selling set: the ref's rows, the difference lines added to it after an invoice, and the marker
      // of the quote road line it is priced on (n8, B1).
      const s = invoiceSellingCostTable;
      const inSet = or(eq(s.sourceTruckingRef, sourceRef), like(s.sourceTruckingRef, `${sourceRef}:diff:%`), like(s.sourceTruckingRef, `${sourceRef}:quote:%`));
      const ofSet = and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), inSet);
      const currentSelling = await tx
        .select({ id: s.id, ref: s.sourceTruckingRef, qty: s.qty, amount: s.amount, currency: s.currency, createdAt: s.createdAt })
        .from(s)
        .where(ofSet);
      const ownRows = currentSelling.filter((r) => r.ref === sourceRef);
      const differenceRows = currentSelling.filter((r) => isDifferenceOf(r.ref, sourceRef));
      const markers = currentSelling.filter((r) => isQuoteAnchor(r.ref, sourceRef));
      const quoteAnchor = sourceRef.startsWith("trucking:consignment:") && ownRows.length === 0 && (markers.length > 0 || differenceRows.length > 0 || roadSelling);
      const invoiced = currentSelling.length || quoteAnchor ? await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx) : new Set<string>();
      const sellingPlan = sellingReplaceable(currentSelling.map((r) => r.id), invoiced);
      // The quote's road line the customer was invoiced already, when this consignment is priced on it (n8).
      const anchor = quoteAnchor
        ? await this.quoteAnchorOf(tx, companyId, shipmentId, sourceRef, { ownRows: 0, differenceRows: differenceRows.length, markers, roadSelling }, invoiced)
        : [];
      // A marker bills nothing: no status follows it coming or going.
      const valued = (rows: InvoiceSellingCostRecord[]) => rows.filter((r) => !isQuoteAnchor(r.sourceTruckingRef));

      const now = new Date();
      const c = invoiceCostTable;
      const currentBuying = await tx
        .select({ id: c.id, description: c.description, realQty: c.realQty, realAmount: c.realAmount, realCurrency: c.realCurrency, invoiceNumber: c.invoiceNumber, received: c.received })
        .from(c)
        .where(of(c))
        .orderBy(asc(c.sortOrder), asc(c.createdAt));
      const plan = planBuyingReplace(currentBuying, buying);
      if (plan.keep.length) log.warn("invoicing: Trucking re-push kept buying rows with a real cost", { shipmentId, sourceRef, kept: plan.keep });
      // The new rows carry the estimate: a kept row keeps only its real side.
      if (plan.clearEstimate.length) await tx.update(c).set({ estAmount: "0.00", updatedAt: now }).where(and(of(c), inArray(c.id, plan.clearEstimate)));
      await tx
        .update(c)
        .set({ deletedAt: now, updatedAt: now })
        .where(plan.keep.length ? and(of(c), notInArray(c.id, plan.keep)) : of(c));
      if (plan.rows.length) {
        const next = await this.nextSort(tx, c, companyId, shipmentId);
        await tx.insert(c).values(plan.rows.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i })));
      }
      if (sellingPlan.replace && !anchor.length) {
        // Nothing of the set is invoiced (nor a quote line it was priced on): the new lines replace it,
        // difference lines and marker included. They keep the day the set first came on the job (m6).
        const firstAdded = firstAddedOf(currentSelling);
        const gone = await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(ofSet).returning();
        writes.push(...valued(gone).map((before) => ({ before, now: null })));
        if (selling.length) {
          const next = await this.nextSort(tx, s, companyId, shipmentId);
          const put = await tx
            .insert(s)
            .values(selling.map((row, i) => ({ ...row, companyId, shipmentId, sourceTruckingRef: sourceRef, sortOrder: next + i, ...(firstAdded ? { createdAt: firstAdded } : {}) })))
            .returning();
          writes.push(...put.map((now) => ({ before: null, now })));
        }
        return done({ buying: buying.length, selling: selling.length, sellingKept: 0, differences: [] });
      }
      // Priced on the quote's invoiced road line for the first time: the set says so with a marker per
      // line, so it stays priced on it whatever its price (one at the quote's price writes nothing else).
      const marked = new Set(markers.map((r) => anchoredQuoteRowOf(r.ref)));
      const unmarked = anchor.filter((q) => !marked.has(q.id));
      if (unmarked.length) {
        const next = await this.nextSort(tx, s, companyId, shipmentId);
        await tx
          .insert(s)
          .values(unmarked.map((q, i) => ({ ...quoteAnchorRow(q.currency), companyId, shipmentId, sourceTruckingRef: quoteAnchorRef(sourceRef, q.id), sortOrder: next + i })));
        log.info("invoicing: a Trucking consignment is priced on the quote's invoiced road line", { shipmentId, sourceRef, quoteLines: unmarked.length });
      }
      // The set (or the quote line it is priced on) is on an issued invoice: it stays, and only what
      // changed is billed as its own line (decision 9). A difference line on nothing yet is replaced.
      const fixed = [...ownRows, ...differenceRows.filter((r) => invoiced.has(r.id)), ...anchor];
      const open = differenceRows.filter((r) => !invoiced.has(r.id));
      const difference = planDifference(fixed, open, selling);
      const live = currentSelling.filter((r) => !open.includes(r));
      if (!difference.write) live.push(...open);
      else {
        if (open.length) {
          const gone = await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(and(ofSet, inArray(s.id, open.map((r) => r.id)))).returning();
          writes.push(...gone.map((before) => ({ before, now: null })));
        }
        if (difference.difference.length) {
          const everRefs = await tx.select({ ref: s.sourceTruckingRef }).from(s).where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), like(s.sourceTruckingRef, `${sourceRef}:diff:%`)));
          const ref = differenceRef(sourceRef, nextDifferenceNumber(sourceRef, everRefs.map((r) => r.ref)));
          const category = selling[0]?.category ?? "road_freight";
          const next = await this.nextSort(tx, s, companyId, shipmentId);
          // The price changed again before the difference was invoiced: still the one change, added when it first was (m6) -
          // in its currency and of its sign only (firstAddedLike).
          const rows = await tx
            .insert(s)
            .values(
              difference.difference.map((d, i) => {
                const firstAdded = firstAddedLike(open, d);
                return {
                category,
                description: differenceLabel,
                customer: differenceLabel,
                qty: "1.00",
                amount: d.amount.toFixed(2),
                currency: d.currency,
                invoice: true,
                companyId,
                shipmentId,
                sourceTruckingRef: ref,
                sortOrder: next + i,
                ...(firstAdded ? { createdAt: firstAdded } : {}),
                };
              }),
            )
            .returning();
          live.push(...rows.map((r) => ({ id: r.id, ref: r.sourceTruckingRef, qty: r.qty, amount: r.amount, currency: r.currency, createdAt: r.createdAt })));
          // A charge the issued invoice does not have (the job is no longer all invoiced), or a credit owed.
          writes.push(...rows.map((now) => ({ before: null, now })));
        }
        log.warn("invoicing: Trucking price changed after the invoice; the difference is its own line", { shipmentId, sourceRef, difference: difference.difference, pricedOnQuote: anchor.length > 0 });
      }
      return done({ buying: buying.length, selling: 0, sellingKept: sellingPlan.kept || anchor.length, differences: differencesOf(live, sourceRef) });
    });
  }

  /**
   * The invoiced quote road selling lines a consignment's set is priced on (pricedOnQuote), or none:
   * the set has no rows of its own, and either it was priced on them before - the lines its markers
   * name, still invoiced (B1); difference lines only, from before the markers - or this is the job's
   * first consignment with selling rows. A line another set's marker names is never this one's.
   */
  private async quoteAnchorOf(
    tx: Tx,
    companyId: string,
    shipmentId: string,
    sourceRef: string,
    set: { ownRows: number; differenceRows: number; markers: { ref: string | null }[]; roadSelling: boolean },
    invoiced: Set<string>,
  ) {
    const s = invoiceSellingCostTable;
    const quoteRows = await tx.select({ id: s.id, qty: s.qty, amount: s.amount, currency: s.currency }).from(s).where(quoteRoadSelling(companyId, shipmentId));
    const invoicedQuoteRoad = quoteRows.filter((r) => invoiced.has(r.id));
    if (set.markers.length) {
      // Anchored for good: the lines it names, while they are invoiced (credited, the set bills on its own again).
      const named = new Set(set.markers.map((m) => anchoredQuoteRowOf(m.ref)));
      return invoicedQuoteRoad.filter((r) => named.has(r.id));
    }
    if (!invoicedQuoteRoad.length) return [];
    // The other consignments' live rows (their markers too): one of them is priced, so this one is not the first.
    const others = await tx
      .select({ ref: s.sourceTruckingRef })
      .from(s)
      .where(
        and(
          eq(s.companyId, companyId),
          eq(s.shipmentId, shipmentId),
          isNull(s.deletedAt),
          like(s.sourceTruckingRef, "trucking:consignment:%"),
          ne(s.sourceTruckingRef, sourceRef),
          sql`${s.sourceTruckingRef} not like ${`${sourceRef}:%`}`,
        ),
      );
    const taken = new Set(others.map((r) => anchoredQuoteRowOf(r.ref)).filter((id): id is string => !!id));
    const free = invoicedQuoteRoad.filter((r) => !taken.has(r.id));
    return pricedOnQuote({ sourceRef, ...set, anchored: 0, otherConsignments: others.length > 0, invoicedQuoteRoad: free.length }) ? free : [];
  }

  /**
   * Sets (or, with no lines, clears) the real side of the live buying rows of a sourceRef under
   * the same shipment lock as a push: each line on the row with its description, else by position
   * (matchRealLines) - also when a re-push kept rows and the counts differ. Null (nothing written)
   * when the lines cannot be placed.
   */
  async setReal(companyId: string, shipmentId: string, sourceRef: string, lines: TruckingRealLine[]): Promise<number | null> {
    return db.transaction(async (tx) => {
      await truckingLinesLock(tx, shipmentId);
      const t = invoiceCostTable;
      const rows = await tx
        .select({ id: t.id, estQty: t.estQty, description: t.description, realAmount: t.realAmount, invoiceNumber: t.invoiceNumber })
        .from(t)
        .where(and(eq(t.companyId, companyId), eq(t.shipmentId, shipmentId), eq(t.sourceTruckingRef, sourceRef), isNull(t.deletedAt)))
        .orderBy(asc(t.sortOrder), asc(t.id));
      const plan = matchRealLines(rows, lines);
      if (!plan) return null;
      const now = new Date();
      for (const row of rows) {
        const line = plan.set.get(row.id);
        if (!line && !plan.clear.includes(row.id)) continue;
        await tx
          .update(t)
          .set({ ...realRowValues(line ?? null, row.estQty), updatedAt: now })
          .where(eq(t.id, row.id));
      }
      return plan.set.size + plan.clear.length;
    });
  }

  /**
   * Retires the quote's road estimates Trucking's own lines replace, of the sides it writes road lines
   * of (`which`); answers the selling rows it took away. A quote road selling line on an invoice stays.
   *
   * A quote road selling line a consignment's marker names (n8, B1) is that consignment's price of the
   * leg, once its invoice was credited or cancelled too: the set has only its marker, and the line, open
   * again, is what bills the leg on the next invoice. So another set's push never retires it (the leg
   * would be billed by nothing), and the push of the set that names it always does, whatever lines it
   * brings - its own price of the leg now (a cancelled one: none), or the line would bill the leg again.
   */
  private async retireQuoteRoadEstimates(
    tx: Tx,
    companyId: string,
    shipmentId: string,
    sourceRef: string,
    which: { selling: boolean; buying: boolean },
  ): Promise<InvoiceSellingCostRecord[]> {
    const now = new Date();
    const c = invoiceCostTable;
    const buying = which.buying
      ? await tx
          .update(c)
          .set({ deletedAt: now, updatedAt: now })
          .where(
            and(
              eq(c.companyId, companyId),
              eq(c.shipmentId, shipmentId),
              isNull(c.deletedAt),
              isNull(c.sourceTruckingRef),
              sql`${c.sourceQuoteNumber} <> ''`,
              inArray(c.category, [...ROAD_CODES]),
              isNull(c.realAmount),
              eq(c.invoiceNumber, ""),
              eq(c.received, false),
            ),
          )
          .returning({ id: c.id })
      : [];
    let selling: InvoiceSellingCostRecord[] = [];
    // Only a consignment's set has markers of its own; any road push must know the other sets'.
    if (which.selling || sourceRef.startsWith("trucking:consignment:")) {
      const s = invoiceSellingCostTable;
      const markers = await tx
        .select({ ref: s.sourceTruckingRef })
        .from(s)
        .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), like(s.sourceTruckingRef, "trucking:consignment:%:quote:%")));
      const ownNamed = new Set(markers.filter((m) => isQuoteAnchor(m.ref, sourceRef)).map((m) => anchoredQuoteRowOf(m.ref)));
      const otherNamed = new Set(markers.filter((m) => !isQuoteAnchor(m.ref, sourceRef)).map((m) => anchoredQuoteRowOf(m.ref)));
      const candidates = which.selling || ownNamed.size ? await tx.select({ id: s.id }).from(s).where(quoteRoadSelling(companyId, shipmentId)) : [];
      const invoiced = candidates.length ? await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx) : new Set<string>();
      const sellingIds = candidates.map((r) => r.id).filter((id) => !invoiced.has(id) && !otherNamed.has(id) && (which.selling || ownNamed.has(id)));
      selling = sellingIds.length ? await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(inArray(s.id, sellingIds)).returning() : [];
    }
    if (buying.length || selling.length) {
      log.info("invoicing: quote road estimates replaced by Trucking's lines", { shipmentId, buying: buying.length, selling: selling.length });
    }
    return selling;
  }

  /**
   * The credits owed a partial credit note of invoice lines made from the given selling rows settles
   * (lib/partialCredit settleTruckingCredit) - by the row, in the order it settles them: first the
   * Trucking difference lines below nothing of the set the row belongs to (a price lowered after the
   * invoice; the invoiced quote road line a consignment is priced on belongs to that consignment's set,
   * M2), then every other line of the job below nothing on no document billing it - another set's
   * difference line, a discount entered after the invoice.
   *
   * Why every one: each such line is a credit owed (lib/billingQueue countCreditsOwed, invoiceRepository
   * creditOwedShipmentIds), and issuing refuses an invoice that would only give it back - "give it on a
   * credit note of the invoice". A credit note that left it open would leave it ticked for the next
   * invoice, which takes it off again: the customer credited twice. So a credit given while the job is
   * owed one gives that first (its own set's before any other, as Trucking's price change of the line
   * credited is the likeliest reason); only what goes beyond it is a credit of its own. Left out: the
   * rows a master job's split keeps (the split writes them, not a settlement), and a credit note's own
   * rows (open again only when their invoice was credited in full: billed again with its lines).
   */
  async openCreditDiffs(reader: Reader, companyId: string, shipmentId: string, rowIds: string[]): Promise<Map<string, OpenCreditDiff[]>> {
    const out = new Map<string, OpenCreditDiff[]>();
    const ids = [...new Set(rowIds)];
    if (!ids.length) return out;
    const s = invoiceSellingCostTable;
    const below = (
      await reader
        .select({ id: s.id, ref: s.sourceTruckingRef, qty: s.qty, amount: s.amount, currency: s.currency, updatedAt: s.updatedAt })
        .from(s)
        .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), isNull(s.sourceMasterJobRef), isNull(s.sourceCreditNoteId)))
        .orderBy(asc(s.sortOrder), asc(s.createdAt))
    ).filter((r) => valueOf(r) < 0);
    if (!below.length) return out;
    const invoiced = await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, reader);
    const open = below.filter((r) => !invoiced.has(r.id));
    if (!open.length) return out;
    const sources = await reader
      .select({
        id: s.id,
        ref: s.sourceTruckingRef,
        quoteRoad: sql<boolean>`(${s.sourceTruckingRef} is null and ${s.sourceQuoteNumber} <> '' and ${inArray(s.category, [...ROAD_CODES])})`,
      })
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), inArray(s.id, ids)));
    // Only when a quote road line is credited are the job's consignment rows read: to find the set priced on it.
    const consignmentRows = sources.some((r) => r.quoteRoad === true)
      ? await reader
          .select({ ref: s.sourceTruckingRef })
          .from(s)
          .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), like(s.sourceTruckingRef, "trucking:consignment:%")))
      : [];
    const setOf = creditSetsOf(
      sources.map((r) => ({ ...r, quoteRoad: r.quoteRoad === true })),
      consignmentRows,
    );
    const owed = (d: (typeof open)[number]): OpenCreditDiff => ({ id: d.id, ref: d.ref, currency: d.currency, amount: valueOf(d), version: d.updatedAt.getTime() });
    for (const rowId of ids) {
      const set = setOf.get(rowId);
      const ofSet = set ? open.filter((d) => isDifferenceOf(d.ref, set)) : [];
      out.set(rowId, [...ofSet, ...open.filter((d) => !ofSet.includes(d))].map(owed));
    }
    return out;
  }

  /**
   * Whether a selling line of the shipment that a credit owed is made of was written after `since` (mock test
   * S20-195). A partial credit note is asked on the credits owed of that moment; Trucking's price changed while
   * the request waited (a "Price change after invoice" replaced, taken away or added), or a line below nothing
   * entered or changed since, and the lines asked no longer settle what they were asked for. Seen: a row below
   * nothing written since, the rows taken away too (a credit owed that is gone keeps its amount), and a line
   * entered by hand changed in place since whatever it is now - it may have been below nothing before, and only
   * today's value is kept (the safe side: the request is asked again). Not seen here: what invoice lines do to
   * whether a row is owed - one billed on an invoice or settled by a credit note since, or owed again once its
   * invoice was credited or cancelled - writes no row (invoiceRepository.documentsChangedSince reads that). A row
   * on a credit note, or kept by a master job's split, is no credit owed.
   */
  async creditsOwedChangedSince(reader: Reader, companyId: string, shipmentId: string, since: Date): Promise<boolean> {
    const s = invoiceSellingCostTable;
    const after = since.toISOString();
    const written = await reader
      .select({ qty: s.qty, amount: s.amount, ref: s.sourceTruckingRef, createdAt: s.createdAt, deletedAt: s.deletedAt })
      .from(s)
      .where(
        and(
          eq(s.companyId, companyId),
          eq(s.shipmentId, shipmentId),
          isNull(s.sourceMasterJobRef),
          isNull(s.sourceCreditNoteId),
          sql`${s.updatedAt} > ${after}`,
        ),
      );
    // Trucking never changes a row in place (its rows are replaced; settleDiffs only lowers one below nothing), and a
    // row added since was not there to be owed: only a hand line older than the request, still live, is read by its edit.
    const editedByHand = (r: (typeof written)[number]) => r.ref === null && !r.deletedAt && r.createdAt.getTime() <= since.getTime();
    return written.some((r) => valueOf(r) < 0 || editedByHand(r));
  }

  /**
   * What a partial credit note did to the credits owed it settles (lib/partialCredit
   * settleTruckingCredit), in its own transaction: a line settled in part comes down to what was
   * credited (`shrink`), and what is left of it stays owed as a line of its own (`rest`) - of a
   * Trucking set, a difference line of the set, so the set still comes to Trucking's price and a
   * re-push bills nothing again; of a line kept by hand, a line like it. A rest comes with the
   * id it is written under when a later line of the same credit note settles it (m8): that line bills it.
   */
  async settleDiffs(
    tx: Tx,
    companyId: string,
    shipmentId: string,
    shrink: { id: string; amount: number }[],
    rest: { fromId: string; amount: number; id?: string }[],
  ): Promise<void> {
    const s = invoiceSellingCostTable;
    const now = new Date();
    for (const { id, amount } of shrink) {
      await tx.update(s).set({ qty: "1.00", amount: (-amount).toFixed(2), updatedAt: now }).where(and(eq(s.id, id), eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt)));
    }
    for (const { fromId, amount, id } of rest) {
      const [from] = await tx.select().from(s).where(and(eq(s.id, fromId), eq(s.companyId, companyId)));
      if (!from) continue;
      const setRef = setRefOf(from.sourceTruckingRef);
      const everRefs = setRef
        ? await tx.select({ ref: s.sourceTruckingRef }).from(s).where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), like(s.sourceTruckingRef, `${setRef}:diff:%`)))
        : [];
      const next = await this.nextSort(tx, s, companyId, shipmentId);
      await tx.insert(s).values({
        ...(id ? { id } : {}),
        companyId,
        shipmentId,
        category: from.category,
        description: from.description,
        customer: from.customer,
        qty: "1.00",
        amount: (-amount).toFixed(2),
        currency: from.currency,
        invoice: from.invoice,
        vatCode: from.vatCode,
        sourceTruckingRef: setRef ? differenceRef(setRef, nextDifferenceNumber(setRef, everRefs.map((r) => r.ref))) : null,
        sortOrder: next,
      });
    }
  }

  /**
   * After an invoice was credited in full or cancelled (in that transaction): the Trucking selling
   * sets of the shipment that are on no invoice any more and come to nothing in every currency - a
   * consignment cancelled after the invoice, its difference line taking back all it billed - are
   * retired, with the invoiced quote road line a set was priced on (n8). They could never be invoiced
   * again (an invoice of nothing is refused), and Trucking prices nothing for them any more.
   */
  async retireNettedSets(tx: Tx, companyId: string, shipmentId: string): Promise<InvoiceSellingCostRecord[]> {
    const s = invoiceSellingCostTable;
    const rows = await tx
      .select({ id: s.id, ref: s.sourceTruckingRef, qty: s.qty, amount: s.amount, currency: s.currency })
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), like(s.sourceTruckingRef, "trucking:%")));
    const diffSets = [...new Set(rows.filter((r) => r.ref?.includes(":diff:")).map((r) => setRefOf(r.ref)!))];
    if (!diffSets.length) return [];
    const invoiced = await invoiceRepository.invoicedSellingRowIds(shipmentId, companyId, tx);
    const quote = await tx.select({ id: s.id, qty: s.qty, amount: s.amount, currency: s.currency }).from(s).where(quoteRoadSelling(companyId, shipmentId));
    const retire: string[] = [];
    for (const set of diffSets) {
      const ofSet = rows.filter((r) => setRefOf(r.ref) === set);
      // A set priced on the quote's road line has no rows of its own: the line is part of what it comes to -
      // the lines its markers name (B1), or, priced on it before the markers, every quote road line.
      const named = new Set(ofSet.map((r) => anchoredQuoteRowOf(r.ref)).filter((id): id is string => !!id));
      const group = ofSet.some((r) => r.ref === set) ? ofSet : [...ofSet, ...(named.size ? quote.filter((q) => named.has(q.id)) : quote)];
      if (group.some((r) => invoiced.has(r.id)) || !comesToNothing(group)) continue;
      retire.push(...group.map((r) => r.id).filter((id) => !retire.includes(id)));
    }
    if (!retire.length) return [];
    const now = new Date();
    const gone = await tx.update(s).set({ deletedAt: now, updatedAt: now }).where(and(eq(s.companyId, companyId), inArray(s.id, retire), isNull(s.deletedAt))).returning();
    log.info("invoicing: Trucking sets that come to nothing retired after the invoice was credited", { shipmentId, rows: gone.length });
    return gone;
  }

  /** Whether Trucking keeps a live buying row of any of these codes on the shipment. */
  async hasBuyingOfCategories(companyId: string, shipmentId: string, categories: string[]): Promise<boolean> {
    const c = invoiceCostTable;
    const [row] = await db
      .select({ id: c.id })
      .from(c)
      .where(and(eq(c.companyId, companyId), eq(c.shipmentId, shipmentId), inArray(c.category, categories), isNull(c.deletedAt), like(c.sourceTruckingRef, "trucking:%")))
      .limit(1);
    return !!row;
  }

  /** Of these shipments, the charge codes (of `categories`) Trucking keeps live buying rows of, as "shipmentId category" keys. */
  async keptBuyingCodes(companyId: string, shipmentIds: string[], categories: string[]): Promise<Set<string>> {
    if (!shipmentIds.length || !categories.length) return new Set();
    const c = invoiceCostTable;
    const rows = await db
      .selectDistinct({ shipmentId: c.shipmentId, category: c.category })
      .from(c)
      .where(and(eq(c.companyId, companyId), inArray(c.shipmentId, shipmentIds), inArray(c.category, categories), isNull(c.deletedAt), like(c.sourceTruckingRef, "trucking:%")));
    return new Set(rows.map((r) => `${r.shipmentId} ${r.category}`));
  }

  /**
   * Runs `work` while holding the shipment's trucking-lines lock (the lock a Trucking push takes):
   * a check and the write after it can't interleave with a push. The work's own writes commit on
   * their own connection while the lock is still held, so the push that waits sees them.
   */
  async withShipmentLock<T>(shipmentId: string, work: () => Promise<T>): Promise<T> {
    return db.transaction(async (tx) => {
      await truckingLinesLock(tx, shipmentId);
      return work();
    });
  }

  /** Whether the shipment has a consignment of Trucking (live selling rows "trucking:consignment:…"). */
  async hasConsignmentRows(companyId: string, shipmentId: string): Promise<boolean> {
    const s = invoiceSellingCostTable;
    const [row] = await db
      .select({ id: s.id })
      .from(s)
      .where(and(eq(s.companyId, companyId), eq(s.shipmentId, shipmentId), isNull(s.deletedAt), like(s.sourceTruckingRef, "trucking:consignment:%")))
      .limit(1);
    return !!row;
  }

  // One more than the last sort order of the shipment's live rows on that side.
  private async nextSort(tx: Tx, table: CostTable, companyId: string, shipmentId: string): Promise<number> {
    const [found] = await tx
      .select({ last: max(table.sortOrder) })
      .from(table as PgTable)
      .where(and(eq(table.companyId, companyId), eq(table.shipmentId, shipmentId), isNull(table.deletedAt)));
    return found?.last == null ? 0 : found.last + 1;
  }
}

export const truckingLinesRepository = new TruckingLinesRepository();
