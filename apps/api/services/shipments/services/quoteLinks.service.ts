import log from "encore.dev/log";
import { quotes } from "~encore/clients";
import { SALES_REFERENCE_PATTERN, isSalesReference } from "../../../lib/salesReference";
import type { QuoteLinksSyncResult, QuoteSyncResult } from "../interfaces/interfaces";
import { shipmentRepository } from "../repositories/shipment.repository";

// A sales quote remembers the shipment made from it, and quotes live in another database: no
// transaction covers both. So a quote is never told "link" or "unlink" - it is told, for its
// reference, EVERY live shipment that carries it in the Sales Number, and takes its link from
// that (the quotes service). A call that was lost is then repaired by the next one, and the
// reconcile below finds the quotes whose link is wrong without anybody having to ask.
//
// The quote believes the list it was told last, so two reports about one reference must not
// overtake each other: the list is read and told under a lock on the reference
// (withLiveBySalesNumber). Every write of a shipment is committed before its quote is told, so
// whichever report runs last has read every write.

// How many references one run brings in step: it runs inside a request for the list of shipments.
const MAX_REFS_PER_RUN = 400;
// How often the links of a company are compared when nothing says they need it.
const SYNC_EVERY_MS = 60 * 60 * 1000;
// After a run that failed nothing is tried for this long.
const RETRY_AFTER_MS = 60 * 1000;

// What this process knows about the links of one company.
interface LinkSync {
  /** When the next run is due although nothing asks for it. */
  dueAt: number;
  /** No run before this moment: the last one failed. */
  notBefore: number;
  /** A quote could not be told about a shipment since the links were last compared. */
  dirty: boolean;
  /** The references a run that stopped at its limit left for the next one. */
  left: string[];
}

const NOTHING: QuoteLinksSyncResult = { linked: 0, unlinked: 0, unchanged: 0, quoteNotFound: 0, remaining: 0 };

class QuoteLinksService {
  private readonly companies = new Map<string, LinkSync>();

  private of(companyId: string): LinkSync {
    let company = this.companies.get(companyId);
    if (!company) {
      company = { dueAt: 0, notBefore: 0, dirty: false, left: [] };
      this.companies.set(companyId, company);
    }
    return company;
  }

  /**
   * Tells the quote a Sales Number names which live shipments carry that number - all of them,
   * the oldest first - and returns what the quote made of it. Null, without asking anybody, for
   * a Sales Number that is not a sales reference: free text is allowed there and links nothing.
   * `wonByShipmentId`: that shipment was created from the quote, which makes an open quote Won.
   * `automatic`: nobody asked for this - the quote's history says "System" instead of a user.
   */
  async syncReference(
    companyId: string,
    reference: string,
    opts: { wonByShipmentId?: string; automatic?: boolean } = {},
  ): Promise<QuoteSyncResult | null> {
    if (!isSalesReference(reference)) return null;
    // The quote is told while the lock on its reference is held: a list read earlier cannot
    // reach it after this one.
    return shipmentRepository.withLiveBySalesNumber(companyId, reference, async (shipments) => {
      const { results } = await quotes._internalSalesQuoteShipmentSync({
        items: [{ quoteNumber: reference, shipments, wonByShipmentId: opts.wonByShipmentId }],
        automatic: opts.automatic,
      });
      return results[0];
    });
  }

  /** A quote could not be told about a shipment: the links are compared again at the next occasion. */
  markDirty(companyId: string): void {
    this.of(companyId).dirty = true;
  }

  /**
   * Compares, in both directions, the shipments that name a quote with the shipment each quote
   * is linked to, and tells the quotes that differ: a reference whose oldest shipment is not the
   * quote's link, and a quote linked through a reference no live shipment names any more. That
   * links the shipments that carried a quote number before links existed, and repairs what a
   * failed call left behind. Nothing is marked Won by it.
   *
   * The two reads only find the references that differ. They are not one moment, and a run
   * takes its time: each quote is told what names it when its turn comes (syncReference), never
   * what was read here - a shipment created or deleted meanwhile is neither lost nor brought
   * back by the run.
   *
   * At most `maxRefs` references per run; what is left is where the next run goes on, so every
   * reference gets its turn - also behind references that come up each time because their quote
   * does not exist.
   */
  async reconcile(companyId: string, { maxRefs = MAX_REFS_PER_RUN }: { maxRefs?: number } = {}): Promise<QuoteLinksSyncResult> {
    const company = this.of(companyId);
    let todo = company.left;
    company.left = [];
    // Noted before anything is read: a sync that fails while this runs makes the next run compare again.
    if (!todo.length) company.dirty = false;

    const { links } = await quotes._internalSalesQuoteShipmentLinks();
    const current = new Map(links.map((link) => [link.quoteNumber, link.shipmentId]));

    if (!todo.length) {
      // The oldest live shipment of every reference: the one its quote should be linked to.
      const desired = new Map<string, string>();
      for (const { reference, id } of await shipmentRepository.salesReferenceShipments(companyId, SALES_REFERENCE_PATTERN)) {
        if (!desired.has(reference)) desired.set(reference, id);
      }
      todo = [
        ...[...desired].filter(([reference, oldest]) => oldest !== current.get(reference)).map(([reference]) => reference),
        ...[...current.keys()].filter((reference) => !desired.has(reference)),
      ];
    }

    const result = { ...NOTHING };
    for (const reference of todo.slice(0, maxRefs)) {
      const synced = await this.syncReference(companyId, reference, { automatic: true });
      // Nothing is told for a linked quote whose own number is not a sales reference.
      if (!synced) result.unchanged++;
      else if (!synced.found) result.quoteNotFound++;
      else if (synced.shipmentId === (current.get(reference) ?? null)) result.unchanged++;
      else if (synced.shipmentId) result.linked++;
      else result.unlinked++;
    }
    company.left = todo.slice(maxRefs);
    result.remaining = company.left.length;
    return result;
  }

  // Whether a run is due: an hour after the last one, or at once while the last one left
  // references over or a sync has failed since - but not right after a run that failed.
  private isDue(company: LinkSync, now: number): boolean {
    return now >= company.notBefore && (company.dirty || company.left.length > 0 || now >= company.dueAt);
  }

  // One run, with the note of when the next one is due.
  private async run(companyId: string): Promise<QuoteLinksSyncResult> {
    const company = this.of(companyId);
    // Set before the run: whoever asks while it is under way does not start another beside it.
    company.dueAt = Date.now() + SYNC_EVERY_MS;
    try {
      return await this.reconcile(companyId);
    } catch (err) {
      company.dirty = true;
      company.notBefore = Date.now() + RETRY_AFTER_MS;
      throw err;
    }
  }

  /**
   * What a read of the shipments list starts with: the links are reconciled when a run is due.
   * Awaited, so it runs under the login of the request - the quotes service takes the company
   * from it - and never fails its caller: a run that fails is logged and tried again later.
   */
  async ensureQuoteLinksSynced(companyId: string): Promise<void> {
    if (!this.isDue(this.of(companyId), Date.now())) return;
    try {
      await this.run(companyId);
    } catch (err) {
      log.warn(err, "the links between quotes and shipments were not reconciled", { companyId });
    }
  }

  /**
   * The same run when somebody asks for it: `ran` says whether one was due. With `force` it is
   * not asked whether one is due: everything is compared anew, and run after run until no
   * reference is left.
   */
  async sync(companyId: string, force: boolean): Promise<QuoteLinksSyncResult & { ran: boolean }> {
    const company = this.of(companyId);
    if (!force && !this.isDue(company, Date.now())) return { ran: false, ...NOTHING };
    if (force) company.left = [];
    const total = await this.run(companyId);
    while (force && total.remaining > 0) {
      const next = await this.run(companyId);
      total.linked += next.linked;
      total.unlinked += next.unlinked;
      total.unchanged += next.unchanged;
      total.quoteNotFound += next.quoteNotFound;
      total.remaining = next.remaining;
    }
    return { ran: true, ...total };
  }
}

export const quoteLinksService = new QuoteLinksService();
