import { APIError } from "encore.dev/api";
import { auth, fx, shipments, trucking } from "~encore/clients";
import { businessDay, isRealYmd } from "../../../lib/businessDate";
import type { PaginatedResponse } from "../../../lib/db/interface";
import type { Actor } from "../../../lib/rbac";
import { canApproveMargin, canSetOwner, quoteDeletePermission } from "../../../lib/salesPolicy";
import { baseReference, formatReference, nextSequence, nextVariant, salesPrefix } from "../../../lib/salesReference";
import { isUuid } from "../../../lib/uuid";
import type { RateLevelResult, ServiceLevelCode } from "../../trucking/interfaces/interfaces";
import type {
  CustomerOpenQuote,
  CustomerQuoteFacts,
  QuoteMarginApproval,
  QuoteRoadInput,
  QuoteShipmentsItem,
  QuoteShipmentsResult,
  SalesQuoteItem,
} from "../interfaces/interfaces";
import { quoteAttachmentRepository } from "../repositories/quoteAttachment.repository";
import { salesQuoteRepository, type NewSalesQuote, type SalesQuoteFilter, type SalesQuotePage } from "../repositories/salesQuote.repository";
import type { SalesQuoteRecord } from "../schemas/quote.schema";
import { matchOwnerLabel } from "../utils/ownerMatch.utils";
import { carryKeys, isPlainObject, newDocument } from "../utils/quoteDocument.utils";
import { fxWriteFor, mayStampFx, type StoredFx } from "../lib/quoteFx";
import { currenciesToResolve, formatMargin, marginGateMessage, roadMargin, roadMarginApplies, type MarginContext } from "../lib/roadMargin";
import { choosePricing, pricedComment, rateRequestOf, replaceTruckingLines, roadPricingOf, truckingLines } from "../lib/roadPricing";
import {
  LifecycleError,
  isShownStatus,
  applyFollowUp,
  applyOwner,
  applyShipmentLinks,
  applyTransition,
  applyValidity,
  columnsOf,
  deletionEntry,
  effectiveStatus,
  expectStatus,
  followUpDueBefore,
  mirrorOf,
  newQuote,
  pricingEntry,
  stateOf,
  wasEverSent,
  type LifecycleContext,
  type StatusChange,
} from "../utils/quoteLifecycle.utils";
import { searchTokens } from "../utils/quoteSearch.utils";
import { toItem } from "../utils/salesQuoteItem.utils";
import { ownerBackfillService } from "./ownerBackfill.service";
import { nameOf, userNames } from "../../../lib/userNames";

/** A change of status as the API takes it: the choice, and what the user's screen showed when it was made. */
export interface TransitionRequest extends StatusChange {
  /** The status the user saw - the one shown, so "expired" for a quote whose validity has passed. */
  expectedStatus?: string;
  /** The version of the document the user saw. */
  expectedDataVersion?: number;
}

/**
 * A list of sales quotes as the API takes it: which part, in which order, and the filters as the
 * query string carries them. A filter that is left out or empty does not narrow the list.
 */
export interface SalesQuoteListRequest {
  limit?: number;
  offset?: number;
  /** The id of the last quote already loaded (the nil id to begin with): the next rows in the order of their ids. Offset and sort then do not apply. */
  afterId?: string;
  /** A sort the list knows (SalesQuotePage); anything else sorts by creation. */
  sortBy?: string;
  sortDirection?: "asc" | "desc";
  search?: string;
  /** Statuses as shown, separated by commas. */
  statuses?: string;
  serviceType?: string;
  direction?: string;
  createdFrom?: string;
  createdTo?: string;
  decidedFrom?: string;
  decidedTo?: string;
  /** "me", "none" (no owner user) or the id of a user. */
  owner?: string;
  customerId?: string;
  followUp?: "due";
  /** Any reference of a family: its base quote and all variants. */
  familyOf?: string;
  /** true: only quotes a shipment names; false: only quotes none does. */
  hasShipment?: boolean;
}

/** A pricing of a quote from the trucking tariffs as the API takes it. */
export interface RoadPriceRequest {
  road: QuoteRoadInput;
  serviceLevel: ServiceLevelCode;
  /** The haulier to buy from; null = the engine's first candidate (preferred, then cheapest). */
  haulierCustomerId: string | null;
  expectedDataVersion: number;
}

const DEFAULT_LIMIT = 50;
// The statuses a quote is sent with: a margin below the floor must be approved before them.
const MARGIN_GATED_STATUSES: readonly string[] = ["ready_to_send", "quoted"];
// A won or lost quote is decided: it is not priced again.
const DECIDED_STATUSES: readonly string[] = ["won", "lost"];
const MIN_APPROVAL_REASON = 3;
const MAX_APPROVAL_REASON = 500;
const MAX_LIMIT = 200;
// How many quotes one call of the shipments service may bring in step with their shipments.
const MAX_SHIPMENT_SYNC_ITEMS = 200;

// Whatever of a request reaches SQL as an id or a day is checked here first: Postgres would
// answer a text that is neither with an error of its own.
function idOf(value: string, refusal: string): string {
  if (!isUuid(value)) throw APIError.invalidArgument(refusal);
  return value;
}

function dayOf(value: string | undefined, name: string): string | undefined {
  if (!value) return undefined;
  // Postgres has no year 0.
  if (!isRealYmd(value) || value < "0001-01-01") throw APIError.invalidArgument(`${name} must be a real date (YYYY-MM-DD)`);
  return value;
}

// The filter a request asks for. "me" is whoever asks.
function filterOf(actor: Actor, request: SalesQuoteListRequest): SalesQuoteFilter {
  const statuses = (request.statuses ?? "")
    .split(",")
    .map((status) => status.trim())
    .filter(Boolean);
  const unknown = statuses.find((status) => !isShownStatus(status));
  if (unknown !== undefined) throw APIError.invalidArgument(`"${unknown}" is not a quote status`);

  let ownerUserId: string | null | undefined;
  if (request.owner === "me") ownerUserId = actor.userID;
  else if (request.owner === "none") ownerUserId = null;
  else if (request.owner) ownerUserId = idOf(request.owner, 'owner must be "me", "none" or the id of a user');

  return {
    statuses,
    serviceType: request.serviceType,
    direction: request.direction,
    createdFrom: dayOf(request.createdFrom, "createdFrom"),
    createdTo: dayOf(request.createdTo, "createdTo"),
    decidedFrom: dayOf(request.decidedFrom, "decidedFrom"),
    decidedTo: dayOf(request.decidedTo, "decidedTo"),
    ownerUserId,
    customerId: request.customerId ? idOf(request.customerId, "customerId must be the id of a customer") : undefined,
    followUpDue: request.followUp === "due",
    // Asked with a variant, the family is still the one of its base.
    family: request.familyOf?.trim() ? baseReference(request.familyOf.trim()) : undefined,
    hasShipment: request.hasShipment,
    search: searchTokens(request.search ?? ""),
  };
}

// The part of the list a request asks for. The sort is passed on as it came: one the list does
// not know - a link or a saved view from another version - gives the newest first there instead
// of failing the request.
function pageOf(request: SalesQuoteListRequest): SalesQuotePage {
  const afterId = request.afterId ? idOf(request.afterId, "afterId must be the id of a quote") : undefined;
  return {
    limit: Math.min(Math.max(Math.trunc(request.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT),
    // Rows after an id are not counted from anywhere.
    offset: afterId ? 0 : Math.max(Math.trunc(request.offset ?? 0), 0),
    sortBy: request.sortBy ?? "createdAt",
    sortDirection: request.sortDirection ?? "desc",
    afterId,
  };
}

const notFound = () => APIError.notFound("Quote not found");
const conflict = () => APIError.aborted("the quote was changed by someone else since it was loaded");

// The rules refuse in words meant for the user; the API adds what kind of refusal it is.
function ruled<T>(run: () => T): T {
  try {
    return run();
  } catch (err) {
    if (err instanceof LifecycleError) {
      throw err.code === "invalid" ? APIError.invalidArgument(err.message) : APIError.failedPrecondition(err.message);
    }
    throw err;
  }
}

// Who acts, when, and under which name. A name that cannot be resolved stays empty: the history
// line then still records the user id.
function contextOf(actor: Actor, at: Date, names: Map<string, string>): LifecycleContext {
  return { at, today: businessDay(at), userId: actor.userID, userName: names.get(actor.userID) ?? "" };
}

// The row of a quote created now: a Draft of whoever creates it, in the columns and - as their
// mirror and the first history line - in the document.
function newRow(ctx: LifecycleContext, fields: Record<string, unknown>): (reference: string) => NewSalesQuote {
  const { state, entry } = newQuote(ctx);
  const lifecycle = { ...mirrorOf(state).set, timeline: [entry] };
  return (reference) => ({
    data: newDocument(reference, fields, lifecycle),
    ...columnsOf(state),
    // The owner is a user from the start: there is no text left to compare with the users.
    ownerMatchCheckedAt: ctx.at,
  });
}

// Today's ČNB rates and ROE % as a quote stores them when it is sent. Fetched before a quote is
// locked: a slow answer from the fx service must not hold the row lock and block every save of
// the quote. Rates are stamped even when ČNB's latest fixing is missing (fxRatesOn then answers
// with the last one it has); the stamp says which day it is.
async function todaysFx(): Promise<StoredFx> {
  const r = await fx.fxRatesOn({});
  return {
    date: r.date,
    fixingDate: r.fixingDate,
    roePct: r.roePct,
    rates: Object.fromEntries(r.rates.map((x) => [x.currency, x.rate])),
    lockedAt: new Date().toISOString(),
  };
}

// What the road margins of these quotes are judged with: the Trucking margin floor and today's ČNB
// rates of the currencies a quote has no stored rate for. Undefined - and nothing is asked - when
// the margin rule applies to none of them. A rate the fx service cannot give is missing: the
// margin then says so instead of the read failing. Read before any row lock (see todaysFx).
async function marginsFor(rows: { data: unknown }[], at: Date): Promise<MarginContext | undefined> {
  const applying = rows.filter((row) => roadMarginApplies(row.data));
  if (!applying.length) return undefined;
  const today = businessDay(at);
  const currencies = [...new Set(applying.flatMap((row) => currenciesToResolve(row.data)))];
  const [floor, rates] = await Promise.all([
    trucking._internalTruckingMarginFloor(),
    Promise.all(
      currencies.map((currency) =>
        /^[A-Z]{3}$/.test(currency)
          ? fx.fxResolve({ currency, date: today }).then((r) => r.rate, () => null)
          : Promise.resolve(null),
      ),
    ),
  ]);
  return { floor, today, rates: Object.fromEntries(currencies.map((currency, i) => [currency, rates[i] ?? null])) };
}

class SalesQuoteService {
  // What every read of sales quotes starts with: quotes written by code from before the server
  // owned the lifecycle get their columns, and owner texts nobody compared with the users yet
  // are matched to them.
  async catchUp(companyId: string): Promise<void> {
    await salesQuoteRepository.adoptPending(companyId);
    await ownerBackfillService.ensureOwnersMatched(companyId);
  }

  // A stored quote as the API hands it out. One whose owner is still a text nobody compared with
  // the users - older code wrote it and no list read has seen it since; as a rule this request
  // is what adopted it - is matched first: what the user may do with the owner is told from the
  // owner user, and PUT owner would judge such a text as the user it names.
  private async item(quote: SalesQuoteRecord, names: Map<string, string>, actor: Actor, at: Date): Promise<SalesQuoteItem> {
    let stored = quote;
    if (quote.ownerUserId === null && quote.ownerMatchCheckedAt === null) {
      await ownerBackfillService.matchOwners(actor.companyID);
      stored = (await salesQuoteRepository.loadSales(actor.companyID, quote.quoteNumber)) ?? quote;
    }
    return toItem(stored, names, actor, at, await marginsFor([stored], at));
  }

  // The sales quotes of the company: one page of a filtered, sorted list, or - with afterId -
  // the next rows by id for a caller that loads everything. Each quote is judged at one and the
  // same moment by the filter (in SQL) and by what it is handed out with (status shown,
  // follow-up flag), so the two cannot disagree. The total is the real number of matches.
  async list(actor: Actor, request: SalesQuoteListRequest): Promise<PaginatedResponse<SalesQuoteItem>> {
    const filter = filterOf(actor, request);
    const page = pageOf(request);
    await this.catchUp(actor.companyID);
    const at = new Date();
    const { rows, total } = await salesQuoteRepository.list(actor.companyID, filter, page, {
      today: businessDay(at),
      dueBefore: followUpDueBefore(at),
    });
    const [names, margins] = await Promise.all([userNames(), marginsFor(rows, at)]);
    return {
      pagination: { total, offset: page.offset, limit: page.limit },
      data: rows.map((row) => toItem(row, names, actor, at, margins)),
    };
  }

  async get(actor: Actor, quoteNumber: string): Promise<SalesQuoteItem> {
    await this.catchUp(actor.companyID);
    const quote = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!quote) throw notFound();
    return this.item(quote, await userNames(), actor, new Date());
  }

  // A new quote. The reference is assigned here, inside the insert, so two people creating at
  // once get two different numbers: QCZ + today's business day + that day's sequence.
  async create(actor: Actor, fields: Record<string, unknown>): Promise<SalesQuoteItem> {
    const at = new Date();
    const names = await userNames();
    const prefix = salesPrefix(businessDay(at));
    const quote = await salesQuoteRepository.createWithReference(
      actor.companyID,
      prefix,
      (existing) => formatReference(prefix, nextSequence(prefix, existing)),
      newRow(contextOf(actor, at, names), fields),
    );
    return toItem(quote, names, actor, at, await marginsFor([quote], at));
  }

  // A variant of an existing quote: its reference with the next free -2, -3, ... The content is
  // what the caller chose to copy; the variant is a new Draft of whoever made it.
  async duplicate(actor: Actor, quoteNumber: string, fields: Record<string, unknown>): Promise<SalesQuoteItem> {
    const source = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!source) throw notFound();
    // Variants always branch off the base, also when a variant is the one being duplicated.
    const base = baseReference(source.quoteNumber);
    const at = new Date();
    const names = await userNames();
    const quote = await salesQuoteRepository.createWithReference(
      actor.companyID,
      `${base}-`,
      (existing) => nextVariant(base, existing),
      newRow(contextOf(actor, at, names), fields),
    );
    return toItem(quote, names, actor, at, await marginsFor([quote], at));
  }

  // A save of the document by the Sales editor. Written only while the document is still the
  // version the editor loaded; status, validity, owner and history stay as stored whatever the
  // editor's copy holds.
  async save(actor: Actor, quoteNumber: string, data: Record<string, unknown>, expectedDataVersion: number): Promise<SalesQuoteItem> {
    const { companyID } = actor;
    // Loaded first, so a quote older code left without columns is adopted before the save looks for it.
    const stored = await salesQuoteRepository.loadSales(companyID, quoteNumber);
    if (!stored) throw notFound();
    if (stored.dataVersion !== expectedDataVersion) throw conflict();
    const saved = await salesQuoteRepository.saveDocument(
      companyID,
      quoteNumber,
      { data, carry: carryKeys() },
      { dataVersion: expectedDataVersion },
    );
    // Nothing was written: somebody saved, or deleted, the quote in this very moment.
    if (!saved) throw (await salesQuoteRepository.loadSales(companyID, quoteNumber)) ? conflict() : notFound();
    return this.item(saved, await userNames(), actor, new Date());
  }

  // A change of status, with everything it stamps and its history line. Setting the status the
  // quote already has changes nothing and says so.
  // OPEN DECISION (product owner): status, validity and follow-up writes check no role, so any
  // user of the company may move a colleague's quote. Only owner change and delete go through
  // salesPolicy. Add a canChangeLifecycle rule there if that is not intended.
  async transition(actor: Actor, quoteNumber: string, request: TransitionRequest): Promise<{ quote: SalesQuoteItem; changed: boolean }> {
    const at = new Date();
    const names = await userNames();
    const ctx = contextOf(actor, at, names);
    // Only a status the quote may be sent with can need them; read before the lock (see todaysFx).
    const today = mayStampFx(request.to) ? await todaysFx() : undefined;
    // So is what a road margin is judged with, for the statuses a margin below the floor blocks.
    const margins = MARGIN_GATED_STATUSES.includes(request.to) ? await this.marginsOf(actor.companyID, quoteNumber, at) : undefined;
    const result = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      if (request.expectedDataVersion !== undefined && request.expectedDataVersion !== quote.dataVersion) throw conflict();
      const state = stateOf(quote);
      const change = ruled(() => {
        if (request.expectedStatus !== undefined) expectStatus(state, request.expectedStatus, ctx.today);
        return applyTransition(state, request, ctx);
      });
      if (!change.changed) return { quote, changed: false };
      // A margin below the Trucking floor goes out only with a manager's approval that covers it.
      const margin = margins ? roadMargin(quote.data, margins) : null;
      if (margin?.needsApproval) throw APIError.failedPrecondition(marginGateMessage(margin));
      // The customer is given totals worked out with the ČNB rates and ROE % of the moment it is
      // sent: they are stored then and never change; back in a draft status they are dropped
      // (see lib/quoteFx). That writes the document, hence a new version of it - and only then.
      const document = fxWriteFor(change.state.status, quote.data, today);
      const written = await salesQuoteRepository.writeLifecycle(tx, quote, {
        state: change.state,
        entries: [change.entry],
        document,
      });
      return { quote: written, changed: true };
    });
    if (!result) throw notFound();
    return { quote: await this.item(result.quote, names, actor, at), changed: result.changed };
  }

  // What the road margin of a quote is judged with, read from the quote as it is before any lock.
  // The quote may change before it is locked; a currency it then needs and was not read counts as
  // a missing rate, never as converted at 1.
  private async marginsOf(companyId: string, quoteNumber: string, at: Date): Promise<MarginContext | undefined> {
    const quote = await salesQuoteRepository.loadSales(companyId, quoteNumber);
    return quote ? marginsFor([quote], at) : undefined;
  }

  // Prices the road transport of a quote from the trucking tariffs: the customer's sell price (or
  // the Standard list's) and the chosen haulier's buy price on one service level. The quote's
  // trucking lines are replaced by the new ones - every other line stays - and a margin approval
  // given before no longer holds. Rated before the lock: the trucking service is not called while
  // the row is held.
  async roadPrice(actor: Actor, quoteNumber: string, request: RoadPriceRequest): Promise<{ quote: SalesQuoteItem; result: RateLevelResult }> {
    const stored = await salesQuoteRepository.loadSales(actor.companyID, quoteNumber);
    if (!stored) throw notFound();
    const expectPriceable = (quote: SalesQuoteRecord) => {
      if (quote.dataVersion !== request.expectedDataVersion) throw conflict();
      if (DECIDED_STATUSES.includes(quote.status)) throw APIError.failedPrecondition("A won or lost quote cannot be priced again");
    };
    expectPriceable(stored);

    const at = new Date();
    const rated = await trucking.truckingRate(rateRequestOf(request.road, request.serviceLevel, stored.customerId, businessDay(at)));
    const result = rated.results.find((r) => r.serviceLevel === request.serviceLevel);
    if (!result) throw APIError.invalidArgument(`The service level ${request.serviceLevel} is not set up in Trucking`);
    const choice = choosePricing(result, request.haulierCustomerId);
    if (!choice.ok) throw APIError.invalidArgument(choice.reason);
    const { sell, buy } = choice;
    const roadPricing = roadPricingOf(result, sell, buy, rated.ratedAt);
    const sellLines = truckingLines(sell, result.serviceLevel);
    const buyLines = buy ? truckingLines(buy, result.serviceLevel, { name: buy.ownerName ?? "", customerId: buy.ownerCustomerId ?? "" }) : [];

    const names = await userNames();
    const ctx = contextOf(actor, at, names);
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      expectPriceable(quote);
      const data = isPlainObject(quote.data) ? quote.data : {};
      return salesQuoteRepository.writeLifecycle(tx, quote, {
        state: stateOf(quote),
        entries: [pricingEntry("road_price", pricedComment(roadPricing), ctx)],
        document: {
          road: request.road,
          roadPricing,
          sellingLines: replaceTruckingLines(data.sellingLines, sellLines),
          buyingLines: replaceTruckingLines(data.buyingLines, buyLines),
        },
        drop: ["marginApproval"],
      });
    });
    if (!written) throw notFound();
    return { quote: await this.item(written, names, actor, at), result };
  }

  // A manager approves the road margin of a quote that is below the Trucking floor: the margin as
  // it is now is stored with the approval, which covers it and any better one.
  async approveMargin(actor: Actor, quoteNumber: string, reason: string, expectedDataVersion: number): Promise<SalesQuoteItem> {
    if (!canApproveMargin(actor.role)) throw APIError.permissionDenied("only a manager can approve a margin below the floor");
    const why = reason.trim();
    if (why.length < MIN_APPROVAL_REASON || why.length > MAX_APPROVAL_REASON) {
      throw APIError.invalidArgument(`The reason must be ${MIN_APPROVAL_REASON} to ${MAX_APPROVAL_REASON} characters`);
    }
    const at = new Date();
    const [margins, names] = await Promise.all([this.marginsOf(actor.companyID, quoteNumber, at), userNames()]);
    const ctx = contextOf(actor, at, names);
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      if (quote.dataVersion !== expectedDataVersion) throw conflict();
      const margin = margins ? roadMargin(quote.data, margins) : null;
      if (!margin) throw APIError.failedPrecondition("This quote has no road margin to approve");
      if (!margin.belowFloor) throw APIError.failedPrecondition("The margin is above the floor; nothing to approve");
      // An unknown margin cannot be approved: the approval would cover nothing it could be compared with.
      if (margin.marginCzk === null) throw APIError.failedPrecondition(`The margin cannot be worked out: ${margin.problem}`);
      const approval: QuoteMarginApproval = {
        byUserId: actor.userID,
        byName: ctx.userName,
        at: at.toISOString(),
        reason: why,
        marginCzk: margin.marginCzk,
        marginPercent: margin.marginPercent,
      };
      const comment = `Margin approved: ${formatMargin(margin.marginCzk, margin.marginPercent)} - ${why}`;
      return salesQuoteRepository.writeLifecycle(tx, quote, {
        state: stateOf(quote),
        entries: [pricingEntry("margin_approval", comment, ctx)],
        document: { marginApproval: approval },
      });
    });
    if (!written) throw notFound();
    return this.item(written, names, actor, at);
  }

  // A new "Valid until" date, or none.
  async setValidity(actor: Actor, quoteNumber: string, validUntil: string | null): Promise<SalesQuoteItem> {
    const at = new Date();
    const names = await userNames();
    const ctx = contextOf(actor, at, names);
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const change = ruled(() => applyValidity(stateOf(quote), validUntil, ctx));
      if (!change.changed) return quote;
      return salesQuoteRepository.writeLifecycle(tx, quote, { state: change.state, entries: change.entry ? [change.entry] : [] });
    });
    if (!written) throw notFound();
    return this.item(written, names, actor, at);
  }

  // A contact with the customer that somebody records: the three days until the next follow-up
  // is due start again, and the history says who followed up and when. A lifecycle write like
  // the others - the document keeps its version, an open editor is not disturbed.
  async followUp(actor: Actor, quoteNumber: string, note?: string): Promise<SalesQuoteItem> {
    const at = new Date();
    const names = await userNames();
    const ctx = contextOf(actor, at, names);
    const written = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const { state, entry } = ruled(() => applyFollowUp(stateOf(quote), note, ctx));
      return salesQuoteRepository.writeLifecycle(tx, quote, { state, entries: [entry] });
    });
    if (!written) throw notFound();
    return this.item(written, names, actor, at);
  }

  // What the shipments service reports about quotes: for each reference EVERY live shipment that
  // names it. The quote is brought in step - link, history, and Won when one of the shipments
  // was created from it (applyShipmentLinks) - under the same lock and by the same write as any
  // other lifecycle action, each quote in a transaction of its own. A reference that is not a
  // live sales quote is answered as not found. `automatic`: a repair nobody asked for.
  async syncShipments(actor: Actor, items: QuoteShipmentsItem[], automatic = false): Promise<QuoteShipmentsResult[]> {
    if (items.length > MAX_SHIPMENT_SYNC_ITEMS) {
      throw APIError.invalidArgument(`at most ${MAX_SHIPMENT_SYNC_ITEMS} quotes can be synced in one call`);
    }
    for (const item of items) {
      for (const shipment of item.shipments) idOf(shipment.id, "a shipment must be named by its id");
    }
    const at = new Date();
    // A repair is recorded as the system's: nobody's name is looked up for it.
    const ctx = contextOf(actor, at, automatic ? new Map() : await userNames());
    // A quote a shipment was created from becomes Won here, and a Won quote is a sent one: it
    // keeps the rates stored when it was sent, or gets today's (read before any lock).
    const today = items.some((item) => item.wonByShipmentId) ? await todaysFx() : undefined;
    const results: QuoteShipmentsResult[] = [];
    for (const item of items) {
      const synced = await salesQuoteRepository.withLockedQuote(actor.companyID, item.quoteNumber, async (quote, tx) => {
        const change = applyShipmentLinks(
          stateOf(quote),
          isPlainObject(quote.data) ? quote.data.timeline : undefined,
          item.shipments,
          { wonByShipmentId: item.wonByShipmentId, automatic },
          ctx,
        );
        if (change.changed) {
          const document = change.becameWon ? fxWriteFor("won", quote.data, today) : undefined;
          await salesQuoteRepository.writeLifecycle(tx, quote, { state: change.state, entries: change.entries, document });
        }
        return change;
      });
      results.push({
        quoteNumber: item.quoteNumber,
        found: synced !== null,
        shipmentId: synced?.state.shipmentId ?? null,
        shipmentJobNumber: synced?.state.shipmentJobNumber ?? null,
        status: synced ? effectiveStatus(synced.state.status, synced.state.validUntil, ctx.today) : null,
        becameWon: synced?.becameWon ?? false,
        revertedTo: synced?.revertedTo ?? null,
        note: synced?.note ?? null,
      });
    }
    return results;
  }

  // Which shipment each of the company's quotes is linked to, for the shipments service to
  // compare with the shipments that name a quote. A quote older code left without columns has
  // no link and is not missed here.
  // Open quotes (not won or lost) road-priced with one of these trucking tariff versions, for the
  // tariff diff in Trucking. Quotes older code left without columns are adopted first.
  async countByTariffVersions(companyId: string, versionIds: string[]): Promise<number> {
    const ids = versionIds.filter((id) => typeof id === "string" && id.length > 0 && id.length <= 64).slice(0, 500);
    if (!ids.length) return 0;
    await salesQuoteRepository.adoptPending(companyId);
    return salesQuoteRepository.countOpenByTariffVersions(companyId, ids);
  }

  async shipmentLinks(companyId: string): Promise<{ quoteNumber: string; shipmentId: string }[]> {
    return salesQuoteRepository.shipmentLinks(companyId);
  }

  // What the company's quotes say about its customers, for the pipeline of the sales service:
  // for each customer whether a quote went out and when, and the quotes that are still open -
  // judged today, so an expired one is not among them - with what their value is worked out
  // from. Quotes older code left without columns are adopted first: the facts are read from the
  // columns.
  async customerFacts(companyId: string): Promise<{ customers: CustomerQuoteFacts[]; openQuotes: CustomerOpenQuote[]; quotesWithoutCustomer: number }> {
    await salesQuoteRepository.adoptPending(companyId);
    const [facts, openQuotes] = await Promise.all([
      salesQuoteRepository.customerFacts(companyId),
      salesQuoteRepository.openCustomerQuotes(companyId, businessDay(new Date())),
    ]);
    return {
      customers: facts.customers.map((customer) => ({
        customerId: customer.customerId,
        hasSentQuote: customer.sentQuotes > 0,
        sentQuotes: customer.sentQuotes,
        firstSentAt: customer.firstSentAt?.toISOString() ?? null,
        firstSentAtKnown: customer.firstSentAtKnown,
        sentQuotesWithoutDate: customer.sentQuotesWithoutDate,
        lastActivityAt: customer.lastActivityAt.toISOString(),
      })),
      openQuotes,
      quotesWithoutCustomer: facts.quotesWithoutCustomer,
    };
  }

  // A new owner - one of the company's users - or nobody. Who may do that is the policy's call.
  // Naming the owner the quote already has changes nothing and says so.
  async setOwner(actor: Actor, quoteNumber: string, ownerUserId: string | null): Promise<{ quote: SalesQuoteItem; changed: boolean }> {
    const at = new Date();
    // Read here and not through userNames(), which answers "nobody" when the users cannot be
    // read: an owner can only be chosen from users that were.
    const { users } = await auth.usersList();
    const owner = ownerUserId === null ? null : users.find((u) => u.id === ownerUserId);
    if (owner === undefined) throw APIError.invalidArgument("not a user of this company");
    const names = new Map(users.map((u) => [u.id, nameOf(u)]));
    const ctx = contextOf(actor, at, names);
    const result = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const state = stateOf(quote);
      // An owner text nobody compared with the users yet may name a colleague: the quote is
      // judged as theirs, so it cannot be taken in the gap before the matching has run.
      const currentOwner = state.ownerUserId ?? (quote.ownerMatchCheckedAt ? null : matchOwnerLabel(state.ownerLabel, users));
      if (!canSetOwner(actor, { ownerUserId: currentOwner }, ownerUserId)) {
        throw APIError.permissionDenied("only a manager can reassign this quote");
      }
      const change = applyOwner(state, owner && { userId: owner.id, name: nameOf(owner) }, ctx);
      if (!change.changed) return { quote, changed: false };
      const written = await salesQuoteRepository.writeLifecycle(tx, quote, { state: change.state, entries: [change.entry] });
      return { quote: written, changed: true };
    });
    if (!result) throw notFound();
    return { quote: await this.item(result.quote, names, actor, at), changed: result.changed };
  }

  // Deletes a quote: it is gone from Sales for everybody, while its row and history stay - who
  // deleted it and when is the last line - and its reference is never given out again. Who may
  // is the policy's call, made on the quote as locked; while a shipment is linked to it, nobody
  // may. Its attachments go in the same transaction.
  async delete(actor: Actor, quoteNumber: string): Promise<void> {
    // A shipment that names the quote in its Sales Number blocks the delete even when the quote's
    // own link is empty (a call that should have set it failed). Asked before the lock: the
    // shipments service is not called while the row is held.
    const { shipments: naming } = await shipments._internalShipmentsNamingQuote({ reference: quoteNumber });
    if (naming.length > 0) {
      throw APIError.failedPrecondition(
        `shipment ${naming.map((s) => s.jobNumber).join(", ")} names this quote in its Sales Number - change that first`,
      );
    }
    const at = new Date();
    const ctx = contextOf(actor, at, await userNames());
    const deleted = await salesQuoteRepository.withLockedQuote(actor.companyID, quoteNumber, async (quote, tx) => {
      const state = stateOf(quote);
      const everSent = wasEverSent(state, isPlainObject(quote.data) ? quote.data.timeline : undefined);
      const permission = quoteDeletePermission(actor, { ...state, everSent });
      if (!permission.allowed) {
        // While a shipment is linked nobody may, so it is the request that cannot be met as
        // things stand; otherwise it is this user who may not.
        throw permission.blockedBy === "shipment" ? APIError.failedPrecondition(permission.reason) : APIError.permissionDenied(permission.reason);
      }
      await salesQuoteRepository.writeLifecycle(tx, quote, { state, entries: [deletionEntry(ctx)], deleted: { by: actor.userID, at } });
      await quoteAttachmentRepository.deleteForQuote(tx, quote.quoteNumber, quote.companyId, at);
      return true;
    });
    if (!deleted) throw notFound();
  }
}

export const salesQuoteService = new SalesQuoteService();
